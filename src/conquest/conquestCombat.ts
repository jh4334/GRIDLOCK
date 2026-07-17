// 정복 전투 시스템 — 진영 간 전투를 한곳에서 해석한다(update/render 분리, render 읽기 전용).
//   1) 근접 유닛 타겟팅·교전: 사거리 내 (1)적 유닛 우선 (2)없으면 적 건물/HQ. 접촉 시 공격.
//   2) 명령 이동: 교전 대상이 없으면 명령 경로를 따라가고(공격 이동), 경로가 없으면 집결지 방어.
//   3) 포탑 사격: 사거리 내 적 진영 유닛에게 투사체 발사(투사체는 대상을 유도, 명중 시 데미지).
//
// 유닛·건물·HQ는 모두 Combatant를 구현한다. HP 차감만 여기서 하고, 벽 해제·인구 갱신 등
// 파괴 부수효과와 죽은 엔티티 제거는 월드가 담당한다(관심사 분리). 수치는 conquest.json.

import conquestData from '../data/conquest.json';
import { findPath } from '../systems/astar';
import { cellCenter } from '../game/grid';
import { walkableNeighbors } from './conquestMap';
import type { ConquestGrid } from './conquestMap';
import type { CombatUnit, Combatant, Pt } from './combatUnit';
import type { Building } from './building';
import type { HQ } from './hq';

const C = conquestData;
const PROJ_LIFE_MISS = 0.4; // 대상 소멸 후 투사체가 직진하다 사라지는 최대 시간(초).

// 전투가 이펙트·사운드를 직접 그리지 않도록 발생 시점만 훅으로 알린다(코디네이터가 배선).
export interface CombatHooks {
  onUnitKilled?(x: number, y: number, color: string): void;
  onProjectileHit?(): void;
}

interface Proj {
  x: number;
  y: number;
  speed: number;
  radius: number;
  color: string;
  damage: number;
  target: Combatant | null;
  ax: number; // 마지막으로 알던 대상 위치(대상 소멸 시 직진 목표).
  ay: number;
  miss: number; // 대상 소멸 후 남은 직진 시간.
  dead: boolean;
}

export class ConquestCombat {
  private projectiles: Proj[] = [];

  constructor(private cb: CombatHooks = {}) {}

  reset(): void {
    this.projectiles = [];
  }

  update(dt: number, units: CombatUnit[], buildings: Building[], playerHQ: HQ, enemyHQ: HQ): void {
    for (const u of units) if (!u.dead) this.updateUnit(dt, u, units, buildings, playerHQ, enemyHQ);
    this.fireTurrets(dt, buildings, units);
    this.updateProjectiles(dt);
  }

  // ── 근접 유닛 1기 ────────────────────────────────────────────
  private updateUnit(dt: number, u: CombatUnit, units: CombatUnit[], buildings: Building[], playerHQ: HQ, enemyHQ: HQ): void {
    const radius = C.unit.engageRadius;
    const r2 = radius * radius;

    // (1) 사거리 내 최근접 적 유닛 우선.
    let target: Combatant | null = this.nearestEnemyUnit(u, units, r2);
    // (2) 없으면 사거리 내 적 건물/HQ(명령 타겟이 유효하면 그쪽 우선).
    if (!target) target = this.nearestEnemyStructure(u, buildings, playerHQ, enemyHQ, r2);

    if (target) {
      this.engage(dt, u, target);
      return;
    }
    // 교전 대상 없음 → 명령 경로 추종, 없으면 집결지 방어.
    if (u.path.length > 0) u.followPath(dt);
    else u.moveToward(u.guardX, u.guardY, dt);
  }

  private engage(dt: number, u: CombatUnit, target: Combatant): void {
    const contact = u.radius + target.radius + C.unit.contactPad;
    const dx = target.x - u.x;
    const dy = target.y - u.y;
    const dist = Math.hypot(dx, dy);
    if (dist > contact) {
      u.moveToward(target.x, target.y, dt); // 접근.
      return;
    }
    u.attackCooldown -= dt;
    if (u.attackCooldown <= 0) {
      u.attackCooldown = 1 / u.attackRate;
      target.hp -= u.damage;
      if (target.hp <= 0 && !target.structure) {
        const victim = target as CombatUnit;
        if (!victim.dead) {
          victim.dead = true;
          this.cb.onUnitKilled?.(victim.x, victim.y, victim.color);
        }
      }
    }
  }

  private nearestEnemyUnit(u: CombatUnit, units: CombatUnit[], r2: number): CombatUnit | null {
    let best: CombatUnit | null = null;
    let bestD = r2;
    for (const e of units) {
      if (e.dead || e.side === u.side) continue;
      const d2 = (e.x - u.x) ** 2 + (e.y - u.y) ** 2;
      if (d2 <= bestD) {
        bestD = d2;
        best = e;
      }
    }
    return best;
  }

  private nearestEnemyStructure(u: CombatUnit, buildings: Building[], playerHQ: HQ, enemyHQ: HQ, r2: number): Combatant | null {
    let best: Combatant | null = null;
    let bestD = r2;
    const consider = (c: Combatant): void => {
      if (c.dead || c.side === u.side) return;
      const d2 = (c.x - u.x) ** 2 + (c.y - u.y) ** 2;
      if (d2 <= bestD) {
        bestD = d2;
        best = c;
      }
    };
    for (const b of buildings) if (b.complete) consider(b);
    consider(playerHQ);
    consider(enemyHQ);
    return best;
  }

  // ── 포탑 사격 ────────────────────────────────────────────────
  private fireTurrets(dt: number, buildings: Building[], units: CombatUnit[]): void {
    const T = C.buildings.turret;
    for (const b of buildings) {
      if (!b.isTurret || !b.complete || b.destroyed) continue;
      if (b.cooldown > 0) b.cooldown -= dt;
      if (b.cooldown > 0) continue;
      const target = this.nearestUnitInRange(b, units, T.range);
      if (!target) continue;
      b.cooldown = 1 / T.fireRate;
      this.projectiles.push({
        x: b.x,
        y: b.y,
        speed: T.projectileSpeed,
        radius: T.projectileRadius,
        color: b.side === 'player' ? T.playerProjectileColor : T.enemyProjectileColor,
        damage: T.damage,
        target,
        ax: target.x,
        ay: target.y,
        miss: PROJ_LIFE_MISS,
        dead: false,
      });
    }
  }

  private nearestUnitInRange(b: Building, units: CombatUnit[], range: number): CombatUnit | null {
    let best: CombatUnit | null = null;
    let bestD = range * range;
    for (const e of units) {
      if (e.dead || e.side === b.side) continue;
      const d2 = (e.x - b.x) ** 2 + (e.y - b.y) ** 2;
      if (d2 <= bestD) {
        bestD = d2;
        best = e;
      }
    }
    return best;
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      if (p.target && !p.target.dead) {
        p.ax = p.target.x;
        p.ay = p.target.y;
      } else {
        p.target = null;
        p.miss -= dt;
        if (p.miss <= 0) p.dead = true;
      }
      const ddx = p.ax - p.x;
      const ddy = p.ay - p.y;
      const d = Math.hypot(ddx, ddy);
      const step = p.speed * dt;
      const hitR = p.radius + (p.target ? p.target.radius : 0);
      if (p.target && (d <= step || d <= hitR)) {
        p.target.hp -= p.damage; // 명중 — 데미지(처치 판정은 월드가 죽은 유닛 제거로 처리).
        if (p.target.hp <= 0 && !p.target.structure) {
          const v = p.target as CombatUnit;
          if (!v.dead) {
            v.dead = true;
            this.cb.onUnitKilled?.(v.x, v.y, v.color);
          }
        }
        this.cb.onProjectileHit?.();
        p.dead = true;
        continue;
      }
      if (d > 0) {
        p.x += (ddx / d) * step;
        p.y += (ddy / d) * step;
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const p of this.projectiles) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** 구조물(벽 칸) 옆 통행 칸으로 가는 최단 경로(칸 중심 웨이포인트). 없으면 null. */
export function pathToStructure(grid: ConquestGrid, from: { cx: number; cy: number }, cx: number, cy: number): Pt[] | null {
  let best: Pt[] | null = null;
  let bestLen = Infinity;
  for (const nb of walkableNeighbors(grid, cx, cy)) {
    const p = findPath(grid, from, nb);
    if (p === null) continue;
    if (p.length < bestLen) {
      bestLen = p.length;
      best = p.map((c) => cellCenter(c.cx, c.cy));
    }
  }
  return best;
}

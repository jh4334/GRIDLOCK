// 전투 시스템 — M4의 배선을 game.ts에서 분리해 담는다.
//   1) 타워별 발사 쿨다운 관리 + 사거리 내 "가장 앞선 적" 타겟팅/발사
//   2) 투사체 갱신 + 명중 판정 → 데미지/처치 골드/스플래시/슬로우 적용
//   3) 캐논 폭발 시각효과(확장·페이드 링)
//
// update(dt, ...)에서만 상태를 변경하고 render(ctx)는 읽기 전용(CLAUDE.md 규칙).
// 죽은 적은 game.ts가, 명중한 투사체는 이 시스템이 프레임 끝 filter로 일괄 제거.

import type { Tower, TowerKind } from '../entities/tower';
import type { Enemy } from '../entities/enemy';
import type { Economy } from '../game/economy';
import type { FlowField } from './pathfinding';
import { Projectile } from '../entities/projectile';
import { cellCenter } from '../game/grid';

// 캐논 폭발 시각효과(밸런스 아님, 시각 상수). 파티클 시스템은 M6이므로 최소한만.
const EXPLOSION_DURATION = 0.2; // 확장·페이드 지속(초).
const EXPLOSION_COLOR = '#ffb066';

interface Explosion {
  x: number;
  y: number;
  radius: number; // 최대 반경(= splashRadius).
  timer: number; // 남은 시간(초).
}

// 전투가 이펙트·사운드를 직접 그리지 않도록, 발생 시점만 훅으로 알린다(Game이 배선).
// combat은 좌표·값만 넘기고, 이펙트/오디오/화면흔들림 연결은 Game의 책임.
export interface CombatCallbacks {
  onFire?(kind: TowerKind, x: number, y: number): void; // 타워 발사 순간.
  onDamage?(x: number, y: number, amount: number): void; // 명중 지점 데미지(스플래시는 적마다).
  onKill?(x: number, y: number, color: string): void; // 적 처치 순간.
  onCannonHit?(x: number, y: number): void; // 캐논 폭발(화면흔들림·붐).
}

export class CombatSystem {
  private projectiles: Projectile[] = [];
  private explosions: Explosion[] = [];

  constructor(private cb: CombatCallbacks = {}) {}

  /** 재시작 — 진행 중인 투사체·폭발을 모두 비운다. */
  reset(): void {
    this.projectiles = [];
    this.explosions = [];
  }

  update(dt: number, towers: Tower[], enemies: Enemy[], economy: Economy, field: FlowField): void {
    this.fireTowers(dt, towers, enemies, field);
    this.updateProjectiles(dt, enemies, economy);
    this.updateExplosions(dt);
  }

  // 타워별 쿨다운 감소 → 준비되면 사거리 내 가장 앞선 적에게 발사.
  private fireTowers(dt: number, towers: Tower[], enemies: Enemy[], field: FlowField): void {
    for (const t of towers) {
      if (t.cooldown > 0) t.cooldown -= dt;
      if (t.cooldown > 0) continue;

      const center = cellCenter(t.cx, t.cy);
      // 사거리·공격력·슬로우 지속은 레벨 반영 실효 스탯 사용(M7 업그레이드).
      const target = this.pickTarget(center.x, center.y, t.effectiveRange, enemies, field);
      if (!target) continue;

      this.projectiles.push(
        new Projectile({
          x: center.x,
          y: center.y,
          speed: t.spec.projectileSpeed,
          radius: t.spec.projectileRadius,
          color: t.spec.projectileColor,
          target,
          damage: t.effectiveDamage,
          splashRadius: t.spec.splashRadius ?? 0,
          slowFactor: t.spec.slowFactor ?? 0,
          slowDuration: t.effectiveSlowDuration,
        }),
      );
      t.cooldown = 1 / t.spec.fireRate; // fireRate 회/s → 1/fireRate 초 간격.
      this.cb.onFire?.(t.kind, center.x, center.y);
    }
  }

  // 사거리(px, 타워 칸 중심 기준) 내 살아있고 도달 가능한 적 중 가장 앞선 적.
  // 우선순위: distanceToBase(BFS 거리) 최소 → 동률이면 다음 칸 중심까지 남은 픽셀 거리 최소.
  private pickTarget(x: number, y: number, range: number, enemies: Enemy[], field: FlowField): Enemy | null {
    let best: Enemy | null = null;
    let bestDist = Infinity;
    let bestPix = Infinity;
    const r2 = range * range;

    for (const e of enemies) {
      if (e.dead || e.reachedBase) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy > r2) continue; // 사거리 밖.
      const d = e.distanceToBase(field);
      if (d < 0) continue; // 도달 불가(벽에 갇힘 등).
      const pix = e.distanceToNextCenter();
      if (d < bestDist || (d === bestDist && pix < bestPix)) {
        best = e;
        bestDist = d;
        bestPix = pix;
      }
    }
    return best;
  }

  private updateProjectiles(dt: number, enemies: Enemy[], economy: Economy): void {
    for (const p of this.projectiles) {
      p.update(dt);
      if (p.arrived) this.resolveHit(p, enemies, economy);
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  // 명중 해석. 스플래시면 지점 반경 내 전 적에게, 아니면 단일 대상에게 적용.
  private resolveHit(p: Projectile, enemies: Enemy[], economy: Economy): void {
    if (p.splashRadius > 0) {
      // 캐논: 명중 지점 기준 splashRadius 내 모든 적(대상 포함)에게 동일 데미지.
      const r2 = p.splashRadius * p.splashRadius;
      for (const e of enemies) {
        if (e.dead || e.reachedBase) continue;
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        if (dx * dx + dy * dy <= r2) this.applyHit(e, p, economy);
      }
      this.explosions.push({ x: p.x, y: p.y, radius: p.splashRadius, timer: EXPLOSION_DURATION });
      this.cb.onCannonHit?.(p.x, p.y); // 화면흔들림·붐 트리거.
    } else {
      // 단일 타격: 대상이 아직 살아있을 때만(먼저 죽었으면 지점 도달 후 그냥 소멸).
      const e = p.hitTarget;
      if (e && !e.dead && !e.reachedBase) this.applyHit(e, p, economy);
    }
  }

  // 데미지 → 처치 시 골드(1회) → 슬로우. 처치 골드는 dead 전환 순간에만 지급.
  private applyHit(e: Enemy, p: Projectile, economy: Economy): void {
    if (p.slowFactor > 0) e.applySlow(p.slowFactor, p.slowDuration);
    e.hp -= p.damage;
    this.cb.onDamage?.(e.x, e.y, p.damage); // 명중 지점 데미지 팝업.
    if (e.hp <= 0 && !e.dead) {
      e.dead = true;
      economy.addGold(e.reward);
      this.cb.onKill?.(e.x, e.y, e.color); // 처치 파티클·처치음.
    }
  }

  private updateExplosions(dt: number): void {
    for (const ex of this.explosions) ex.timer -= dt;
    this.explosions = this.explosions.filter((ex) => ex.timer > 0);
  }

  // 폭발 링(확장·페이드) → 투사체 순으로 그린다.
  render(ctx: CanvasRenderingContext2D): void {
    for (const ex of this.explosions) {
      const life = ex.timer / EXPLOSION_DURATION; // 1 → 0.
      const progress = 1 - life; // 0 → 1 (반경 확장).
      ctx.save();
      ctx.globalAlpha = life * 0.7; // 시간에 따라 페이드아웃.
      ctx.strokeStyle = EXPLOSION_COLOR;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, ex.radius * progress, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const p of this.projectiles) p.render(ctx);
  }
}

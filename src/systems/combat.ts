// 전투 시스템 — M4의 배선을 game.ts에서 분리해 담는다.
//   1) 타워별 발사 쿨다운 관리 + 사거리 내 "가장 앞선 적" 타겟팅/발사
//   2) 투사체 갱신 + 명중 판정 → 데미지/처치 골드/스플래시/슬로우 적용
//   3) 캐논 폭발 시각효과(확장·페이드 링)
//   4) 4레벨 스페셜 분기(D4.2) — 관통·대폭발/잔류화염·빙결/광역화·처형/이중사격
//
// update(dt, ...)에서만 상태를 변경하고 render(ctx)는 읽기 전용(CLAUDE.md 규칙).
// 죽은 적은 game.ts가, 명중한 투사체는 이 시스템이 프레임 끝 filter로 일괄 제거.

import type { Tower, TowerKind } from '../entities/tower';
import type { Enemy } from '../entities/enemy';
import type { Economy } from '../game/economy';
import type { FlowField } from './pathfinding';
import { Projectile } from '../entities/projectile';
import { cellCenter } from '../game/grid';
import { FireZoneField } from './fireZone';
import { drawExplosionRing } from '../render/fx';

// 캐논 폭발 시각효과(밸런스 아님, 시각 상수). 파티클 시스템은 M6이므로 최소한만.
const EXPLOSION_DURATION = 0.2; // 확장·페이드 지속(초).
const EXPLOSION_COLOR = '#ffb04d';
const RECOIL_TIME = 0.15; // 발사 반동 스프링 복귀 시간(초) — recoil 1 → 0 감쇠 기준(D2.5).

interface Explosion {
  x: number;
  y: number;
  radius: number; // 최대 반경(= splashRadius).
  timer: number; // 남은 시간(초).
}

// 이중 사격(스나이퍼 doubleshot, D4.2) — 첫 발 이후 남은 연발을 간격을 두고 발사한다.
interface PendingBurst {
  tower: Tower;
  timer: number; // 다음 발까지 남은 시간(초).
  shots: number; // 남은 발수.
  interval: number; // 발 간격(초).
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
  private pending: PendingBurst[] = []; // 이중 사격 대기 큐(D4.2).
  private fireZones = new FireZoneField(); // 잔류 화염 지대(캐논 napalm, D4.2).

  constructor(private cb: CombatCallbacks = {}) {}

  /** 재시작 — 진행 중인 투사체·폭발·연발·화염 지대를 모두 비운다. */
  reset(): void {
    this.projectiles = [];
    this.explosions = [];
    this.pending = [];
    this.fireZones.reset();
  }

  update(dt: number, towers: Tower[], enemies: Enemy[], economy: Economy, field: FlowField): void {
    this.fireTowers(dt, towers, enemies, field);
    this.updateBursts(dt, enemies, field);
    this.updateProjectiles(dt, enemies, economy);
    this.fireZones.update(dt, enemies, economy, (x, y, c) => this.cb.onKill?.(x, y, c));
    this.updateExplosions(dt);
  }

  // 타워별 쿨다운 감소 → 준비되면 사거리 내 가장 앞선 적에게 발사.
  private fireTowers(dt: number, towers: Tower[], enemies: Enemy[], field: FlowField): void {
    for (const t of towers) {
      if (t.isBarracks) continue; // 배럭은 투사체를 쏘지 않는다(M10).

      // 발사 반동 감쇠(월드 시간 — 배속 서브스텝과 일관). 발사 여부와 무관하게 매 스텝 복귀시킨다.
      if (t.recoil > 0) t.recoil = Math.max(0, t.recoil - dt / RECOIL_TIME);

      const center = cellCenter(t.cx, t.cy);
      // 조준 대상은 매 프레임 계산(포탑 회전용) — 발사 여부와 무관하게 aimAngle을 갱신한다.
      const target = this.pickTarget(center.x, center.y, t.effectiveRange, enemies, field);
      if (target) t.aimAngle = Math.atan2(target.y - center.y, target.x - center.x);

      if (t.cooldown > 0) t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      if (!target) continue;

      this.spawnProjectile(t, target);
      const sp = t.specialSpec;
      // 이중 사격 — 첫 발은 지금 쐈고, 남은 연발을 간격 큐에 등록한다(D4.2).
      if (sp?.burstCount && sp.burstCount > 1) {
        this.pending.push({ tower: t, timer: sp.burstInterval ?? 0.15, shots: sp.burstCount - 1, interval: sp.burstInterval ?? 0.15 });
      }
      t.cooldown = 1 / t.effectiveFireRate; // 실효 공속(rapid 반영) 회/s → 초 간격.
      t.recoil = 1; // 발사 순간 포신 최대 후퇴(render가 조준 반대로 밀어 그린다).
      this.cb.onFire?.(t.kind, center.x, center.y);
    }
  }

  // 이중 사격 대기 발사(D4.2) — 간격이 되면 타워의 현재 최선 대상에게 추가 발사한다.
  private updateBursts(dt: number, enemies: Enemy[], field: FlowField): void {
    for (const b of this.pending) {
      b.timer -= dt;
      if (b.timer > 0) continue;
      const c = cellCenter(b.tower.cx, b.tower.cy);
      const target = this.pickTarget(c.x, c.y, b.tower.effectiveRange, enemies, field);
      if (target) {
        this.spawnProjectile(b.tower, target);
        b.tower.recoil = 1;
        this.cb.onFire?.(b.tower.kind, c.x, c.y);
      }
      b.shots -= 1;
      b.timer = b.interval;
    }
    this.pending = this.pending.filter((b) => b.shots > 0);
  }

  // 타워의 실효 스탯 + 스페셜 수치로 투사체 하나를 만들어 발사한다(일반 발사·이중 사격 공용).
  private spawnProjectile(t: Tower, target: Enemy): void {
    const center = cellCenter(t.cx, t.cy);
    const sp = t.specialSpec;
    this.projectiles.push(
      new Projectile({
        x: center.x,
        y: center.y,
        speed: t.spec.projectileSpeed,
        radius: t.spec.projectileRadius,
        color: t.spec.projectileColor,
        target,
        damage: t.effectiveDamage,
        splashRadius: t.effectiveSplashRadius,
        slowFactor: t.effectiveSlowFactor,
        slowDuration: t.effectiveSlowDuration,
        pierceCount: sp?.pierceCount ?? 0,
        pierceFalloff: sp?.pierceFalloff ?? 1,
        executeThreshold: sp?.executeThreshold ?? 0,
        slowSplashRadius: sp?.slowSplashRadius ?? 0,
        napalm: sp?.napalmDps ? { dps: sp.napalmDps, duration: sp.napalmDuration ?? 0, radius: sp.napalmRadius ?? 0 } : null,
        maxTravel: t.effectiveRange,
      }),
    );
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
      if (p.isPiercing) this.resolvePierce(p, enemies, economy); // 관통은 매 프레임 경로 충돌 검사.
      else if (p.arrived) this.resolveHit(p, enemies, economy);
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  // 관통 명중(애로우 pierce, D4.2) — 직진 경로에서 아직 안 맞은 적을 순서 무관하게 타격한다.
  // 관통당 피해는 falloff^(이미 타격한 수)로 감쇠하고, 최대 타격 수에 도달하면 소멸한다.
  private resolvePierce(p: Projectile, enemies: Enemy[], economy: Economy): void {
    for (const e of enemies) {
      if (e.dead || e.reachedBase || p.hitSet.has(e)) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const hitR = p.radius + e.radius;
      if (dx * dx + dy * dy > hitR * hitR) continue;
      this.applyHit(e, p, economy, p.damage * Math.pow(p.pierceFalloff, p.hitSet.size));
      p.hitSet.add(e);
      if (p.hitSet.size >= p.pierceCount) {
        p.dead = true;
        break;
      }
    }
  }

  // 명중 해석. 스플래시면 지점 반경 내 전 적에게, 아니면 단일 대상에게 적용.
  // 추가로 광역 슬로우(frostfield)·잔류 화염(napalm) 스페셜을 명중 지점에 얹는다(D4.2).
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
    // 광역 슬로우(frostfield) — 명중 지점 반경 내 전 적에게 슬로우만 얹는다(피해 없음).
    if (p.slowSplashRadius > 0) this.applySlowField(p, enemies);
    // 잔류 화염(napalm) — 명중 지점에 화염 지대를 남긴다.
    if (p.napalm) this.fireZones.add(p.x, p.y, p.napalm.radius, p.napalm.dps, p.napalm.duration);
  }

  // 광역 슬로우(frostfield, D4.2) — 지점 반경 내 적에게 슬로우 적용(지대 성격상 실드 무시).
  private applySlowField(p: Projectile, enemies: Enemy[]): void {
    const r2 = p.slowSplashRadius * p.slowSplashRadius;
    for (const e of enemies) {
      if (e.dead || e.reachedBase) continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      if (dx * dx + dy * dy <= r2) e.applySlow(p.slowFactor, p.slowDuration);
    }
  }

  // 데미지 → 처치 시 골드(1회) → 슬로우. 처치 골드는 dead 전환 순간에만 지급.
  // damage 인자로 관통 감쇠 피해를 넘길 수 있다(기본은 투사체 기본 피해).
  private applyHit(e: Enemy, p: Projectile, economy: Economy, damage = p.damage): void {
    // 실드(D4.1): 남아있으면 이번 피격을 전부 흡수 — 데미지·슬로우 없이 실드만 1 소모.
    if (e.consumeShield()) return;
    if (p.slowFactor > 0) e.applySlow(p.slowFactor, p.slowDuration);
    // 처형(execute, D4.2) — HP 비율이 임계 이하면 즉사, 아니면 정상 피해.
    if (p.executeThreshold > 0 && e.hp / e.maxHp <= p.executeThreshold) e.hp = 0;
    else e.hp -= damage;
    this.cb.onDamage?.(e.x, e.y, damage); // 명중 지점 데미지 팝업.
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

  // 화염 지대 → 폭발 링(확장·페이드) → 투사체 순으로 그린다.
  render(ctx: CanvasRenderingContext2D): void {
    this.fireZones.render(ctx);
    for (const ex of this.explosions) {
      const life = ex.timer / EXPLOSION_DURATION; // 1 → 0.
      const progress = 1 - life; // 0 → 1 (반경 확장).
      drawExplosionRing(ctx, ex.x, ex.y, ex.radius * progress, life * 0.8, EXPLOSION_COLOR);
    }

    for (const p of this.projectiles) p.render(ctx);
  }
}

// 근접 전투 시스템(M10) — 병사↔적 교전과 블로킹을 관리한다.
//   1) 배럭 로스터 유지 호출(사망 병사 제거 + 리스폰)
//   2) 병사 타겟팅·접근·교전: 집결지 반경 내 최근접 적을 향해 이동, 접촉 시 근접 공격
//   3) 블로킹: 접촉 교전 중인 적은 이번 프레임 이동 정지(enemy.blocked)
//   4) 적 반격: 블로킹당한 적이 대표 블로커 1명을 근접 공격
//
// 블로킹 규칙: 한 병사는 동시에 적 1기만 블로킹, 적 1기에 병사 여러 명이 붙는 건 허용
// (여러 병사가 같은 적을 focus fire, 적은 대표 블로커 1명만 때린다).
// update(dt, ...)에서만 상태를 변경한다(render 없음 — 병사·집결지 렌더는 unit.ts가 담당).

import type { Enemy } from '../entities/enemy';
import type { Economy } from '../game/economy';
import type { Barracks, Soldier } from '../entities/unit';

// 전투가 이펙트·사운드를 직접 그리지 않도록 발생 시점만 훅으로 알린다(Game이 배선).
export interface MeleeCallbacks {
  onEnemyKilled?(x: number, y: number, color: string): void; // 병사 처치 → 파티클·처치음.
  onSoldierKilled?(x: number, y: number, color: string): void; // 병사 사망 → 파티클(시체 없이 제거).
}

export class MeleeSystem {
  constructor(private cb: MeleeCallbacks = {}) {}

  update(dt: number, barracks: Barracks[], enemies: Enemy[], economy: Economy): void {
    // 1) 모든 적 블로킹 해제 — 이번 프레임 접촉으로 다시 판정(배럭이 없어도 반드시 해제).
    for (const e of enemies) e.blocked = false;

    // 2) 배럭 로스터 유지(사망 병사 제거 + 리스폰 타이머).
    for (const b of barracks) b.maintain(dt);

    // 3) 병사 타겟팅·이동·교전. 적별 "대표 블로커"(적 반격 대상) 수집.
    const blockers = new Map<Enemy, Soldier>();
    for (const b of barracks) {
      for (const s of b.soldiers) {
        if (s.dead) continue;
        this.updateSoldier(dt, s, b, enemies, economy, blockers);
      }
    }

    // 4) 블로킹당한 적의 반격 — 적 1기 → 대표 블로커 1명.
    for (const [enemy, soldier] of blockers) {
      enemy.meleeCooldown -= dt;
      if (enemy.meleeCooldown <= 0 && !enemy.dead && !soldier.dead) {
        enemy.meleeCooldown = 1 / enemy.meleeRate;
        soldier.hp -= enemy.meleeDamage;
        if (soldier.hp <= 0 && !soldier.dead) {
          soldier.dead = true;
          this.cb.onSoldierKilled?.(soldier.x, soldier.y, soldier.color);
        }
      }
    }
  }

  // 병사 1기: 타겟 유효성 검사 → 없으면 획득 → 접근 또는 접촉 교전.
  private updateSoldier(
    dt: number,
    s: Soldier,
    b: Barracks,
    enemies: Enemy[],
    economy: Economy,
    blockers: Map<Enemy, Soldier>,
  ): void {
    let target = s.target;
    // 죽었거나 기지 도달했거나 집결지 반경을 벗어난 대상은 놓아준다.
    if (target && (target.dead || target.reachedBase || !b.withinEngage(target.x, target.y))) {
      target = null;
    }
    if (!target) target = this.acquire(b, enemies);
    s.target = target;

    if (!target) {
      s.returnToRally(dt); // 교전 대상 없음 → 집결지 슬롯 복귀/대기.
      return;
    }

    const contact = s.radius + target.radius;
    const dx = target.x - s.x;
    const dy = target.y - s.y;
    const dist = Math.hypot(dx, dy);

    s.state = 'engaging';
    if (dist > contact) {
      s.moveToward(target.x, target.y, dt); // 접근.
      return;
    }

    // 접촉 — 블로킹 + 근접 공격.
    target.blocked = true;
    if (!blockers.has(target)) blockers.set(target, s); // 첫 접촉 병사가 대표 블로커.
    s.attackCooldown -= dt;
    if (s.attackCooldown <= 0) {
      s.attackCooldown = 1 / s.attackRate;
      target.hp -= s.damage;
      if (target.hp <= 0 && !target.dead) {
        target.dead = true;
        economy.addGold(target.reward); // 처치 보상 골드는 타워와 동일 지급.
        this.cb.onEnemyKilled?.(target.x, target.y, target.color);
      }
    }
  }

  // 집결지 중심 기준 반경 내 최근접(살아있고 도달 가능한) 적.
  private acquire(b: Barracks, enemies: Enemy[]): Enemy | null {
    let best: Enemy | null = null;
    let bestD = Infinity;
    const r2 = b.engageRadius * b.engageRadius;
    for (const e of enemies) {
      if (e.dead || e.reachedBase) continue;
      const dx = e.x - b.rallyX;
      const dy = e.y - b.rallyY;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      if (d2 < bestD) {
        bestD = d2;
        best = e;
      }
    }
    return best;
  }
}

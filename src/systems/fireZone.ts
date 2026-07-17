// 잔류 화염 지대(캐논 napalm 스페셜, D4.2) — 명중 지점에 일정 시간 남아 반경 내 적에게
// 초당 피해를 주는 원형 지대. combat이 소유하고, update로 피해·수명을, render로 주황 페이드를 처리한다.
//
// 화염은 "지대"라 실드를 소모하지 않고(환경 피해) 직접 HP를 깎는다. 처치 시 골드·처치 콜백은
// combat의 단일 타격과 동일하게 economy/onKill로 지급한다. update/render 분리 규칙 유지.

import type { Enemy } from '../entities/enemy';
import type { Economy } from '../game/economy';
import { drawGlowDot } from '../render/fx';

const FIRE_COLOR = '#ff7a2a'; // 주황 화염(시각 상수).

interface FireZone {
  x: number;
  y: number;
  radius: number;
  dps: number; // 초당 피해.
  timer: number; // 남은 수명(초).
  duration: number; // 총 수명(초) — 페이드 알파 계산용.
}

/** 적 처치 순간 통지(파티클·처치음). combat이 자신의 onKill 훅으로 연결한다. */
export type OnZoneKill = (x: number, y: number, color: string) => void;

export class FireZoneField {
  private zones: FireZone[] = [];

  reset(): void {
    this.zones = [];
  }

  /** 명중 지점에 화염 지대 하나 생성. */
  add(x: number, y: number, radius: number, dps: number, duration: number): void {
    this.zones.push({ x, y, radius, dps, timer: duration, duration });
  }

  // 수명 감소 + 반경 내 적에게 dt 기반 피해. 처치 시 골드·처치 콜백을 지급한다.
  update(dt: number, enemies: Enemy[], economy: Economy, onKill: OnZoneKill): void {
    for (const z of this.zones) {
      z.timer -= dt;
      const dmg = z.dps * dt;
      const r2 = z.radius * z.radius;
      for (const e of enemies) {
        if (e.dead || e.reachedBase) continue;
        const dx = e.x - z.x;
        const dy = e.y - z.y;
        if (dx * dx + dy * dy > r2) continue;
        e.hp -= dmg; // 지대 피해는 실드를 무시(환경 피해).
        if (e.hp <= 0 && !e.dead) {
          e.dead = true;
          economy.addGold(e.reward);
          onKill(e.x, e.y, e.color);
        }
      }
    }
    this.zones = this.zones.filter((z) => z.timer > 0);
  }

  // 주황 원형 페이드(수명에 따라 옅어짐). 가산 발광 도트로 화염 느낌을 낸다(읽기 전용).
  render(ctx: CanvasRenderingContext2D): void {
    for (const z of this.zones) {
      const life = z.timer / z.duration; // 1 → 0.
      ctx.save();
      ctx.globalAlpha = life * 0.28;
      ctx.fillStyle = FIRE_COLOR;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      drawGlowDot(ctx, z.x, z.y, z.radius * 0.5, FIRE_COLOR); // 중심 발광(가산).
    }
  }
}

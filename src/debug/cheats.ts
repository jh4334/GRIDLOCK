// 디버그 치트키(밸런스 아님 — 수치는 debug 코드 상수로 둔다).
//   G = 골드 +1000
//   N = 웨이브 스킵(남은 스폰 큐 비우고 필드의 적을 보상 없이 제거 → 웨이브 클리어 처리)
//   H = 히트박스 표시 토글(적 반지름 원 + 타워 사거리 원)
//
// 실제 동작(골드/웨이브/제거/토글)은 game이 소유한 상태를 바꿔야 하므로 콜백으로 위임한다.

import type { Keyboard } from '../core/input';
import type { Enemy } from '../entities/enemy';
import type { Tower } from '../entities/tower';
import { cellCenter } from '../game/grid';

const CHEAT_GOLD = 1000;

// 히트박스 오버레이 색(시각 상수).
const COLOR_ENEMY_HB = 'rgba(255, 80, 80, 0.9)';
const COLOR_RANGE_HB = 'rgba(120, 200, 255, 0.8)';

export interface CheatHooks {
  addGold: (amount: number) => void;
  skipWave: () => void;
  toggleHitboxes: () => void;
}

export class DebugCheats {
  constructor(keyboard: Keyboard, hooks: CheatHooks) {
    keyboard.on('g', () => hooks.addGold(CHEAT_GOLD));
    keyboard.on('n', () => hooks.skipWave());
    keyboard.on('h', () => hooks.toggleHitboxes());
  }
}

// 히트박스 오버레이 — 적 반지름 원과 타워 사거리 원. 상태 변경 없는 순수 렌더.
export function renderHitboxes(ctx: CanvasRenderingContext2D, enemies: Enemy[], towers: Tower[]): void {
  ctx.save();
  ctx.lineWidth = 1;

  ctx.strokeStyle = COLOR_RANGE_HB;
  for (const t of towers) {
    const c = cellCenter(t.cx, t.cy);
    ctx.beginPath();
    ctx.arc(c.x, c.y, t.effectiveRange, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = COLOR_ENEMY_HB;
  for (const e of enemies) {
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

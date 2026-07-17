// 타이틀 화면 — 로고/부제/최고기록 + 모드 선택 버튼 두 개([디펜스 모드] [정복 모드]).
// 상태 변경 없는 순수 렌더. 버튼 클릭 판정(hitTitleButton)은 App이 받아 모드를 전환한다.
// 최고기록 문자열 포맷(formatBest)은 승/패 오버레이와 공유한다.

import type { BestRecord } from '../core/storage';

const COLOR_BG = '#1a1a1f';
const COLOR_LOGO = '#9ad0ff';
const COLOR_SUB = '#c8c8d0';
const COLOR_BEST = '#7bd67b';

export type TitleMode = 'defense' | 'conquest';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const BTN_W = 240;
const BTN_H = 64;
const BTN_GAP = 40;

// 두 모드 버튼의 사각형(렌더·클릭 판정 공유). 캔버스 크기에 맞춰 가운데 정렬.
export function titleButtons(w: number, h: number): { defense: Rect; conquest: Rect } {
  const totalW = BTN_W * 2 + BTN_GAP;
  const startX = (w - totalW) / 2;
  const y = h * 0.6 - BTN_H / 2;
  return {
    defense: { x: startX, y, w: BTN_W, h: BTN_H },
    conquest: { x: startX + BTN_W + BTN_GAP, y, w: BTN_W, h: BTN_H },
  };
}

/** 클릭 좌표가 어느 모드 버튼 위인지. 아니면 null. */
export function hitTitleButton(w: number, h: number, px: number, py: number): TitleMode | null {
  const b = titleButtons(w, h);
  if (inside(b.defense, px, py)) return 'defense';
  if (inside(b.conquest, px, py)) return 'conquest';
  return null;
}

function inside(r: Rect, px: number, py: number): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

/** 최고기록 한 줄 문자열. 없으면 안내 문구. (승/패 오버레이와 공유) */
export function formatBest(best: BestRecord | null): string {
  if (!best) return '최고 기록: 없음';
  const wavePart = best.cleared ? `웨이브 ${best.wave} 클리어` : `웨이브 ${best.wave}`;
  return `최고 기록: ${wavePart} (라이프 ${best.lives})`;
}

export function renderTitle(ctx: CanvasRenderingContext2D, best: BestRecord | null): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.save();
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 로고
  ctx.fillStyle = COLOR_LOGO;
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.fillText('GRIDLOCK', w / 2, h * 0.22);

  // 부제
  ctx.fillStyle = COLOR_SUB;
  ctx.font = '22px system-ui, sans-serif';
  ctx.fillText('미로형 타워 디펜스 · 미니 RTS', w / 2, h * 0.22 + 58);

  // 모드 버튼
  const b = titleButtons(w, h);
  drawButton(ctx, b.defense, '디펜스 모드', '#2e5a7a', '#4080a8', '#e6f2ff', '20웨이브 생존');
  drawButton(ctx, b.conquest, '정복 모드', '#7a4e2e', '#a87840', '#ffe9d6', '본진 정복 RTS');

  // 최고기록(디펜스 기준)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLOR_BEST;
  ctx.font = '18px monospace';
  ctx.fillText(formatBest(best), w / 2, h * 0.86);

  ctx.restore();
}

function drawButton(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  label: string,
  fill: string,
  border: string,
  text: string,
  sub: string,
): void {
  ctx.fillStyle = fill;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);

  ctx.fillStyle = text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 - 8);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(sub, r.x + r.w / 2, r.y + r.h / 2 + 16);
}

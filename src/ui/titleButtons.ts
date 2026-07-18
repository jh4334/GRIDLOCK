// 타이틀 모드 버튼·난이도 버튼 기하·클릭 판정·렌더(D7.4 분리 → D7.6 레이아웃 개편).
// 맵 선택은 D7.6에서 썸네일 카드로 개편되어 mapCards.ts로 옮겼다. 여기 남는 것:
//   모드 버튼(디펜스/정복) — titleButtons/drawButton
//   난이도 3버튼(정복 버튼 오른쪽) — difficultyButtons/drawDifficultyButtons
//
// 레이아웃(캔버스 960×672, D7.6): 디펜스 버튼은 위(카드 그리드 위), 정복 버튼은 아래에
// 난이도 3버튼과 한 줄을 이룬다. 카드 그리드는 각 모드 버튼 rect를 앵커로 mapCards가 배치한다.

import type { DifficultyId } from '../core/storage';

export type TitleMode = 'defense' | 'conquest';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const COLOR_NEON_CONQUEST = '#ff4d6a';

// 모드 버튼(디펜스 위·정복 아래). 카드 그리드 두 줄을 사이에 넣을 수 있게 y를 벌린다.
const BTN_W = 200;
const BTN_H = 46;
export const DEFENSE_BTN_Y = 108;
export const CONQUEST_BTN_Y = 402;

const DIFF_ORDER: { id: DifficultyId; label: string }[] = [
  { id: 'easy', label: '쉬움' },
  { id: 'normal', label: '보통' },
  { id: 'hard', label: '어려움' },
];
const DBTN_W = 74;
const DBTN_H = 34;
const DBTN_GAP = 6;
const PAIR_GAP = 20; // 정복 버튼 ↔ 난이도 묶음 간격.

function inside(r: Rect, px: number, py: number): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

// 두 모드 버튼 사각형. 디펜스는 상단 중앙, 정복은 하단에서 난이도 묶음과 함께 가운데 정렬.
export function titleButtons(w: number, _h: number): { defense: Rect; conquest: Rect } {
  const diffTotalW = DBTN_W * 3 + DBTN_GAP * 2;
  const pairW = BTN_W + PAIR_GAP + diffTotalW;
  return {
    defense: { x: w / 2 - BTN_W / 2, y: DEFENSE_BTN_Y, w: BTN_W, h: BTN_H },
    conquest: { x: w / 2 - pairW / 2, y: CONQUEST_BTN_Y, w: BTN_W, h: BTN_H },
  };
}

/** 클릭 좌표가 어느 모드 버튼 위인지. 아니면 null. */
export function hitTitleButton(w: number, h: number, px: number, py: number): TitleMode | null {
  const b = titleButtons(w, h);
  if (inside(b.defense, px, py)) return 'defense';
  if (inside(b.conquest, px, py)) return 'conquest';
  return null;
}

// 난이도 버튼 3개 — 정복 버튼 오른쪽에 세로 중앙을 맞춰 가로로 정렬.
export function difficultyButtons(w: number, h: number): { id: DifficultyId; label: string; rect: Rect }[] {
  const conquest = titleButtons(w, h).conquest;
  const startX = conquest.x + conquest.w + PAIR_GAP;
  const y = conquest.y + (conquest.h - DBTN_H) / 2;
  return DIFF_ORDER.map((d, i) => ({
    id: d.id,
    label: d.label,
    rect: { x: startX + i * (DBTN_W + DBTN_GAP), y, w: DBTN_W, h: DBTN_H },
  }));
}

/** 클릭 좌표가 어느 난이도 버튼 위인지. 아니면 null. */
export function hitDifficultyButton(w: number, h: number, px: number, py: number): DifficultyId | null {
  for (const d of difficultyButtons(w, h)) if (inside(d.rect, px, py)) return d.id;
  return null;
}

// ── 렌더 ──────────────────────────────────────────────────────────
/** 난이도 3버튼 렌더(현재 선택 강조, 정복 네온). 라벨은 줄 위. */
export function drawDifficultyButtons(ctx: CanvasRenderingContext2D, w: number, h: number, current: DifficultyId): void {
  const btns = difficultyButtons(w, h);
  const first = btns[0].rect;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(200, 220, 255, 0.55)';
  ctx.fillText('난이도', first.x, first.y - 12);
  ctx.restore();

  for (const { label, rect, id } of btns) {
    const selected = id === current;
    ctx.save();
    ctx.fillStyle = selected ? 'rgba(60, 26, 34, 0.9)' : 'rgba(20, 28, 44, 0.85)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = selected ? COLOR_NEON_CONQUEST : 'rgba(120, 170, 230, 0.35)';
    if (selected) {
      ctx.shadowColor = COLOR_NEON_CONQUEST;
      ctx.shadowBlur = 10;
    }
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
    ctx.restore();

    ctx.fillStyle = selected ? '#ffd7de' : 'rgba(200, 220, 255, 0.6)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${selected ? 'bold ' : ''}15px system-ui, sans-serif`;
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
  }
}

/** 모드 버튼(디펜스/정복) — 어두운 패널 + 네온 테두리 글로우 + 라벨·부제. */
export function drawButton(ctx: CanvasRenderingContext2D, r: Rect, label: string, neon: string, sub: string): void {
  ctx.save();
  ctx.fillStyle = 'rgba(20, 28, 44, 0.85)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = neon;
  ctx.shadowColor = neon;
  ctx.shadowBlur = 12;
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  ctx.restore();

  ctx.fillStyle = neon;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 - 7);
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(200, 220, 255, 0.65)';
  ctx.fillText(sub, r.x + r.w / 2, r.y + r.h / 2 + 14);
}

// 정복 미니맵 — 캔버스 우하단 구석에 20×14 맵을 축소해 양 진영 상황을 실시간 표시한다.
// 반투명 배경 + 테두리로 플레이 정보 가림을 최소화한다. 순수 렌더(상태 변경 없음): 코디네이터가
// 매 프레임 월드에서 좌표를 모아 넘겨주고, 여기서는 색 점으로만 그린다. 클릭 내비게이션 없음.

import { COLS, ROWS, TILE } from '../game/grid';

// 미니맵에 찍을 좌표 묶음(칸 기반: 크리스탈·구조물 / 픽셀 기반: 이동 유닛).
export interface MinimapData {
  crystals: { cx: number; cy: number; depleted: boolean }[];
  playerStructures: { cx: number; cy: number }[]; // 아군 건물 + 본진.
  enemyStructures: { cx: number; cy: number }[]; // 적 건물 + 본진.
  playerMobs: { x: number; y: number }[]; // 아군 전투 유닛 + 일꾼.
  enemyMobs: { x: number; y: number }[]; // 적 전투 유닛 + 일꾼.
}

// 시각 상수(밸런스 아님) — 20:14 비율에 맞춘 140×98, 칸당 7px.
const MM_W = COLS * 7; // 140
const MM_H = ROWS * 7; // 98
const MARGIN = 8;
const CELL = MM_W / COLS; // 7
const MOB = 3; // 유닛 점 크기(px).

const COLOR_BG = 'rgba(10, 14, 20, 0.62)';
const COLOR_BORDER = 'rgba(224, 179, 87, 0.7)';
const COLOR_CRYSTAL = '#5be0d0';
const COLOR_PLAYER_STRUCT = '#3a78d0';
const COLOR_ENEMY_STRUCT = '#c0433a';
const COLOR_PLAYER_MOB = '#7fd0ff';
const COLOR_ENEMY_MOB = '#ff6b6b';

export function renderMinimap(ctx: CanvasRenderingContext2D, data: MinimapData): void {
  const ox = ctx.canvas.width - MM_W - MARGIN;
  const oy = ctx.canvas.height - MM_H - MARGIN;

  ctx.save();
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(ox, oy, MM_W, MM_H);
  ctx.strokeStyle = COLOR_BORDER;
  ctx.lineWidth = 1;
  ctx.strokeRect(ox + 0.5, oy + 0.5, MM_W - 1, MM_H - 1);

  const cellDot = (cx: number, cy: number, color: string): void => {
    ctx.fillStyle = color;
    ctx.fillRect(ox + cx * CELL, oy + cy * CELL, CELL, CELL);
  };
  for (const c of data.crystals) if (!c.depleted) cellDot(c.cx, c.cy, COLOR_CRYSTAL);
  for (const s of data.playerStructures) cellDot(s.cx, s.cy, COLOR_PLAYER_STRUCT);
  for (const s of data.enemyStructures) cellDot(s.cx, s.cy, COLOR_ENEMY_STRUCT);

  const mobDot = (x: number, y: number, color: string): void => {
    ctx.fillStyle = color;
    ctx.fillRect(ox + (x / TILE) * CELL - MOB / 2, oy + (y / TILE) * CELL - MOB / 2, MOB, MOB);
  };
  for (const m of data.playerMobs) mobDot(m.x, m.y, COLOR_PLAYER_MOB);
  for (const m of data.enemyMobs) mobDot(m.x, m.y, COLOR_ENEMY_MOB);

  ctx.restore();
}

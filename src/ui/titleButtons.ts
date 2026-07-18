// 타이틀 버튼 기하·클릭 판정·렌더 헬퍼(D7.4에서 title.ts에서 분리 — 300줄 규칙).
// title.ts는 renderTitle에서 이 draw* 함수를 호출하고, App은 hit* 함수로 클릭을 모드/선택으로 옮긴다.
//
// 버튼 4종:
//   모드 버튼(디펜스/정복) — titleButtons/drawButton
//   난이도 3버튼(정복 아래)  — difficultyButtons/drawDifficultyButtons (정복 네온)
//   디펜스 맵 버튼(디펜스 아래, 여러 줄) — mapButtons/drawMapButtons (디펜스 네온)
//   정복 맵 버튼(난이도 아래) — conquestMapButtons/drawConquestMapButtons (정복 네온, D7.4)

import { conquestMapList, type DifficultyId, type MapId, type ConquestMapId } from '../core/storage';
import { mapList } from '../game/maps';

export type TitleMode = 'defense' | 'conquest';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const COLOR_NEON_CONQUEST = '#ff4d6a';
const COLOR_NEON_DEFENSE = '#39d5ff';

const BTN_W = 240;
const BTN_H = 64;
const BTN_GAP = 40;

const DIFF_ORDER: { id: DifficultyId; label: string }[] = [
  { id: 'easy', label: '쉬움' },
  { id: 'normal', label: '보통' },
  { id: 'hard', label: '어려움' },
];
const DBTN_W = 74;
const DBTN_H = 34;
const DBTN_GAP = 6;

// 디펜스 맵 버튼 — 목록은 maps.json에서 파생, 한 줄 MAPS_PER_ROW개씩 접어 여러 줄로 배치.
const MBTN_W = 100;
const MBTN_H = 32;
const MBTN_GAP = 6;
const MAPS_PER_ROW = 3;

// 정복 맵 버튼(D7.4) — 목록은 conquest.json에서 파생. 난이도 줄 아래 한 줄 배치(맵 3종).
const CMBTN_W = 90;
const CMBTN_H = 30;
const CMBTN_GAP = 6;

function inside(r: Rect, px: number, py: number): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

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

// 난이도 버튼 3개 사각형. 정복 버튼 중앙 아래에 가로로 정렬.
export function difficultyButtons(w: number, h: number): { id: DifficultyId; label: string; rect: Rect }[] {
  const conquest = titleButtons(w, h).conquest;
  const totalW = DBTN_W * 3 + DBTN_GAP * 2;
  const startX = conquest.x + conquest.w / 2 - totalW / 2;
  const y = conquest.y + conquest.h + 22;
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

// 디펜스 맵 버튼 사각형. 디펜스 버튼 중앙 아래에 MAPS_PER_ROW개씩 줄바꿈 정렬(D7.2).
export function mapButtons(w: number, h: number): { id: MapId; label: string; rect: Rect }[] {
  const defense = titleButtons(w, h).defense;
  const centerX = defense.x + defense.w / 2;
  const topY = defense.y + defense.h + 22;
  const maps = mapList();
  return maps.map((m, i) => {
    const row = Math.floor(i / MAPS_PER_ROW);
    const col = i % MAPS_PER_ROW;
    const rowCount = Math.min(MAPS_PER_ROW, maps.length - row * MAPS_PER_ROW);
    const rowW = MBTN_W * rowCount + MBTN_GAP * (rowCount - 1);
    const x = centerX - rowW / 2 + col * (MBTN_W + MBTN_GAP);
    const y = topY + row * (MBTN_H + MBTN_GAP);
    return { id: m.id, label: m.name, rect: { x, y, w: MBTN_W, h: MBTN_H } };
  });
}

/** 클릭 좌표가 어느 디펜스 맵 버튼 위인지. 아니면 null. */
export function hitMapButton(w: number, h: number, px: number, py: number): MapId | null {
  for (const m of mapButtons(w, h)) if (inside(m.rect, px, py)) return m.id;
  return null;
}

// 정복 맵 버튼 사각형(D7.4). 정복 난이도 줄 아래에 한 줄 가로 정렬.
export function conquestMapButtons(w: number, h: number): { id: ConquestMapId; label: string; rect: Rect }[] {
  const conquest = titleButtons(w, h).conquest;
  const centerX = conquest.x + conquest.w / 2;
  const maps = conquestMapList();
  const totalW = CMBTN_W * maps.length + CMBTN_GAP * (maps.length - 1);
  const startX = centerX - totalW / 2;
  // 난이도 줄(높이 DBTN_H) 아래로 한 칸 내려 라벨 여백 확보.
  const y = conquest.y + conquest.h + 22 + DBTN_H + 22;
  return maps.map((m, i) => ({
    id: m.id,
    label: m.name,
    rect: { x: startX + i * (CMBTN_W + CMBTN_GAP), y, w: CMBTN_W, h: CMBTN_H },
  }));
}

/** 클릭 좌표가 어느 정복 맵 버튼 위인지. 아니면 null. */
export function hitConquestMapButton(w: number, h: number, px: number, py: number): ConquestMapId | null {
  for (const m of conquestMapButtons(w, h)) if (inside(m.rect, px, py)) return m.id;
  return null;
}

// ── 렌더 ──────────────────────────────────────────────────────────
// 선택형 버튼 한 줄(난이도·맵 공통) — 현재 선택은 네온으로 강조, 나머지는 어둡게. 라벨은 줄 위.
function drawSelectableRow(
  ctx: CanvasRenderingContext2D,
  btns: { label: string; rect: Rect; selected: boolean }[],
  neon: string,
  selBg: string,
  selText: string,
  groupLabel: string,
  fontPx: number,
): void {
  const first = btns[0].rect;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(200, 220, 255, 0.55)';
  ctx.fillText(groupLabel, first.x, first.y - 12);
  ctx.restore();

  for (const { label, rect, selected } of btns) {
    ctx.save();
    ctx.fillStyle = selected ? selBg : 'rgba(20, 28, 44, 0.85)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = selected ? neon : 'rgba(120, 170, 230, 0.35)';
    if (selected) {
      ctx.shadowColor = neon;
      ctx.shadowBlur = 10;
    }
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
    ctx.restore();

    ctx.fillStyle = selected ? selText : 'rgba(200, 220, 255, 0.6)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${selected ? 'bold ' : ''}${fontPx}px system-ui, sans-serif`;
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
  }
}

/** 난이도 3버튼 렌더(현재 선택 강조, 정복 네온). */
export function drawDifficultyButtons(ctx: CanvasRenderingContext2D, w: number, h: number, current: DifficultyId): void {
  const btns = difficultyButtons(w, h).map((b) => ({ label: b.label, rect: b.rect, selected: b.id === current }));
  drawSelectableRow(ctx, btns, COLOR_NEON_CONQUEST, 'rgba(60, 26, 34, 0.9)', '#ffd7de', '난이도', 15);
}

/** 디펜스 맵 버튼 렌더(현재 선택 강조, 디펜스 네온). */
export function drawMapButtons(ctx: CanvasRenderingContext2D, w: number, h: number, current: MapId): void {
  const btns = mapButtons(w, h).map((b) => ({ label: b.label, rect: b.rect, selected: b.id === current }));
  drawSelectableRow(ctx, btns, COLOR_NEON_DEFENSE, 'rgba(20, 44, 56, 0.9)', '#d7f4ff', '맵', 14);
}

/** 정복 맵 버튼 렌더(현재 선택 강조, 정복 네온, D7.4). */
export function drawConquestMapButtons(ctx: CanvasRenderingContext2D, w: number, h: number, current: ConquestMapId): void {
  const btns = conquestMapButtons(w, h).map((b) => ({ label: b.label, rect: b.rect, selected: b.id === current }));
  drawSelectableRow(ctx, btns, COLOR_NEON_CONQUEST, 'rgba(60, 26, 34, 0.9)', '#ffd7de', '정복 맵', 13);
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
  ctx.font = 'bold 24px system-ui, sans-serif';
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 - 8);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(200, 220, 255, 0.65)';
  ctx.fillText(sub, r.x + r.w / 2, r.y + r.h / 2 + 16);
}

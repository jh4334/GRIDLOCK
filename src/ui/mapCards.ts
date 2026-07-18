// 맵 선택 카드(D7.6) — 썸네일 + 맵 이름을 한 카드로 그리고, 선택 카드는 네온 테두리로 강조한다.
// 디펜스(4열×2행)·정복(3카드) 모두 같은 카드 컴포넌트를 공유한다(spec: 정복도 카드로 통일).
//
// 기하는 titleButtons의 모드 버튼 rect를 앵커로 계산한다(버튼 아래 그리드). 히트 판정은 카드
// 썸네일 + 이름 라벨 밴드까지 포함해, 이름을 눌러도 선택되게 한다(titleButtons hit 패턴 확장).

import { mapList } from '../game/maps';
import { conquestMapList, type DailyRecord, type MapId, type ConquestMapId } from '../core/storage';
import { titleButtons, type Rect } from './titleButtons';
import { defenseThumbnail, conquestThumbnail, THUMB_W, THUMB_H } from './mapThumbnail';

const COLOR_NEON_DEFENSE = '#39d5ff';
const COLOR_NEON_CONQUEST = '#ff4d6a';

const COL_GAP = 12;
const DEF_COLS = 4;
const LABEL_BAND = 20; // 카드 아래 이름 라벨 높이(히트 판정 포함).
const ROW_PITCH = THUMB_H + LABEL_BAND + 2; // 두 행 사이 간격(라벨 밴드 포함).
const GRID_GAP = 16; // 모드 버튼 ↔ 카드 그리드 세로 간격.

function inside(r: Rect, px: number, py: number): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

// 디펜스 카드 rect(썸네일 영역만). 디펜스 버튼 아래 4열×2행, 캔버스 중앙 정렬.
export function defenseCards(w: number, h: number): { id: MapId; name: string; rect: Rect }[] {
  const btn = titleButtons(w, h).defense;
  const top = btn.y + btn.h + GRID_GAP;
  const maps = mapList();
  const gridW = DEF_COLS * THUMB_W + (DEF_COLS - 1) * COL_GAP;
  const startX = w / 2 - gridW / 2;
  return maps.map((m, i) => {
    const row = Math.floor(i / DEF_COLS);
    const col = i % DEF_COLS;
    const x = startX + col * (THUMB_W + COL_GAP);
    const y = top + row * ROW_PITCH;
    return { id: m.id, name: m.name, rect: { x, y, w: THUMB_W, h: THUMB_H } };
  });
}

// 정복 카드 rect(썸네일 영역만). 정복 버튼 아래 한 줄, 캔버스 중앙 정렬.
export function conquestCards(w: number, h: number): { id: ConquestMapId; name: string; rect: Rect }[] {
  const btn = titleButtons(w, h).conquest;
  const top = btn.y + btn.h + GRID_GAP;
  const maps = conquestMapList();
  const gridW = maps.length * THUMB_W + (maps.length - 1) * COL_GAP;
  const startX = w / 2 - gridW / 2;
  return maps.map((m, i) => ({
    id: m.id,
    name: m.name,
    rect: { x: startX + i * (THUMB_W + COL_GAP), y: top, w: THUMB_W, h: THUMB_H },
  }));
}

// 카드 히트 영역 = 썸네일 + 이름 라벨 밴드(라벨을 눌러도 선택됨).
function hitRect(r: Rect): Rect {
  return { x: r.x, y: r.y, w: r.w, h: r.h + LABEL_BAND };
}

/** 클릭 좌표가 어느 디펜스 카드 위인지. 아니면 null. */
export function hitDefenseCard(w: number, h: number, px: number, py: number): MapId | null {
  for (const c of defenseCards(w, h)) if (inside(hitRect(c.rect), px, py)) return c.id;
  return null;
}

/** 클릭 좌표가 어느 정복 카드 위인지. 아니면 null. */
export function hitConquestCard(w: number, h: number, px: number, py: number): ConquestMapId | null {
  for (const c of conquestCards(w, h)) if (inside(hitRect(c.rect), px, py)) return c.id;
  return null;
}

// ── 렌더 ──────────────────────────────────────────────────────────
// 카드 한 장: 썸네일 이미지 + 테두리(선택 시 네온 글로우) + 이름. badge가 있으면 좌하단에 표기.
function drawCard(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  thumb: HTMLCanvasElement,
  name: string,
  selected: boolean,
  neon: string,
  badge: string | null,
): void {
  ctx.drawImage(thumb, rect.x, rect.y);

  ctx.save();
  ctx.strokeStyle = selected ? neon : 'rgba(120, 170, 230, 0.4)';
  if (selected) {
    ctx.shadowColor = neon;
    ctx.shadowBlur = 12;
  }
  ctx.lineWidth = selected ? 2.5 : 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  ctx.restore();

  if (badge) {
    ctx.save();
    ctx.fillStyle = 'rgba(8, 14, 22, 0.78)';
    ctx.fillRect(rect.x + 1, rect.y + rect.h - 16, rect.w - 2, 15);
    ctx.fillStyle = neon;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(badge, rect.x + 5, rect.y + rect.h - 8);
    ctx.restore();
  }

  ctx.fillStyle = selected ? (neon === COLOR_NEON_DEFENSE ? '#d7f4ff' : '#ffd7de') : 'rgba(200, 220, 255, 0.72)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `${selected ? 'bold ' : ''}13px system-ui, sans-serif`;
  ctx.fillText(name, rect.x + rect.w / 2, rect.y + rect.h + 4);
}

/** 디펜스 맵 카드 그리드 렌더. daily 카드는 오늘 시드 기록이 있으면 좌하단 배지로 표시. */
export function drawDefenseCards(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  current: MapId,
  todaySeedVal: number,
  daily: DailyRecord | null,
): void {
  for (const c of defenseCards(w, h)) {
    const thumb = defenseThumbnail(c.id, todaySeedVal);
    const badge =
      c.id === 'daily' && daily && daily.seed === todaySeedVal ? `W${daily.wave}${daily.cleared ? ' ✓' : ''}` : null;
    drawCard(ctx, c.rect, thumb, c.name, c.id === current, COLOR_NEON_DEFENSE, badge);
  }
}

/** 정복 맵 카드 렌더(같은 카드 컴포넌트, 정복 네온). */
export function drawConquestCards(ctx: CanvasRenderingContext2D, w: number, h: number, current: ConquestMapId): void {
  for (const c of conquestCards(w, h)) {
    drawCard(ctx, c.rect, conquestThumbnail(c.id), c.name, c.id === current, COLOR_NEON_CONQUEST, null);
  }
}

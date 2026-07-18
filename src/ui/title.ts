// 타이틀 화면 — 로고/부제/최고기록 + 모드 선택 버튼 두 개([디펜스 모드] [정복 모드]).
// 상태 변경 없는 순수 렌더. 버튼 클릭 판정(hitTitleButton)은 App이 받아 모드를 전환한다.
// 최고기록 문자열 포맷(formatBest)은 승/패 오버레이와 공유한다.

import type { BestRecord, DifficultyId, MapId } from '../core/storage';
import { mapList } from '../game/maps';
import { animTime } from '../render/sprites';

const COLOR_LOGO = '#e6d38f'; // STEEL GRID — 초원 전장 톤(앰버/올리브).
const COLOR_SUB = '#a8b48a';
const COLOR_BEST = '#e0b357';
const COLOR_NEON_CONQUEST = '#ff4d6a';
const COLOR_NEON_DEFENSE = '#39d5ff'; // 디펜스 네온(맵 선택 버튼 강조에도 재사용).

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

// 정복 난이도 선택(D3.3) — 정복 버튼 바로 아래 3개 소형 버튼. 순서·라벨은 여기서 소유.
const DIFF_ORDER: { id: DifficultyId; label: string }[] = [
  { id: 'easy', label: '쉬움' },
  { id: 'normal', label: '보통' },
  { id: 'hard', label: '어려움' },
];
const DBTN_W = 74;
const DBTN_H = 34;
const DBTN_GAP = 6;

// 디펜스 맵 선택(D4.4→D7.2) — 디펜스 버튼 아래 소형 버튼. 목록은 maps.json에서 파생(하드코딩 제거),
// 맵이 늘어나면 한 줄 MAPS_PER_ROW개씩 접어 여러 줄로 배치한다(레이아웃 겹침 방지).
const MBTN_W = 100;
const MBTN_H = 32;
const MBTN_GAP = 6;
const MAPS_PER_ROW = 3;

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

// 난이도 버튼 3개 사각형(렌더·클릭 판정 공유). 정복 버튼 중앙 아래에 가로로 정렬.
export function difficultyButtons(w: number, h: number): { id: DifficultyId; rect: Rect }[] {
  const conquest = titleButtons(w, h).conquest;
  const totalW = DBTN_W * 3 + DBTN_GAP * 2;
  const startX = conquest.x + conquest.w / 2 - totalW / 2;
  const y = conquest.y + conquest.h + 22;
  return DIFF_ORDER.map((d, i) => ({
    id: d.id,
    rect: { x: startX + i * (DBTN_W + DBTN_GAP), y, w: DBTN_W, h: DBTN_H },
  }));
}

/** 클릭 좌표가 어느 난이도 버튼 위인지. 아니면 null. */
export function hitDifficultyButton(w: number, h: number, px: number, py: number): DifficultyId | null {
  for (const d of difficultyButtons(w, h)) if (inside(d.rect, px, py)) return d.id;
  return null;
}

// 맵 버튼 사각형(렌더·클릭 판정 공유). 디펜스 버튼 중앙 아래에 MAPS_PER_ROW개씩 줄바꿈 정렬(D7.2).
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

/** 클릭 좌표가 어느 맵 버튼 위인지. 아니면 null. */
export function hitMapButton(w: number, h: number, px: number, py: number): MapId | null {
  for (const m of mapButtons(w, h)) if (inside(m.rect, px, py)) return m.id;
  return null;
}

/** 최고기록 한 줄 문자열. 없으면 안내 문구. (승/패 오버레이와 공유) */
export function formatBest(best: BestRecord | null): string {
  if (!best) return '최고 기록: 없음';
  const wavePart = best.cleared ? `웨이브 ${best.wave} 클리어` : `웨이브 ${best.wave}`;
  return `최고 기록: ${wavePart} (라이프 ${best.lives})`;
}

export function renderTitle(
  ctx: CanvasRenderingContext2D,
  best: BestRecord | null,
  difficulty: DifficultyId,
  mapId: MapId, // 선택된 디펜스 맵(평원/협곡) — 버튼 하이라이트(D4.4).
  endlessBest = 0, // 엔드리스 최고 도달 웨이브(0이면 표시 안 함, D4.3).
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.save();
  paintBackdrop(ctx, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 로고 — 네온 글로우(맥동).
  const glow = 18 + Math.sin(animTime() * 2) * 6;
  ctx.save();
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.shadowColor = '#c9b05c';
  ctx.shadowBlur = glow;
  ctx.fillStyle = COLOR_LOGO;
  ctx.fillText('GRIDLOCK', w / 2, h * 0.22);
  ctx.shadowBlur = glow * 0.5;
  ctx.fillText('GRIDLOCK', w / 2, h * 0.22); // 2차 패스로 글로우 강화.
  ctx.restore();

  // 부제
  ctx.fillStyle = COLOR_SUB;
  ctx.font = '22px system-ui, sans-serif';
  ctx.fillText('미로형 타워 디펜스 · 미니 RTS', w / 2, h * 0.22 + 58);

  // 모드 버튼(네온)
  const b = titleButtons(w, h);
  drawButton(ctx, b.defense, '디펜스 모드', '#39d5ff', '20웨이브 생존');
  drawButton(ctx, b.conquest, '정복 모드', COLOR_NEON_CONQUEST, '본진 정복 RTS');

  // 디펜스 맵 선택(현재 선택 하이라이트, D4.4).
  drawMapButtons(ctx, w, h, mapId);
  // 정복 난이도 선택(현재 선택 하이라이트).
  drawDifficultyButtons(ctx, w, h, difficulty);

  // 최고기록(디펜스 기준)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLOR_BEST;
  ctx.font = '18px monospace';
  ctx.fillText(formatBest(best), w / 2, h * 0.86);

  // 엔드리스 최고 웨이브(기록이 있을 때만) — 디펜스 최고기록 바로 아래.
  if (endlessBest > 0) {
    ctx.fillStyle = COLOR_NEON_CONQUEST;
    ctx.font = '15px monospace';
    ctx.fillText(`엔드리스 최고: 웨이브 ${endlessBest}`, w / 2, h * 0.86 + 26);
  }

  ctx.restore();
}

// 다크 네이비 배경 + 옅은 그리드 + 스캔라인.
function paintBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0d1117');
  g.addColorStop(1, '#161b27');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(110, 170, 255, 0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 48) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
  }
  for (let y = 0; y <= h; y += 48) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
  }
  ctx.stroke();

  // 스캔라인(가로 옅은 줄).
  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
}

// 난이도 3버튼 — 현재 선택은 정복 네온(붉은색)으로 강조, 나머지는 어둡게. 캔버스 렌더.
function drawDifficultyButtons(ctx: CanvasRenderingContext2D, w: number, h: number, current: DifficultyId): void {
  const btns = difficultyButtons(w, h);
  const first = btns[0].rect;

  // 안내 라벨("난이도") — 버튼 줄 위.
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(200, 220, 255, 0.55)';
  ctx.fillText('난이도', first.x, first.y - 12);
  ctx.restore();

  for (let i = 0; i < btns.length; i++) {
    const { rect } = btns[i];
    const selected = btns[i].id === current;
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
    ctx.fillText(DIFF_ORDER[i].label, rect.x + rect.w / 2, rect.y + rect.h / 2);
  }
}

// 맵 2버튼 — 현재 선택은 디펜스 네온(시안)으로 강조, 나머지는 어둡게(D4.4). 캔버스 렌더.
function drawMapButtons(ctx: CanvasRenderingContext2D, w: number, h: number, current: MapId): void {
  const btns = mapButtons(w, h);
  const first = btns[0].rect;

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(200, 220, 255, 0.55)';
  ctx.fillText('맵', first.x, first.y - 12);
  ctx.restore();

  for (let i = 0; i < btns.length; i++) {
    const { rect } = btns[i];
    const selected = btns[i].id === current;
    ctx.save();
    ctx.fillStyle = selected ? 'rgba(20, 44, 56, 0.9)' : 'rgba(20, 28, 44, 0.85)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = selected ? COLOR_NEON_DEFENSE : 'rgba(120, 170, 230, 0.35)';
    if (selected) {
      ctx.shadowColor = COLOR_NEON_DEFENSE;
      ctx.shadowBlur = 10;
    }
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
    ctx.restore();

    ctx.fillStyle = selected ? '#d7f4ff' : 'rgba(200, 220, 255, 0.6)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${selected ? 'bold ' : ''}14px system-ui, sans-serif`;
    ctx.fillText(btns[i].label, rect.x + rect.w / 2, rect.y + rect.h / 2);
  }
}

function drawButton(ctx: CanvasRenderingContext2D, r: Rect, label: string, neon: string, sub: string): void {
  ctx.save();
  // 어두운 패널 + 네온 테두리 글로우.
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

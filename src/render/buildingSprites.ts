// 정복 건물 스프라이트 — 배럭(벙커), 포탑(디펜스 애로우 계열 재사용), 보급고(격자 컨테이너).
// 건설 중은 홀로그램 와이어프레임(반투명 청사진 + 진행 바). 로드 시 1회 프리렌더 후 drawImage.
// key: 'building/<kind>/<side>', 'building/wire/<kind>'. 진영색: player=시안/블루, enemy=레드.

import { TILE } from '../game/grid';
import { createSpriteCanvas, defineSprite, getSprite, animTime } from './sprites';
import { withAlpha, ALLY_CYAN, ALLY_BLUE, FOE_RED, GOLD, PLATE_DARK } from './palette';

export type BuildVisualKind = 'barracks' | 'turret' | 'depot';
export type BuildSide = 'player' | 'enemy';

const S = TILE;
const INSET = 4;
const SIDE_EDGE: Record<BuildSide, string> = { player: ALLY_CYAN, enemy: FOE_RED };

for (const kind of ['barracks', 'turret', 'depot'] as BuildVisualKind[]) {
  for (const side of ['player', 'enemy'] as BuildSide[]) {
    defineSprite(`building/${kind}/${side}`, () => buildStructure(kind, side));
  }
  defineSprite(`building/wire/${kind}`, () => buildWire(kind));
}

function buildStructure(kind: BuildVisualKind, side: BuildSide): HTMLCanvasElement {
  const { canvas, ctx } = createSpriteCanvas(S, S);
  const edge = SIDE_EDGE[side];
  const x = INSET;
  const y = INSET;
  const w = S - INSET * 2;

  // 어두운 베이스 플레이트 + 진영 네온 테두리.
  ctx.fillStyle = PLATE_DARK;
  roundPath(ctx, x, y, w, w, 5);
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2;
  roundPath(ctx, x, y, w, w, 5);
  ctx.stroke();

  const c = S / 2;
  if (kind === 'barracks') {
    // 벙커 — 문 + 지붕 줄무늬.
    ctx.fillStyle = '#0d1420';
    roundPath(ctx, c - 8, c + 2, 16, 12, 3);
    ctx.fill();
    ctx.strokeStyle = withAlpha(edge, 0.7);
    ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(c - 10, c - 8 + i * 4);
      ctx.lineTo(c + 10, c - 8 + i * 4);
      ctx.stroke();
    }
  } else if (kind === 'turret') {
    // 애로우 계열 — 회전 허브 + 트윈 배럴(진영 방향).
    const dir = side === 'player' ? 1 : -1;
    ctx.fillStyle = '#0f141f';
    ctx.beginPath();
    ctx.arc(c, c, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = edge;
    ctx.fillRect(c, c - 5, 13 * dir, 3);
    ctx.fillRect(c, c + 2, 13 * dir, 3);
  } else {
    // 보급고 — 3×3 격자 컨테이너.
    ctx.strokeStyle = withAlpha(edge, 0.6);
    ctx.lineWidth = 1;
    const g0 = c - w / 2 + 4;
    const cell = (w - 8) / 3;
    ctx.fillStyle = withAlpha(GOLD, 0.18);
    ctx.fillRect(g0, g0, w - 8, w - 8);
    for (let i = 0; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(g0 + i * cell, g0);
      ctx.lineTo(g0 + i * cell, g0 + (w - 8));
      ctx.moveTo(g0, g0 + i * cell);
      ctx.lineTo(g0 + (w - 8), g0 + i * cell);
      ctx.stroke();
    }
  }
  return canvas;
}

// 건설 중 홀로그램 와이어프레임(청사진) — 시안 반투명 외곽 + 코너 브래킷.
function buildWire(kind: BuildVisualKind): HTMLCanvasElement {
  const { canvas, ctx } = createSpriteCanvas(S, S);
  const x = INSET;
  const w = S - INSET * 2;
  ctx.strokeStyle = withAlpha(ALLY_BLUE, 0.9);
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  roundPath(ctx, x, x, w, w, 5);
  ctx.stroke();
  ctx.setLineDash([]);
  // 코너 브래킷(청사진 느낌).
  ctx.strokeStyle = ALLY_CYAN;
  ctx.lineWidth = 2;
  const b = 7;
  for (const [cx, cy, sx, sy] of [
    [x, x, 1, 1],
    [x + w, x, -1, 1],
    [x, x + w, 1, -1],
    [x + w, x + w, -1, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + b * sx, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + b * sy);
    ctx.stroke();
  }
  // 종류 힌트(중앙 점) — 배럭/포탑/보급고 최소 표식.
  ctx.fillStyle = withAlpha(ALLY_CYAN, 0.5);
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, kind === 'depot' ? 3 : 4, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

// ── 그리기(매 프레임) ────────────────────────────────────────────
/** 완성 건물 — 베이스 + 종류별 디테일. (x,y)=칸 좌상단. */
export function drawBuilding(ctx: CanvasRenderingContext2D, kind: BuildVisualKind, side: BuildSide, x: number, y: number): void {
  ctx.drawImage(getSprite(`building/${kind}/${side}`), x, y);
}

/** 건설 중 — 홀로그램 와이어프레임(스캔라인 맥동) + 진행 바. (x,y)=칸 좌상단. */
export function drawConstruction(ctx: CanvasRenderingContext2D, kind: BuildVisualKind, x: number, y: number, progress: number): void {
  ctx.save();
  ctx.globalAlpha = 0.5 + Math.sin(animTime() * 4) * 0.18; // 청사진 깜빡임.
  ctx.drawImage(getSprite(`building/wire/${kind}`), x, y);
  ctx.restore();
  // 진행 바(하단).
  const w = S - INSET * 2;
  const bx = x + INSET;
  const by = y + S - INSET - 4;
  ctx.fillStyle = 'rgba(6, 10, 18, 0.85)';
  ctx.fillRect(bx - 1, by - 1, w + 2, 6);
  ctx.fillStyle = ALLY_CYAN;
  ctx.fillRect(bx, by, w * Math.min(1, progress), 4);
}

/** 선택 네온 링. (x,y)=칸 좌상단. */
export function drawBuildingSelect(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.strokeStyle = GOLD;
  ctx.shadowColor = GOLD;
  ctx.shadowBlur = 6;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1.5, y + 1.5, TILE - 3, TILE - 3);
  ctx.restore();
}

function roundPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

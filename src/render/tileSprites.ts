// 바닥·맵 스프라이트 — 초원/사막 지형 타일(정적 프리렌더), 스폰 포털 게이트, 코어 리액터.
//
// 지형 타일은 좌표 해시로 tile1/2를 변주해 결정적으로 그린다(Math.random 금지). 바닥 전체는
// Grid가 정적 레이어에 1회 스탬프한다(paintGroundFloor). 포털/리액터/크리스탈은 벡터 폴백일
// 때 시간 맥동 연출을 하고, 실제 스킨 로드 후엔 합성 스프라이트를 그대로 찍는다(assetsReady 분기).

import { TILE } from '../game/grid';
import { createSpriteCanvas, defineSprite, getSprite, animTime, hash01, assetsReady } from './sprites';
import * as P from './palette';
import { withAlpha } from './palette';

// ── 지형 바닥(정적 레이어에 직접 스탬프) ────────────────────────
// 초원(디펜스)/사막(정복) 전장. 실제 Kenney 타일 스킨이 로드되면 칸마다 좌표 해시로 tile1/2를
// 변주해 찍고, 로드 전엔 베이스색만 채워 즉시 실행 가능하게 한다(폴백). 격자선은 아주 옅게.
export type GroundVariant = 'grass' | 'sand';

// 스킨 로드 전 폴백 베이스색(초원 올리브그린 / 사막 탄색).
const GROUND_BASE: Record<GroundVariant, string> = { grass: '#4a7a3a', sand: '#c2a86a' };
// 지형 위 아주 옅은 격자선(진영 구분 안 해치도록 은은하게).
const GROUND_GRID = 'rgba(0, 0, 0, 0.10)';

/** 바닥 전체를 초원/사막 타일로 칠한다. Grid.buildStaticLayer가 1회 호출(에셋 준비 시 재빌드). */
export function paintGroundFloor(ctx: CanvasRenderingContext2D, cols: number, rows: number, variant: GroundVariant): void {
  ctx.fillStyle = GROUND_BASE[variant];
  ctx.fillRect(0, 0, cols * TILE, rows * TILE);

  // 실제 타일 스킨이 준비됐을 때만 칸별로 찍는다(로드 전엔 베이스색 폴백).
  if (assetsReady()) {
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const n = hash01(cx, cy, 5) < 0.5 ? 1 : 2; // 좌표 해시로 tile1/tile2 변주(결정적).
        ctx.drawImage(getSprite(`tile/floor/${variant}${n}`), cx * TILE, cy * TILE, TILE, TILE);
      }
    }
  }

  // 아주 옅은 격자선(설치 칸 감을 남기되 회로 패턴은 제거).
  ctx.strokeStyle = GROUND_GRID;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let cx = 0; cx <= cols; cx++) {
    const x = cx * TILE + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, rows * TILE);
  }
  for (let cy = 0; cy <= rows; cy++) {
    const y = cy * TILE + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(cols * TILE, y);
  }
  ctx.stroke();
}

// ── 스폰 포털 게이트(마젠타, 회전/펄스) ─────────────────────────
const PORTAL = 'tile/portal';
defineSprite(PORTAL, () => buildPortal(P.FOE_MAGENTA));
defineSprite('tile/portal-ring', () => buildPortalRing(P.FOE_MAGENTA));

function buildPortal(color: string): HTMLCanvasElement {
  const s = TILE;
  const { canvas, ctx } = createSpriteCanvas(s, s);
  const c = s / 2;
  // 어두운 게이트 바닥.
  ctx.fillStyle = withAlpha('#2a0c1a', 0.9);
  ctx.beginPath();
  ctx.arc(c, c, s * 0.42, 0, Math.PI * 2);
  ctx.fill();
  // 발광 중심.
  const g = ctx.createRadialGradient(c, c, 1, c, c, s * 0.4);
  g.addColorStop(0, withAlpha('#ffd0dc', 0.95));
  g.addColorStop(0.4, withAlpha(color, 0.7));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, s * 0.4, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

// 회전하는 게이트 링(안쪽 노치 6개) — 별도 스프라이트로 두어 독립 회전.
function buildPortalRing(color: string): HTMLCanvasElement {
  const s = TILE;
  const { canvas, ctx } = createSpriteCanvas(s, s);
  const c = s / 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(c, c, s * 0.36, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = color;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * s * 0.36, c + Math.sin(a) * s * 0.36, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

/** 스폰 포털 그리기 — 중심 발광 + 반대로 도는 두 링 + 맥동(시간 기반). 칸 중심 (x,y). */
export function drawPortal(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  // 스킨 로드 후: 궤적+레드 깃발 합성 스프라이트를 그대로 찍는다(가산 발광/회전 링 제거).
  if (assetsReady()) {
    ctx.drawImage(getSprite(PORTAL), x - TILE / 2, y - TILE / 2);
    return;
  }
  const t = animTime();
  const pulse = 0.85 + Math.sin(t * 3) * 0.15;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = pulse;
  ctx.drawImage(getSprite(PORTAL), x - TILE / 2, y - TILE / 2);
  ctx.restore();
  // 두 링을 서로 반대로 회전.
  const ring = getSprite('tile/portal-ring');
  drawRotated(ctx, ring, x, y, t * 0.8, 1);
  drawRotated(ctx, ring, x, y, -t * 1.3, 0.7);
}

// ── 코어 리액터(기지/HQ, 시안 또는 레드) ────────────────────────
// key: 'tile/reactor/<colorKey>' + 'tile/reactor-ring/<colorKey>'.
function reactorKey(colorKey: string): string {
  return `tile/reactor/${colorKey}`;
}
function registerReactor(colorKey: string, color: string): void {
  defineSprite(reactorKey(colorKey), () => buildReactor(color));
  defineSprite(`tile/reactor-ring/${colorKey}`, () => buildReactorRing(color));
}
registerReactor('cyan', P.ALLY_CYAN);
registerReactor('red', P.FOE_RED);

function buildReactor(color: string): HTMLCanvasElement {
  const s = TILE;
  const { canvas, ctx } = createSpriteCanvas(s, s);
  const c = s / 2;
  // 팔각 베이스 플레이트.
  ctx.fillStyle = P.PLATE_DARK;
  octagon(ctx, c, c, s * 0.42);
  ctx.fill();
  ctx.strokeStyle = withAlpha(color, 0.6);
  ctx.lineWidth = 2;
  octagon(ctx, c, c, s * 0.42);
  ctx.stroke();
  // 발광 코어.
  const g = ctx.createRadialGradient(c, c, 1, c, c, s * 0.32);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, color);
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, s * 0.32, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

function buildReactorRing(color: string): HTMLCanvasElement {
  const s = TILE;
  const { canvas, ctx } = createSpriteCanvas(s, s);
  const c = s / 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(c, c, s * 0.2 + i * 4, (i * Math.PI) / 3, (i * Math.PI) / 3 + Math.PI * 1.3);
    ctx.stroke();
  }
  return canvas;
}

/** 코어 리액터 그리기 — 베이스 + 맥동 코어 + 회전 링. colorKey: 'cyan'|'red'. */
export function drawReactor(ctx: CanvasRenderingContext2D, x: number, y: number, colorKey: string): void {
  const t = animTime();
  // 스킨 로드 후: 깃발+전차 본진 합성 스프라이트 + 은은한 알파 맥동(가산 발광/회전 링 제거).
  if (assetsReady()) {
    ctx.drawImage(getSprite(reactorKey(colorKey)), x - TILE / 2, y - TILE / 2);
    ctx.save();
    ctx.globalAlpha = 0.12 + Math.sin(t * 3) * 0.08; // 살아있는 본진 느낌의 옅은 맥동.
    ctx.drawImage(getSprite(reactorKey(colorKey)), x - TILE / 2, y - TILE / 2);
    ctx.restore();
    return;
  }
  ctx.drawImage(getSprite(reactorKey(colorKey)), x - TILE / 2, y - TILE / 2);
  // 맥동 발광 오버레이.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.25 + Math.sin(t * 4) * 0.15;
  ctx.drawImage(getSprite(reactorKey(colorKey)), x - TILE / 2, y - TILE / 2);
  ctx.restore();
  drawRotated(ctx, getSprite(`tile/reactor-ring/${colorKey}`), x, y, t * 1.1, 1);
}

// ── 크리스탈(민트 발광 다이아) ──────────────────────────────────
defineSprite('tile/crystal', () => buildCrystal(P.MINT));
function buildCrystal(color: string): HTMLCanvasElement {
  const s = 44;
  const { canvas, ctx } = createSpriteCanvas(s, s);
  const c = s / 2;
  const h = 15;
  // 발광 후광.
  const g = ctx.createRadialGradient(c, c, 1, c, c, h + 6);
  g.addColorStop(0, withAlpha(color, 0.55));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, h + 6, 0, Math.PI * 2);
  ctx.fill();
  // 다이아 본체.
  ctx.beginPath();
  ctx.moveTo(c, c - h);
  ctx.lineTo(c + h, c);
  ctx.lineTo(c, c + h);
  ctx.lineTo(c - h, c);
  ctx.closePath();
  const gg = ctx.createLinearGradient(c - h, c - h, c + h, c + h);
  gg.addColorStop(0, '#daffef');
  gg.addColorStop(0.5, color);
  gg.addColorStop(1, '#2f9e8e');
  ctx.fillStyle = gg;
  ctx.fill();
  ctx.strokeStyle = withAlpha('#eafff9', 0.8);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  return canvas;
}

/** 크리스탈 그리기 — 잔량 비율로 밝기, 시간에 따라 은은한 빛 펄스(민트). */
export function drawCrystal(ctx: CanvasRenderingContext2D, x: number, y: number, ratio: number): void {
  const t = animTime();
  ctx.save();
  ctx.globalAlpha = 0.4 + ratio * 0.6; // 잔량 적을수록 흐리게.
  ctx.drawImage(getSprite('tile/crystal'), x - 22, y - 22);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = (0.2 + Math.sin(t * 2.5 + x) * 0.12) * ratio;
  ctx.drawImage(getSprite('tile/crystal'), x - 22, y - 22);
  ctx.restore();
}

// ── 공용 헬퍼 ────────────────────────────────────────────────────
function drawRotated(ctx: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number, a: number, alpha: number): void {
  const w = (img as HTMLCanvasElement).width;
  const h = (img as HTMLCanvasElement).height;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.drawImage(img, -w / 2, -h / 2);
  ctx.restore();
}

function octagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

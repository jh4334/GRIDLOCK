// D7.1 지형 타일 — 물(water)·거친땅(rough) 정적 타일 스프라이트. Grid가 정적 레이어에 1회 굽는다
// (펄스 없음, update/render 분리 준수). 바위(rock)는 tileSprites가, 이 둘은 여기가 소유한다.
// 순수 벡터 폴백(Kenney 반입 없음): 결정적 좌표 해시로 변주(Math.random 금지). 도로는 rough
// 위에도 정상 렌더된다(rough는 통행 가능), water 위엔 경로가 오지 않는다(isWalkable false).

import { TILE } from '../game/grid';
import { createSpriteCanvas, defineSprite, getSprite, hash01 } from './sprites';
import { withAlpha } from './palette';

// ── 물(통행·건설 불가) ───────────────────────────────────────────
// 짙은 청색 그라디언트 + 해시 잔물결 3줄 + 어두운 가장자리(깊이감).
defineSprite('tile/water', () => buildWater());

function buildWater(): HTMLCanvasElement {
  const s = TILE;
  const { canvas, ctx } = createSpriteCanvas(s, s);
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, '#1c4f7a');
  g.addColorStop(1, '#0f3355');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = withAlpha('#7fc4e8', 0.5); // 잔물결(해시로 y 흔들기, 결정적).
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const y = s * (0.28 + i * 0.24) + hash01(i, 7, 3) * 5;
    ctx.beginPath();
    ctx.moveTo(4, y);
    ctx.bezierCurveTo(s * 0.32, y - 3, s * 0.62, y + 3, s - 4, y);
    ctx.stroke();
  }
  ctx.strokeStyle = withAlpha('#08243d', 0.7); // 가장자리 음영.
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, s - 2, s - 2);
  return canvas;
}

/** 물 타일 그리기 — 칸 중심 (x, y)에 찍는다. Grid 정적 레이어가 1회 호출. */
export function drawWater(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.drawImage(getSprite('tile/water'), x - TILE / 2, y - TILE / 2);
}

// ── 거친땅 rough(통행·건설 가능, 적 감속) ─────────────────────────
// 어두운 흙 베이스 타일(캐시) + 칸 좌표 해시 자갈 점(밝은/어두운 얼룩 섞어 질감).
defineSprite('tile/rough', () => buildRoughBase());

function buildRoughBase(): HTMLCanvasElement {
  const s = TILE;
  const { canvas, ctx } = createSpriteCanvas(s, s);
  const g = ctx.createLinearGradient(0, 0, s, s);
  g.addColorStop(0, '#5a5148');
  g.addColorStop(1, '#413a33');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = withAlpha('#2a251f', 0.5);
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
  return canvas;
}

/** rough 그리기 — 칸 좌표 (cx, cy) 기준 베이스 타일 + 해시 자갈 점. Grid 정적 레이어가 1회 호출. */
export function drawRough(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const s = TILE;
  const x = cx * s;
  const y = cy * s;
  ctx.drawImage(getSprite('tile/rough'), x, y);
  for (let i = 0; i < 9; i++) {
    const px = x + 4 + hash01(cx * 9 + i, cy, 11) * (s - 8);
    const py = y + 4 + hash01(cx, cy * 9 + i, 13) * (s - 8);
    const t = hash01(i, cx + cy, 17);
    const r = 1 + t * 2;
    ctx.fillStyle = t < 0.5 ? withAlpha('#7a7060', 0.7) : withAlpha('#2c2620', 0.7);
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

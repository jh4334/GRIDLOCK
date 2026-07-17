// 투사체·이펙트 공용 그리기 — 발광 코어 + 트레일, 폭발 링, 처치 파티클/데미지 팝업 글로우.
// 발광 도트는 색상별로 1회 프리렌더(흰 코어→색→투명 방사)하고 매 프레임 drawImage(스케일).
// 'lighter' 합성으로 네온 가산 발광을 낸다.

import { createSpriteCanvas, defineSprite, getSprite, hasSprite } from './sprites';
import { withAlpha } from './palette';

const DOT_SIZE = 32; // 발광 도트 프리렌더 지름(그릴 때 반경으로 스케일).

// 색상별 발광 도트 스프라이트 key를 지연 등록하고 반환.
function glowKey(color: string): string {
  const key = `fx/glow/${color}`;
  if (!hasSprite(key)) defineSprite(key, () => buildGlowDot(color));
  return key;
}

function buildGlowDot(color: string): HTMLCanvasElement {
  const { canvas, ctx } = createSpriteCanvas(DOT_SIZE, DOT_SIZE);
  const c = DOT_SIZE / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, color);
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

/** 발광 도트 — 반경 radius로 스케일. lighter 합성 가산 발광. */
export function drawGlowDot(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void {
  const img = getSprite(glowKey(color));
  const d = radius * 3.2; // 도트가 코어보다 넉넉히 퍼지도록.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(img, x - d / 2, y - d / 2, d, d);
  ctx.restore();
}

/** 투사체 — 이전 위치(px,py)에서 현재까지 페이드 꼬리 + 발광 코어. */
export function drawProjectile(ctx: CanvasRenderingContext2D, x: number, y: number, px: number, py: number, radius: number, color: string): void {
  // 트레일(가산 발광, 뒤로 갈수록 투명).
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = radius * 1.3;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.restore();
  // 발광 코어.
  drawGlowDot(ctx, x, y, radius, color);
}

/** 폭발 링(확장·페이드) — 가산 발광. progress 0→1로 반경 확장, alpha로 페이드. */
export function drawExplosionRing(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, alpha: number, color: string): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  // 안쪽 채움 글로우.
  ctx.globalAlpha = alpha * 0.4;
  drawGlowDot(ctx, x, y, radius * 0.5, color);
  ctx.restore();
}

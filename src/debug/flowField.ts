// 플로우필드 디버그 오버레이 — D키 토글. 각 walkable 칸에 기지 방향 화살표를,
// 기지 칸엔 점을, 도달 불가 칸엔 붉은 X를 그린다. 상태 변경 없는 순수 렌더.

import type { FlowField } from '../systems/pathfinding';
import { TILE, cellCenter } from '../game/grid';

const COLOR_ARROW = 'rgba(120, 200, 255, 0.55)';
const COLOR_BASE_DOT = 'rgba(255, 210, 90, 0.8)';
const COLOR_UNREACHABLE = 'rgba(255, 80, 80, 0.4)';
const ARROW_LEN = TILE * 0.32; // 화살표 전체 길이(칸 중심 기준 대칭).
const HEAD_LEN = TILE * 0.12; // 화살촉 날개 길이.

export function renderFlowField(ctx: CanvasRenderingContext2D, field: FlowField): void {
  ctx.save();
  ctx.lineWidth = 2;

  for (let cy = 0; cy < field.rows; cy++) {
    for (let cx = 0; cx < field.cols; cx++) {
      const dist = field.getDistance(cx, cy);
      const { x, y } = cellCenter(cx, cy);

      if (dist < 0) {
        // 도달 불가(벽 포함) — 붉은 X.
        drawCross(ctx, x, y, HEAD_LEN);
        continue;
      }

      const { dx, dy } = field.getDir(cx, cy);
      if (dx === 0 && dy === 0) {
        // 기지 칸.
        ctx.fillStyle = COLOR_BASE_DOT;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      drawArrow(ctx, x, y, dx, dy);
    }
  }

  ctx.restore();
}

function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number): void {
  const half = ARROW_LEN / 2;
  const tailX = x - dx * half;
  const tailY = y - dy * half;
  const tipX = x + dx * half;
  const tipY = y + dy * half;

  ctx.strokeStyle = COLOR_ARROW;
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(tipX, tipY);
  // 화살촉 — 진행 방향에 수직으로 벌린 두 날개.
  const perpX = -dy;
  const perpY = dx;
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - dx * HEAD_LEN + perpX * HEAD_LEN, tipY - dy * HEAD_LEN + perpY * HEAD_LEN);
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - dx * HEAD_LEN - perpX * HEAD_LEN, tipY - dy * HEAD_LEN - perpY * HEAD_LEN);
  ctx.stroke();
}

function drawCross(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.strokeStyle = COLOR_UNREACHABLE;
  ctx.beginPath();
  ctx.moveTo(x - r, y - r);
  ctx.lineTo(x + r, y + r);
  ctx.moveTo(x + r, y - r);
  ctx.lineTo(x - r, y + r);
  ctx.stroke();
}

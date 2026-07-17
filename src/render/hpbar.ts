// 공용 체력바 렌더 — 모든 엔티티(적·병사·유닛·일꾼·건물·HQ)가 같은 세련된 스타일을 쓴다.
// 반투명 어두운 배경 + 모서리 둥근 채움. 읽기 전용(상태 변경 없음).

const BG = 'rgba(6, 10, 18, 0.8)';

/** 모서리 둥근 사각형 경로(폭이 0이면 그리지 않음). ctx.roundRect 미지원 환경 대비 수동 구현. */
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  if (w <= 0) return;
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * 좌상단(x,y) 기준 폭 w·높이 h 체력바. ratio(0~1) 비율만큼 color로 채운다.
 * 배경은 살짝 여백을 두고 둥글게. 세련된 얇은 바 스타일.
 */
export function drawHpBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  color: string,
): void {
  const clamped = Math.max(0, Math.min(1, ratio));
  ctx.fillStyle = BG;
  roundRect(ctx, x - 1, y - 1, w + 2, h + 2, (h + 2) / 2);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w * clamped, h, h / 2);
  ctx.fill();
}

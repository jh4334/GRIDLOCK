// 정복 모드 HUD — 우상단에 크리스탈/인구(현재/최대) 텍스트. 디펜스 HUD와 같은 위치·스타일.
// 순수 렌더(상태 변경 없음).

export interface ConquestHudInfo {
  crystal: number;
  popUsed: number;
  popMax: number;
}

export function renderConquestHud(ctx: CanvasRenderingContext2D, info: ConquestHudInfo): void {
  ctx.save();
  ctx.font = '16px monospace';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'right';
  const right = ctx.canvas.width - 8;

  ctx.fillStyle = '#5be0d0';
  ctx.fillText(`크리스탈 ${info.crystal}`, right, 8);

  const popFull = info.popUsed >= info.popMax;
  ctx.fillStyle = popFull ? '#ff6b6b' : '#9ad0ff';
  ctx.fillText(`인구 ${info.popUsed}/${info.popMax}`, right, 28);

  ctx.restore();
}

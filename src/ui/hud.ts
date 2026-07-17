// 캔버스 상단 HUD — 골드/라이프/웨이브 텍스트(우상단 정렬). FPS는 좌상단이라 겹치지 않는다.

import type { Economy } from '../game/economy';

export interface WaveInfo {
  current: number;
  total: number;
}

export class Hud {
  render(ctx: CanvasRenderingContext2D, economy: Economy, wave: WaveInfo): void {
    ctx.save();
    ctx.font = '16px monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'right';
    const right = ctx.canvas.width - 8;

    ctx.fillStyle = '#ffd166';
    ctx.fillText(`골드 ${economy.gold}`, right, 8);

    ctx.fillStyle = '#ff6b6b';
    ctx.fillText(`라이프 ${economy.lives}`, right, 28);

    ctx.fillStyle = '#9ad0ff';
    ctx.fillText(`웨이브 ${wave.current}/${wave.total}`, right, 48);

    ctx.restore();
  }
}

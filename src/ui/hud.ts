// 캔버스 상단 HUD — 골드/라이프/웨이브 텍스트(우상단 정렬). FPS는 좌상단이라 겹치지 않는다.

import type { Economy } from '../game/economy';

export interface WaveInfo {
  current: number;
  total: number;
  endless: boolean; // 엔드리스 모드면 "웨이브 n (엔드리스)"로 표기(D4.3).
}

export class Hud {
  // seed가 주어지면(랜덤·오늘의 맵) 웨이브 아래에 "시드 #n"을 소형으로 덧붙인다(D7.5).
  render(ctx: CanvasRenderingContext2D, economy: Economy, wave: WaveInfo, seed: number | null = null): void {
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
    const waveText = wave.endless ? `웨이브 ${wave.current} (엔드리스)` : `웨이브 ${wave.current}/${wave.total}`;
    ctx.fillText(waveText, right, 48);

    if (seed !== null) {
      ctx.font = '12px monospace';
      ctx.fillStyle = 'rgba(180, 200, 230, 0.85)';
      ctx.fillText(`시드 #${seed}`, right, 70);
    }

    ctx.restore();
  }
}

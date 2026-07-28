// 캔버스 상단 HUD — 골드/라이프/웨이브 텍스트(우상단 정렬). FPS는 좌상단이라 겹치지 않는다.
// 모바일에서 캔버스가 CSS로 축소되면 글자도 같이 작아지므로, 렌더 시점 배율(hudScale)로
// 폰트·여백·줄간격을 함께 키워 화면상 크기를 유지한다(데스크톱 배율 1 → 기존과 동일, D8.4).

import type { Economy } from '../game/economy';
import { hudScale } from './uiScale';

// 시각 상수(밸런스 아님) — 배율 1 기준 레이아웃.
const FONT_PX = 16;
const SEED_FONT_PX = 12;
const MARGIN = 8; // 우측·상단 여백.
const LINE = 20; // 줄간격.
const SEED_GAP = 22; // 웨이브 줄 ↔ 시드 줄 간격.

export interface WaveInfo {
  current: number;
  total: number;
  endless: boolean; // 엔드리스 모드면 "웨이브 n (엔드리스)"로 표기(D4.3).
}

export class Hud {
  // seed가 주어지면(랜덤·오늘의 맵) 웨이브 아래에 "시드 #n"을 소형으로 덧붙인다(D7.5).
  render(ctx: CanvasRenderingContext2D, economy: Economy, wave: WaveInfo, seed: number | null = null): void {
    const s = hudScale(ctx.canvas);
    ctx.save();
    ctx.font = `${FONT_PX * s}px monospace`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'right';
    const right = ctx.canvas.width - MARGIN * s;
    const top = MARGIN * s;

    ctx.fillStyle = '#ffd166';
    ctx.fillText(`골드 ${economy.gold}`, right, top);

    ctx.fillStyle = '#ff6b6b';
    ctx.fillText(`라이프 ${economy.lives}`, right, top + LINE * s);

    ctx.fillStyle = '#9ad0ff';
    const waveText = wave.endless ? `웨이브 ${wave.current} (엔드리스)` : `웨이브 ${wave.current}/${wave.total}`;
    ctx.fillText(waveText, right, top + LINE * 2 * s);

    if (seed !== null) {
      ctx.font = `${SEED_FONT_PX * s}px monospace`;
      ctx.fillStyle = 'rgba(180, 200, 230, 0.85)';
      ctx.fillText(`시드 #${seed}`, right, top + (LINE * 2 + SEED_GAP) * s);
    }

    ctx.restore();
  }
}

// 승리/패배 오버레이 — 캔버스 위에 반투명 검정 + 결과 문구 + 도달 웨이브를 그린다.
// 상태 변경 없는 순수 렌더. playing 상태에서는 아무 것도 그리지 않는다.
// (다시 시작 버튼은 HTML(ui/controls)에서 담당 — 캔버스 밖 UI는 DOM으로.)

import type { GameState } from '../game/state';
import type { BestRecord } from '../core/storage';
import { formatBest } from './title';

const OVERLAY_BG = 'rgba(0, 0, 0, 0.72)';
const COLOR_WIN = '#7bd67b';
const COLOR_LOSE = '#ff6b6b';
const COLOR_SUB = '#e0e0e0';
const COLOR_BEST = '#9ad0ff';

export function renderOverlay(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  reachedWave: number,
  totalWaves: number,
  best: BestRecord | null,
  endless = false, // 엔드리스 모드면 패배 문구를 "엔드리스 도달 웨이브 n"으로(D4.3).
): void {
  if (state !== 'won' && state !== 'lost') return;

  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.save();
  ctx.fillStyle = OVERLAY_BG;
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const won = state === 'won';
  ctx.fillStyle = won ? COLOR_WIN : COLOR_LOSE;
  ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.fillText(won ? '승리!' : '패배...', w / 2, h / 2 - 28);

  ctx.fillStyle = COLOR_SUB;
  ctx.font = '22px system-ui, sans-serif';
  const sub = won
    ? `${totalWaves}웨이브 클리어`
    : endless
      ? `엔드리스 도달 웨이브 ${reachedWave}`
      : `도달 웨이브 ${reachedWave}/${totalWaves}`;
  ctx.fillText(sub, w / 2, h / 2 + 28);

  // 최고기록(타이틀 화면과 동일 포맷).
  ctx.fillStyle = COLOR_BEST;
  ctx.font = '17px monospace';
  ctx.fillText(formatBest(best), w / 2, h / 2 + 68);

  ctx.restore();
}

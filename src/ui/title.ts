// 타이틀 화면 — 로고/부제/최고기록 + 모드 선택 버튼 두 개([디펜스 모드] [정복 모드]).
// 상태 변경 없는 순수 렌더. 버튼 클릭 판정(hit*)과 버튼 기하·렌더는 titleButtons.ts로 분리(D7.4).
// 최고기록 문자열 포맷(formatBest)은 승/패 오버레이와 공유한다.

import type { BestRecord, DailyRecord, DifficultyId, MapId, ConquestMapId } from '../core/storage';
import { animTime } from '../render/sprites';
import { titleButtons, drawButton, drawDifficultyButtons } from './titleButtons';
import { drawDefenseCards, drawConquestCards } from './mapCards';

// hit*·TitleMode는 App이 클릭 판정에 쓰므로 하위 모듈에서 재노출(호출부 import 경로 단일화).
export { hitTitleButton, hitDifficultyButton, type TitleMode } from './titleButtons';
export { hitDefenseCard, hitConquestCard } from './mapCards';

const COLOR_LOGO = '#e6d38f'; // STEEL GRID — 초원 전장 톤(앰버/올리브).
const COLOR_SUB = '#a8b48a';
const COLOR_BEST = '#e0b357';
const COLOR_NEON_CONQUEST = '#ff4d6a';

/** 최고기록 한 줄 문자열. 없으면 안내 문구. (승/패 오버레이와 공유) */
export function formatBest(best: BestRecord | null): string {
  if (!best) return '최고 기록: 없음';
  const wavePart = best.cleared ? `웨이브 ${best.wave} 클리어` : `웨이브 ${best.wave}`;
  return `최고 기록: ${wavePart} (라이프 ${best.lives})`;
}

export function renderTitle(
  ctx: CanvasRenderingContext2D,
  best: BestRecord | null,
  difficulty: DifficultyId,
  mapId: MapId, // 선택된 디펜스 맵 — 버튼 하이라이트(D4.4→D7.2).
  conquestMap: ConquestMapId, // 선택된 정복 맵 — 버튼 하이라이트(D7.4).
  endlessBest = 0, // 엔드리스 최고 도달 웨이브(0이면 표시 안 함, D4.3).
  daily: DailyRecord | null = null, // 오늘의 맵 최고기록(D7.5) — 시드가 오늘이면 맵 버튼 옆에 표시.
  todaySeedVal = 0, // 오늘의 맵 시드(YYYYMMDD) — daily.seed와 일치할 때만 기록 표시.
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.save();
  paintBackdrop(ctx, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 로고 — 네온 글로우(맥동). 카드 그리드 공간 확보를 위해 상단에 압축 배치(D7.6).
  const glow = 16 + Math.sin(animTime() * 2) * 5;
  ctx.save();
  ctx.font = 'bold 60px system-ui, sans-serif';
  ctx.shadowColor = '#c9b05c';
  ctx.shadowBlur = glow;
  ctx.fillStyle = COLOR_LOGO;
  ctx.fillText('GRIDLOCK', w / 2, 50);
  ctx.shadowBlur = glow * 0.5;
  ctx.fillText('GRIDLOCK', w / 2, 50); // 2차 패스로 글로우 강화.
  ctx.restore();

  // 부제
  ctx.fillStyle = COLOR_SUB;
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText('미로형 타워 디펜스 · 미니 RTS', w / 2, 88);

  // 모드 버튼(네온)
  const b = titleButtons(w, h);
  drawButton(ctx, b.defense, '디펜스 모드', '#39d5ff', '20웨이브 생존');
  drawButton(ctx, b.conquest, '정복 모드', COLOR_NEON_CONQUEST, '본진 정복 RTS');

  // 맵 선택 카드 그리드(디펜스 4열×2행, 정복 3카드) + 정복 난이도(현재 선택 하이라이트).
  drawDefenseCards(ctx, w, h, mapId, todaySeedVal, daily); // 디펜스 맵(디펜스 버튼 아래).
  drawDifficultyButtons(ctx, w, h, difficulty); // 정복 난이도(정복 버튼 오른쪽).
  drawConquestCards(ctx, w, h, conquestMap); // 정복 맵(정복 버튼 아래, D7.4).

  // 최고기록(디펜스 기준)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLOR_BEST;
  ctx.font = '18px monospace';
  ctx.fillText(formatBest(best), w / 2, 604);

  // 엔드리스 최고 웨이브(기록이 있을 때만) — 디펜스 최고기록 바로 아래.
  if (endlessBest > 0) {
    ctx.fillStyle = COLOR_NEON_CONQUEST;
    ctx.font = '15px monospace';
    ctx.fillText(`엔드리스 최고: 웨이브 ${endlessBest}`, w / 2, 630);
  }

  ctx.restore();
}

// 다크 네이비 배경 + 옅은 그리드 + 스캔라인.
function paintBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0d1117');
  g.addColorStop(1, '#161b27');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(110, 170, 255, 0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 48) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
  }
  for (let y = 0; y <= h; y += 48) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
  }
  ctx.stroke();

  // 스캔라인(가로 옅은 줄).
  ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
}

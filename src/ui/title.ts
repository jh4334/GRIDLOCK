// 타이틀 화면(M9) — 캔버스에 로고/부제/조작 안내/최고기록/시작 안내를 그린다.
// 상태 변경 없는 순수 렌더. 시작 입력(클릭/Space)은 Game이 받아 상태를 전환한다.
// 최고기록 문자열 포맷(formatBest)은 승/패 오버레이와 공유한다.

import type { BestRecord } from '../core/storage';

const COLOR_BG = '#1a1a1f';
const COLOR_LOGO = '#9ad0ff';
const COLOR_SUB = '#c8c8d0';
const COLOR_GUIDE = '#a0a0aa';
const COLOR_GUIDE_KEY = '#ffd166';
const COLOR_BEST = '#7bd67b';
const COLOR_START = '#e6f2ff';

/** 최고기록 한 줄 문자열. 없으면 안내 문구. (승/패 오버레이와 공유) */
export function formatBest(best: BestRecord | null): string {
  if (!best) return '최고 기록: 없음';
  const wavePart = best.cleared ? `웨이브 ${best.wave} 클리어` : `웨이브 ${best.wave}`;
  return `최고 기록: ${wavePart} (라이프 ${best.lives})`;
}

export function renderTitle(ctx: CanvasRenderingContext2D, best: BestRecord | null): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.save();
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 로고
  ctx.fillStyle = COLOR_LOGO;
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.fillText('GRIDLOCK', w / 2, h * 0.24);

  // 부제
  ctx.fillStyle = COLOR_SUB;
  ctx.font = '22px system-ui, sans-serif';
  ctx.fillText('미로형 타워 디펜스 — 20웨이브 생존', w / 2, h * 0.24 + 62);

  // 조작 안내
  ctx.font = '16px system-ui, sans-serif';
  const guideTop = h * 0.46;
  const lineGap = 30;
  const rows = [
    ['타워 설치', '하단 버튼 선택 후 칸 클릭'],
    ['타워 선택', '설치된 타워 클릭'],
    ['업그레이드 / 판매', 'U 키 / X 키'],
    ['배속', 'x1 · x2 · x3 버튼'],
    ['취소', 'Esc'],
  ];
  rows.forEach(([label, value], i) => {
    const y = guideTop + i * lineGap;
    ctx.textAlign = 'right';
    ctx.fillStyle = COLOR_GUIDE_KEY;
    ctx.fillText(label, w / 2 - 14, y);
    ctx.textAlign = 'left';
    ctx.fillStyle = COLOR_GUIDE;
    ctx.fillText(value, w / 2 + 14, y);
  });

  // 최고기록
  ctx.textAlign = 'center';
  ctx.fillStyle = COLOR_BEST;
  ctx.font = '18px monospace';
  ctx.fillText(formatBest(best), w / 2, h * 0.82);

  // 시작 안내 (은은한 깜빡임)
  ctx.fillStyle = COLOR_START;
  ctx.font = 'bold 24px system-ui, sans-serif';
  const blink = 0.55 + 0.45 * Math.abs(Math.sin(performance.now() / 500));
  ctx.globalAlpha = blink;
  ctx.fillText('클릭 또는 Space 로 시작', w / 2, h * 0.9);

  ctx.restore();
}

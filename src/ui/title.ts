// 타이틀 화면 — 로고/부제/최고기록 + 모드 선택 버튼 두 개([디펜스 모드] [정복 모드]).
// 상태 변경 없는 순수 렌더. 기하·클릭 판정은 titleLayout.ts 하나가 소유한다(D9.3) —
// 렌더와 히트 판정이 같은 rect를 쓰지 않으면 축소된 모바일 화면에서 그대로 오탭이 된다.
// 최고기록 문자열 포맷(formatBest)은 승/패 오버레이와 공유한다.
//
// 좁은 화면(compact)에서는 레이아웃이 바뀐다: 모드 버튼 = 섹션 탭(비활성 탭은 전환, 활성 탭은 시작),
// 활성 섹션의 맵 카드만 2열×2행으로 크게 + 페이지 버튼, 난이도는 정복 섹션 하단 줄.

import type { BestRecord, DailyRecord, DifficultyId, MapId, ConquestMapId } from '../core/storage';
import { animTime } from '../render/sprites';
import { drawButton, drawDifficultyButtons, drawPager } from './titleButtons';
import { drawDefenseCards, drawConquestCards } from './mapCards';
import { titleLayout, DEFAULT_TITLE_UI, type TitleUi } from './titleLayout';
import { VIEW_W, VIEW_H } from '../render/viewport';

// 클릭 판정·레이아웃 상태 타입은 App이 쓰므로 하위 모듈에서 재노출(호출부 import 경로 단일화).
export { defenseCardPage, type TitleUi, type TitleMode } from './titleLayout';
export { hitTitle, type TitleAction } from './titleHit';

const COLOR_LOGO = '#e6d38f'; // STEEL GRID — 초원 전장 톤(앰버/올리브).
const COLOR_SUB = '#a8b48a';
const COLOR_BEST = '#e0b357';
const COLOR_NEON_DEFENSE = '#39d5ff';
const COLOR_NEON_CONQUEST = '#ff4d6a';

/** 최고기록 한 줄 문자열. 없으면 안내 문구. (승/패 오버레이와 공유) */
export function formatBest(best: BestRecord | null): string {
  if (!best) return '최고 기록: 없음';
  const wavePart = best.cleared ? `웨이브 ${best.wave} 클리어` : `웨이브 ${best.wave}`;
  return `최고 기록: ${wavePart} (라이프 ${best.lives})`;
}

// compact 전용 축약형 — 하단 줄 오른쪽 여백에 들어가야 해서 라이프까지는 못 싣는다.
function formatBestShort(best: BestRecord | null): string {
  if (!best) return '최고 기록 없음';
  return `최고 W${best.wave}${best.cleared ? ' 클리어' : ''}`;
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
  ui: TitleUi = DEFAULT_TITLE_UI, // 화면 배율·섹션·카드 페이지(D9.3). 기본값 = 데스크톱 레이아웃.
): void {
  const w = VIEW_W;
  const h = VIEW_H;
  const layout = titleLayout(ui);

  ctx.save();
  paintBackdrop(ctx, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 로고 — 네온 글로우(맥동). 카드 그리드 공간 확보를 위해 상단에 압축 배치(D7.6).
  const glow = 16 + Math.sin(animTime() * 2) * 5;
  ctx.save();
  ctx.font = `bold ${layout.logo.font}px system-ui, sans-serif`;
  ctx.shadowColor = '#c9b05c';
  ctx.shadowBlur = glow;
  ctx.fillStyle = COLOR_LOGO;
  ctx.fillText('GRIDLOCK', layout.logo.x, layout.logo.y);
  ctx.shadowBlur = glow * 0.5;
  ctx.fillText('GRIDLOCK', layout.logo.x, layout.logo.y); // 2차 패스로 글로우 강화.
  ctx.restore();

  // 부제(compact은 세로 예산상 생략)
  if (layout.subtitle) {
    ctx.fillStyle = COLOR_SUB;
    ctx.font = `${layout.subtitle.font}px system-ui, sans-serif`;
    ctx.fillText('미로형 타워 디펜스 · 미니 RTS', layout.subtitle.x, layout.subtitle.y);
  }

  // 모드 버튼(네온). compact에선 섹션 탭 — 활성 탭만 밝고 라벨이 '시작'으로 바뀐다.
  const active = (m: 'defense' | 'conquest') => !layout.compact || layout.section === m;
  const label = (m: 'defense' | 'conquest', name: string) =>
    layout.compact ? (active(m) ? `${name} 시작` : name) : `${name} 모드`;
  drawButton(ctx, layout.defenseBtn, label('defense', '디펜스'), COLOR_NEON_DEFENSE, '20웨이브 생존', layout.btn, !active('defense'));
  drawButton(ctx, layout.conquestBtn, label('conquest', '정복'), COLOR_NEON_CONQUEST, '본진 정복 RTS', layout.btn, !active('conquest'));

  // 맵 선택 카드 그리드 + 정복 난이도(현재 선택 하이라이트) + 카드 페이지 버튼(compact).
  drawDefenseCards(ctx, layout, mapId, todaySeedVal, daily);
  drawDifficultyButtons(ctx, layout, difficulty);
  drawConquestCards(ctx, layout, conquestMap);
  drawPager(ctx, layout, layout.section === 'defense' ? COLOR_NEON_DEFENSE : COLOR_NEON_CONQUEST);

  // 최고기록(디펜스 기준)
  ctx.textAlign = layout.best.align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLOR_BEST;
  ctx.font = `${layout.best.font}px monospace`;
  ctx.fillText(layout.best.short ? formatBestShort(best) : formatBest(best), layout.best.x, layout.best.y);

  // 엔드리스 최고 웨이브(기록이 있을 때만) — 디펜스 최고기록 바로 아래.
  if (endlessBest > 0) {
    ctx.fillStyle = COLOR_NEON_CONQUEST;
    ctx.font = `${layout.endless.font}px monospace`;
    ctx.textAlign = layout.endless.align;
    ctx.fillText(
      layout.best.short ? `엔드리스 W${endlessBest}` : `엔드리스 최고: 웨이브 ${endlessBest}`,
      layout.endless.x,
      layout.endless.y,
    );
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

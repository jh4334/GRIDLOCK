// 맵 선택 카드(D7.6) — 썸네일 + 맵 이름을 한 카드로 그리고, 선택 카드는 네온 테두리로 강조한다.
// 디펜스·정복 모두 같은 카드 컴포넌트를 공유한다(spec: 정복도 카드로 통일).
//
// D9.3: 카드 기하(그리드·페이지·라벨 밴드)는 titleLayout.ts로 옮겼다 — 렌더와 히트 판정이
// 같은 rect를 쓰게 하기 위함. 여기 남는 건 "받은 rect에 카드 한 장을 그리는" 렌더뿐이다.
// 썸네일은 논리 크기(120×84)로 구워 두고 카드 크기에 맞춰 확대해 그린다(compact 1.5배).

import type { DailyRecord, MapId, ConquestMapId } from '../core/storage';
import type { CardStyle, Rect, TitleLayout } from './titleLayout';
import { defenseThumbnail, conquestThumbnail } from './mapThumbnail';

const COLOR_NEON_DEFENSE = '#39d5ff';
const COLOR_NEON_CONQUEST = '#ff4d6a';

// 카드 한 장: 썸네일 이미지 + 테두리(선택 시 네온 글로우) + 이름. badge가 있으면 좌하단에 표기.
function drawCard(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  style: CardStyle,
  thumb: HTMLCanvasElement,
  name: string,
  selected: boolean,
  neon: string,
  badge: string | null,
): void {
  ctx.drawImage(thumb, rect.x, rect.y, rect.w, rect.h);

  ctx.save();
  ctx.strokeStyle = selected ? neon : 'rgba(120, 170, 230, 0.4)';
  if (selected) {
    ctx.shadowColor = neon;
    ctx.shadowBlur = 12;
  }
  ctx.lineWidth = selected ? 2.5 : 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  ctx.restore();

  if (badge) {
    ctx.save();
    ctx.fillStyle = 'rgba(8, 14, 22, 0.78)';
    ctx.fillRect(rect.x + 1, rect.y + rect.h + style.badgeBandDy, rect.w - 2, style.badgeBandH);
    ctx.fillStyle = neon;
    ctx.font = `bold ${style.badgeFont}px monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(badge, rect.x + style.badgePadX, rect.y + rect.h + style.badgeTextDy);
    ctx.restore();
  }

  ctx.fillStyle = selected ? (neon === COLOR_NEON_DEFENSE ? '#d7f4ff' : '#ffd7de') : 'rgba(200, 220, 255, 0.72)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `${selected ? 'bold ' : ''}${style.labelFont}px system-ui, sans-serif`;
  ctx.fillText(name, rect.x + rect.w / 2, rect.y + rect.h + style.labelDy);
}

/** 디펜스 맵 카드 그리드 렌더. daily 카드는 오늘 시드 기록이 있으면 좌하단 배지로 표시. */
export function drawDefenseCards(
  ctx: CanvasRenderingContext2D,
  layout: TitleLayout,
  current: MapId,
  todaySeedVal: number,
  daily: DailyRecord | null,
): void {
  for (const c of layout.defenseCards) {
    const thumb = defenseThumbnail(c.id, todaySeedVal);
    const badge =
      c.id === 'daily' && daily && daily.seed === todaySeedVal ? `W${daily.wave}${daily.cleared ? ' ✓' : ''}` : null;
    drawCard(ctx, c.rect, layout.card, thumb, c.name, c.id === current, COLOR_NEON_DEFENSE, badge);
  }
}

/** 정복 맵 카드 렌더(같은 카드 컴포넌트, 정복 네온). */
export function drawConquestCards(ctx: CanvasRenderingContext2D, layout: TitleLayout, current: ConquestMapId): void {
  for (const c of layout.conquestCards) {
    drawCard(ctx, c.rect, layout.card, conquestThumbnail(c.id), c.name, c.id === current, COLOR_NEON_CONQUEST, null);
  }
}

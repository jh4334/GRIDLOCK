// 타이틀 모드 버튼·난이도 버튼·페이지 버튼 렌더(D7.4 분리 → D9.3 기하 분리).
// 기하는 전부 titleLayout.ts가 계산한다 — 여기는 "받은 rect를 그리는" 일만 한다
// (렌더와 히트 판정이 같은 사각형을 쓰게 하려는 D9.3의 핵심 규칙).
//
// wide(데스크톱)에서는 D7.6과 같은 스타일 값이 layout에서 내려오므로 렌더 결과가 동일하다.
// compact(모바일)에서는 모드 버튼이 섹션 탭이라 비활성 탭을 dim으로 그린다.

import type { DifficultyId } from '../core/storage';
import type { BtnStyle, Rect, TitleLayout } from './titleLayout';

const COLOR_NEON_CONQUEST = '#ff4d6a';
const COLOR_DIM_LINE = 'rgba(120, 170, 230, 0.35)';
const COLOR_DIM_TEXT = 'rgba(200, 220, 255, 0.6)';
const COLOR_PANEL = 'rgba(20, 28, 44, 0.85)';

/** 모드 버튼(디펜스/정복) — 어두운 패널 + 네온 테두리 글로우 + 라벨·부제. dim은 compact 비활성 탭. */
export function drawButton(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  label: string,
  neon: string,
  sub: string,
  style: BtnStyle,
  dim = false,
): void {
  ctx.save();
  ctx.fillStyle = COLOR_PANEL;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = dim ? COLOR_DIM_LINE : neon;
  if (!dim) {
    ctx.shadowColor = neon;
    ctx.shadowBlur = 12;
  }
  ctx.lineWidth = dim ? 1 : 2;
  ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  ctx.restore();

  ctx.fillStyle = dim ? COLOR_DIM_TEXT : neon;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${style.labelFont}px system-ui, sans-serif`;
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + style.labelDy);
  if (style.subFont > 0) {
    ctx.font = `${style.subFont}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(200, 220, 255, 0.65)';
    ctx.fillText(sub, r.x + r.w / 2, r.y + r.h / 2 + style.subDy);
  }
}

/** 난이도 3버튼 렌더(현재 선택 강조, 정복 네온). 레이아웃이 난이도를 안 내리면(compact 디펜스 섹션) 생략. */
export function drawDifficultyButtons(ctx: CanvasRenderingContext2D, layout: TitleLayout, current: DifficultyId): void {
  const diff = layout.difficulty;
  if (!diff) return;

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `${diff.caption.font}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(200, 220, 255, 0.55)';
  ctx.fillText('난이도', diff.caption.x, diff.caption.y);
  ctx.restore();

  for (const { label, rect, id } of diff.list) {
    const selected = id === current;
    ctx.save();
    ctx.fillStyle = selected ? 'rgba(60, 26, 34, 0.9)' : COLOR_PANEL;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = selected ? COLOR_NEON_CONQUEST : COLOR_DIM_LINE;
    if (selected) {
      ctx.shadowColor = COLOR_NEON_CONQUEST;
      ctx.shadowBlur = 10;
    }
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
    ctx.restore();

    ctx.fillStyle = selected ? '#ffd7de' : COLOR_DIM_TEXT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${selected ? 'bold ' : ''}${diff.btnFont}px system-ui, sans-serif`;
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
  }
}

/** 카드 페이지 버튼(compact 전용) — [◀ 이전] [1 / 2] [다음 ▶]. wide는 pager가 없어 아무것도 안 그린다. */
export function drawPager(ctx: CanvasRenderingContext2D, layout: TitleLayout, neon: string): void {
  const p = layout.pager;
  if (!p) return;

  for (const [rect, text] of [
    [p.prev, '◀ 이전'],
    [p.next, '다음 ▶'],
  ] as const) {
    ctx.save();
    ctx.fillStyle = COLOR_PANEL;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = neon;
    ctx.shadowColor = neon;
    ctx.shadowBlur = 8;
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
    ctx.restore();

    ctx.fillStyle = neon;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${p.font}px system-ui, sans-serif`;
    ctx.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2);
  }

  ctx.fillStyle = 'rgba(200, 220, 255, 0.75)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${p.font}px system-ui, sans-serif`;
  ctx.fillText(`${p.index + 1} / ${p.total}`, p.label.x + p.label.w / 2, p.label.y + p.label.h / 2);
}

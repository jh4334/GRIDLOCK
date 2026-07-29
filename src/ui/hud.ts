// 캔버스 상단 HUD — 골드/라이프/웨이브 텍스트(우상단 정렬). FPS는 좌상단이라 겹치지 않는다.
// 모바일에서 캔버스가 CSS로 축소되면 글자도 같이 작아지므로, 렌더 시점 배율(hudScale)로
// 폰트·여백·줄간격을 함께 키워 화면상 크기를 유지한다(데스크톱 배율 1 → 기존과 동일, D8.4).

import type { Economy } from '../game/economy';
import { hudScale } from './uiScale';
import { VIEW_W } from '../render/viewport';

// 시각 상수(밸런스 아님) — 배율 1 기준 레이아웃.
const FONT_PX = 16;
const SEED_FONT_PX = 12;
const MARGIN = 8; // 우측·상단 여백.
const LINE = 20; // 줄간격.
const SEED_GAP = 22; // 웨이브 줄 ↔ 시드 줄 간격.

// D9.5 시드 줄 가독성 — 다른 HUD 줄(16px)과 달리 시드는 12px이라 hudScale 상한 2에서도
// 화면상 9.7px(잉크 8.9px)까지 작아져 390px 폭에서 읽히지 않는다. 12px 잉크를 확보하려면
// 기준을 17px까지 올려야 하는데, 그러면 데스크톱(배율 1) 시드 줄이 1.4배로 커져 외형이 바뀐다.
// 그래서 좁은 화면일 때만 기준을 올린다 — 분기 기준은 타이틀 compact와 같은 배율 1.5
// (= 캔버스 CSS 폭 640px 이하, D9.3). 데스크톱은 배율 1이라 기존 렌더와 완전히 동일하다.
const SEED_FONT_PX_COMPACT = 17;
const SEED_COMPACT_SCALE = 1.5;

/** 시드 줄의 최종 폰트 문자열. 렌더와 검증 훅(measureSeedText)이 반드시 이 함수만 쓴다. */
function seedFont(scale: number): string {
  const base = scale >= SEED_COMPACT_SCALE ? SEED_FONT_PX_COMPACT : SEED_FONT_PX;
  return `${base * scale}px monospace`;
}

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
    const right = VIEW_W - MARGIN * s;
    const top = MARGIN * s;

    ctx.fillStyle = '#ffd166';
    ctx.fillText(`골드 ${economy.gold}`, right, top);

    ctx.fillStyle = '#ff6b6b';
    ctx.fillText(`라이프 ${economy.lives}`, right, top + LINE * s);

    ctx.fillStyle = '#9ad0ff';
    const waveText = wave.endless ? `웨이브 ${wave.current} (엔드리스)` : `웨이브 ${wave.current}/${wave.total}`;
    ctx.fillText(waveText, right, top + LINE * 2 * s);

    if (seed !== null) {
      ctx.font = seedFont(s);
      ctx.fillStyle = 'rgba(180, 200, 230, 0.85)';
      ctx.fillText(`시드 #${seed}`, right, top + (LINE * 2 + SEED_GAP) * s);
    }

    ctx.restore();
  }
}

/** 시드 줄 실측값(논리 좌표 기준). E2E가 화면상 크기로 환산해 가독 기준을 검증한다(D9.5). */
export interface SeedTextMetrics {
  scale: number; // hudScale.
  fontPx: number; // 논리 폰트 크기(= 기준 × scale).
  inkPx: number; // 논리 잉크 높이(actualBoundingBox 상·하 합).
  cssW: number; // 캔버스 CSS 폭 — 논리→화면 환산 계수(cssW / 960)의 분자.
}

/**
 * 시드 줄이 실제로 그려지는 폰트로 잉크 높이를 잰다(상태 변경 없음, save/restore로 ctx 복원).
 * 렌더와 같은 seedFont()를 쓰므로 폰트 상수가 바뀌면 측정값도 같이 움직인다.
 */
export function measureSeedText(ctx: CanvasRenderingContext2D, text: string): SeedTextMetrics {
  const s = hudScale(ctx.canvas);
  ctx.save();
  ctx.font = seedFont(s);
  const m = ctx.measureText(text);
  const fontPx = Number.parseFloat(ctx.font);
  ctx.restore();
  return { scale: s, fontPx, inkPx: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, cssW: ctx.canvas.clientWidth };
}

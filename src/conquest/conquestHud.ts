// 정복 모드 HUD — 우상단에 크리스탈/인구 + 다음 적 공격까지 남은 시간. 승패 확정 시 결과
// 오버레이(반투명 + 문구)를 그린다. 순수 렌더(상태 변경 없음). '다시 시작/타이틀로' 버튼은
// HTML(controls)이 담당한다.

import type { ConquestPhase } from './conquestWorld';

export interface ConquestHudInfo {
  crystal: number;
  popUsed: number;
  popMax: number;
  secondsToAttack: number;
}

const OVERLAY_BG = 'rgba(0, 0, 0, 0.72)';
const COLOR_WIN = '#7bd67b';
const COLOR_LOSE = '#ff6b6b';
const COLOR_SUB = '#e0e0e0';

export function renderConquestHud(ctx: CanvasRenderingContext2D, info: ConquestHudInfo): void {
  ctx.save();
  ctx.font = '16px monospace';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'right';
  const right = ctx.canvas.width - 8;

  ctx.fillStyle = '#5be0d0';
  ctx.fillText(`크리스탈 ${info.crystal}`, right, 8);

  const popFull = info.popUsed >= info.popMax;
  ctx.fillStyle = popFull ? '#ff6b6b' : '#9ad0ff';
  ctx.fillText(`인구 ${info.popUsed}/${info.popMax}`, right, 28);

  // 다음 공격 임박(10초 이하) 시 붉게 강조.
  ctx.fillStyle = info.secondsToAttack <= 10 ? '#ff8a6a' : '#e0b357';
  ctx.textAlign = 'left';
  ctx.fillText(`적 공격까지 ${info.secondsToAttack}초`, 8, 8);

  ctx.restore();
}

/** 승패 확정 시 결과 오버레이(읽기 전용). playing이면 아무 것도 그리지 않는다. */
export function renderConquestOverlay(ctx: CanvasRenderingContext2D, phase: ConquestPhase): void {
  if (phase === 'playing') return;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.save();
  ctx.fillStyle = OVERLAY_BG;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const won = phase === 'won';
  ctx.fillStyle = won ? COLOR_WIN : COLOR_LOSE;
  ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.fillText(won ? '정복 성공!' : '본진 함락...', w / 2, h / 2 - 20);

  ctx.fillStyle = COLOR_SUB;
  ctx.font = '22px system-ui, sans-serif';
  ctx.fillText(won ? '적 본진을 파괴했다' : '적에게 본진을 빼앗겼다', w / 2, h / 2 + 32);
  ctx.restore();
}

// 정복 모드 HUD — 우상단에 크리스탈/인구 + 다음 적 공격까지 남은 시간. 승패 확정 시 결과
// 오버레이(반투명 + 문구)를 그린다. 순수 렌더(상태 변경 없음). '다시 시작/타이틀로' 버튼은
// HTML(controls)이 담당한다.

import type { ConquestPhase } from './conquestWorld';

export interface ConquestHudInfo {
  crystal: number;
  popUsed: number;
  popMax: number;
  secondsToAttack: number;
  unitCount: number; // 아군 전투 유닛 수(병력).
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

  // 아군 병력 수(배럭 선택 없이도 현재 병력 확인).
  ctx.fillStyle = '#9ad0ff';
  ctx.fillText(`병력 ${info.unitCount}`, 8, 28);

  ctx.restore();
}

/** 공격 이동(A키) 대기 커서 — 마우스 위치에 붉은 십자 + 라벨(읽기 전용). */
export function renderAttackMoveCursor(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.strokeStyle = '#ff6b6b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 9, y);
  ctx.lineTo(x + 9, y);
  ctx.moveTo(x, y - 9);
  ctx.lineTo(x, y + 9);
  ctx.stroke();
  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = '#ff6b6b';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('공격 이동', x + 12, y + 6);
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

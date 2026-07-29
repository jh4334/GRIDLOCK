// 정복 모드 HUD — 우상단에 크리스탈/인구 + 다음 적 공격까지 남은 시간. 승패 확정 시 결과
// 오버레이(반투명 + 문구)를 그린다. 순수 렌더(상태 변경 없음). '다시 시작/타이틀로' 버튼은
// HTML(controls)이 담당한다.

import type { ConquestPhase } from './conquestWorld';
import type { DifficultyId } from '../core/storage';
import { hudScale } from '../ui/uiScale';
import { VIEW_W, VIEW_H } from '../render/viewport';

export interface ConquestHudInfo {
  crystal: number;
  popUsed: number;
  popMax: number;
  secondsToAttack: number;
  unitCount: number; // 아군 전투 유닛 수(병력).
  difficulty: DifficultyId; // 현재 정복 난이도(HUD 소형 표시).
}

// 난이도 소형 라벨(HUD·타이틀 공용 표기).
export const DIFFICULTY_LABELS: Record<DifficultyId, string> = {
  easy: '쉬움',
  normal: '보통',
  hard: '어려움',
};

const OVERLAY_BG = 'rgba(0, 0, 0, 0.72)';
const COLOR_WIN = '#7bd67b';
const COLOR_LOSE = '#ff6b6b';
const COLOR_SUB = '#e0e0e0';

// 시각 상수(밸런스 아님) — 배율 1(데스크톱) 기준. 모바일 축소 시 hudScale로 함께 키운다(D8.4).
const HUD_PX = 16;
const HUD_MARGIN = 8;
const HUD_LINE = 20;
const OV_TITLE_PX = 56;
const OV_SUB_PX = 22;
const OV_TITLE_DY = -20;
const OV_SUB_DY = 32;

export function renderConquestHud(ctx: CanvasRenderingContext2D, info: ConquestHudInfo): void {
  const s = hudScale(ctx.canvas); // 캔버스 CSS 축소 보정(읽기 전용).
  ctx.save();
  ctx.font = `${HUD_PX * s}px monospace`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'right';
  const margin = HUD_MARGIN * s;
  const line = HUD_LINE * s;
  const right = VIEW_W - margin;

  ctx.fillStyle = '#5be0d0';
  ctx.fillText(`크리스탈 ${info.crystal}`, right, margin);

  const popFull = info.popUsed >= info.popMax;
  ctx.fillStyle = popFull ? '#ff6b6b' : '#9ad0ff';
  ctx.fillText(`인구 ${info.popUsed}/${info.popMax}`, right, margin + line);

  // 다음 공격 임박(10초 이하) 시 붉게 강조. 옆에 현재 난이도 소형 표시.
  ctx.textAlign = 'left';
  ctx.fillStyle = info.secondsToAttack <= 10 ? '#ff8a6a' : '#e0b357';
  const attackText = `적 공격까지 ${info.secondsToAttack}초 `;
  ctx.fillText(attackText, margin, margin);
  ctx.fillStyle = '#8fa8c8';
  ctx.fillText(`[${DIFFICULTY_LABELS[info.difficulty]}]`, margin + ctx.measureText(attackText).width, margin);

  // 아군 병력 수(배럭 선택 없이도 현재 병력 확인).
  ctx.fillStyle = '#9ad0ff';
  ctx.fillText(`병력 ${info.unitCount}`, margin, margin + line);

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
  const w = VIEW_W;
  const h = VIEW_H;
  const s = hudScale(ctx.canvas); // 캔버스 CSS 축소 보정(읽기 전용).

  ctx.save();
  ctx.fillStyle = OVERLAY_BG;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const won = phase === 'won';
  ctx.fillStyle = won ? COLOR_WIN : COLOR_LOSE;
  ctx.font = `bold ${OV_TITLE_PX * s}px system-ui, sans-serif`;
  ctx.fillText(won ? '정복 성공!' : '본진 함락...', w / 2, h / 2 + OV_TITLE_DY * s);

  ctx.fillStyle = COLOR_SUB;
  ctx.font = `${OV_SUB_PX * s}px system-ui, sans-serif`;
  ctx.fillText(won ? '적 본진을 파괴했다' : '적에게 본진을 빼앗겼다', w / 2, h / 2 + OV_SUB_DY * s);
  ctx.restore();
}

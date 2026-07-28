// D8.3 터치 배치 UX — 터치는 호버가 없어(손을 떼면 미리보기가 사라진다) "첫 탭 = 미리보기,
// 같은 칸 재탭 = 확정"의 2탭 규칙으로 배치한다. 그 대기 칸(pending) 상태와, 대기 칸/호버 칸을
// 그리는 설치 미리보기 렌더(호버 강조·고스트·사거리 링)를 함께 소유한다 —
// interaction.ts가 300줄 상한이라 미리보기 관심사를 이 파일로 분리했다.
//
// 드래그와의 관계는 가장 단순한 규칙으로 둔다: 대기 칸은 탭(이동 임계값 미만)에서만 바뀐다.
// 드래그(임계값 초과)는 MouseInput이 클릭 콜백 대신 드래그 콜백으로 보내므로 여기 오지 않고,
// 대기 칸도 건드리지 않는다 — 대기 칸을 띄운 채 드래그해도 미리보기가 그대로 남아 재탭으로 확정된다.
//
// 상태 변경은 tap/clear에서만, render 계열은 읽기 전용(update/render 분리 규칙).

import { TILE, cellToPixel } from './grid';
import { towerSpec, type TowerKind } from '../entities/tower';
import { drawTower, drawRangeRing, type TowerVisualKind } from '../render/towerSprites';

// 시각 상수(밸런스 아님).
const COLOR_HOVER = 'rgba(255, 255, 255, 0.18)';
const COLOR_GHOST_OK = 'rgba(90, 220, 120, 0.35)'; // 설치 가능 칸
const COLOR_GHOST_BAD = 'rgba(230, 70, 70, 0.35)'; // 설치 불가 칸
const GHOST_ALPHA = 0.5; // 고스트 타워 반투명도

export interface Cell {
  cx: number;
  cy: number;
}

export interface Ghost {
  cx: number;
  cy: number;
  valid: boolean;
}

/** 터치 2탭 배치의 대기 칸 상태. 탭 1회 = 미리보기, 같은 칸 재탭 = 확정. */
export class TouchPlacement {
  private pending: Cell | null = null;

  /** 대기 칸(없으면 null). Interaction이 호버 칸 대신 공급해 손을 뗀 뒤에도 고스트를 유지한다. */
  get cell(): Cell | null {
    return this.pending;
  }

  /**
   * 터치 탭 처리 — 대기 칸과 같은 칸이면 'confirm'(대기 해제 후 호출부가 설치 확정),
   * 아니면 'preview'(대기 칸을 그 칸으로 이동, 배치 없음).
   * 확정 시도 뒤에는 성공·거부(골드/봉쇄)와 무관하게 대기 칸이 비어 다음 탭이 다시 미리보기가 된다.
   */
  tap(cx: number, cy: number): 'preview' | 'confirm' {
    if (this.pending && this.pending.cx === cx && this.pending.cy === cy) {
      this.pending = null;
      return 'confirm';
    }
    this.pending = { cx, cy };
    return 'preview';
  }

  /** 설치 모드 해제·전환·리셋 시 대기 칸 폐기. */
  clear(): void {
    this.pending = null;
  }
}

/** 비설치 모드의 호버 칸 강조(읽기 전용). */
export function renderHoverCell(ctx: CanvasRenderingContext2D, cell: Cell | null): void {
  if (!cell) return;
  const { x, y } = cellToPixel(cell.cx, cell.cy);
  ctx.fillStyle = COLOR_HOVER;
  ctx.fillRect(x, y, TILE, TILE);
}

/**
 * 설치 고스트 — 가능/불가 칸 색 + 반투명 타워 스프라이트(읽기 전용).
 * withRange는 터치 대기 칸일 때만 true다. 사거리 링을 마우스 호버 고스트에 붙이면
 * 기존 마우스 UX가 바뀌므로, 호버가 없어 판단 근거가 부족한 터치에서만 덧그린다.
 */
export function renderGhostCell(
  ctx: CanvasRenderingContext2D,
  g: Ghost,
  kind: TowerKind,
  withRange: boolean,
): void {
  const { x, y } = cellToPixel(g.cx, g.cy);
  ctx.fillStyle = g.valid ? COLOR_GHOST_OK : COLOR_GHOST_BAD;
  ctx.fillRect(x, y, TILE, TILE);

  ctx.save();
  ctx.globalAlpha = GHOST_ALPHA;
  drawTower(ctx, kind as TowerVisualKind, 1, x + TILE / 2, y + TILE / 2, 0);
  ctx.restore();

  // 배럭(range 0)은 링이 없다.
  const range = towerSpec(kind).range;
  if (withRange && range > 0) drawRangeRing(ctx, x + TILE / 2, y + TILE / 2, range);
}

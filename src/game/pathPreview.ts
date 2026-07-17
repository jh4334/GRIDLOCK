// D2.2 경로 미리보기 상태 — 설치 모드에서 고스트 칸을 임시 벽으로 가정한 예상 경로를
// 호버 칸이 바뀔 때만 계산·캐시하고(매 프레임 재계산 금지) 회색 반투명 도로로 그린다.
// update/render 분리: 계산·캐시는 update 계열(sync)에서만, render는 읽기 전용.

import type { Grid } from './grid';
import { computePreviewCells, renderRoad, type RoadPiece } from '../render/roadPath';

type Ghost = { cx: number; cy: number; valid: boolean };

export class PathPreview {
  private cells: RoadPiece[] = [];
  private forCell: { cx: number; cy: number } | null = null; // 캐시 키(계산 기준 호버 칸).

  /**
   * 고스트(설치 모드 유효 칸)를 따라 미리보기를 맞춘다 — updateHover가 프레임당 1회 호출.
   * 유효 고스트면 update(호버 칸 변경 시에만 재계산), 아니면(비설치·호버 이탈·설치 불가) clear.
   */
  sync(grid: Grid, ghost: Ghost | null): void {
    if (ghost && ghost.valid) this.update(grid, ghost.cx, ghost.cy);
    else this.clear();
  }

  // 호버 칸이 바뀐 경우에만 예상 경로 재계산. 봉쇄면 빈 배열 → 미리보기 없음.
  private update(grid: Grid, cx: number, cy: number): void {
    if (this.forCell && this.forCell.cx === cx && this.forCell.cy === cy) return;
    this.cells = computePreviewCells(grid, cx, cy);
    this.forCell = { cx, cy };
  }

  /** 캐시 무효화 — 설치 모드 해제/설치 확정/판매/호버 이탈 시(전부 sync가 감지). */
  clear(): void {
    this.cells = [];
    this.forCell = null;
  }

  /** 회색 반투명 도로로 오버레이(비었으면 아무것도 안 그림). 읽기 전용. */
  render(ctx: CanvasRenderingContext2D): void {
    if (this.cells.length) renderRoad(ctx, this.cells, true);
  }
}

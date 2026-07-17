// 정복 모드 그리드 — 디펜스 Grid와 별도(스폰/기지 개념이 없고 셀 종류가 다르다).
// 20×14 칸·48px 좌표계는 그대로 재사용(grid.ts의 순수 좌표 유틸을 import).
//
// 셀 종류: empty(통행 가능) / crystal(채집지, 통행·건설 불가) / wall(본진·건물, 통행 차단).
// A*는 systems/astar의 PathGrid 인터페이스로 이 클래스를 받는다(구조적 계약).
// 정적 레이어(바닥+격자)만 프리렌더하고, 크리스탈·본진·건물은 동적 엔티티가 직접 그린다.

import { COLS, ROWS, TILE, cellToPixel } from '../game/grid';
import { paintCircuitFloor } from '../render/tileSprites';
import type { PathGrid } from '../systems/astar';

export type ConquestCell = 'empty' | 'crystal' | 'wall';

const COLOR_FLOOR = '#141a2e'; // 정복 바닥(디펜스보다 살짝 푸른 톤).

export class ConquestGrid implements PathGrid {
  readonly cols = COLS;
  readonly rows = ROWS;

  private cells: ConquestCell[];
  private staticLayer: HTMLCanvasElement;

  constructor() {
    this.cells = new Array(COLS * ROWS).fill('empty');
    this.staticLayer = this.buildStaticLayer();
  }

  private index(cx: number, cy: number): number {
    return cy * COLS + cx;
  }

  inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS;
  }

  /** 통행 가능 칸인가 — 빈 칸만. 크리스탈·벽(본진/건물)은 막힘. */
  isWalkable(cx: number, cy: number): boolean {
    return this.inBounds(cx, cy) && this.cells[this.index(cx, cy)] === 'empty';
  }

  getState(cx: number, cy: number): ConquestCell | undefined {
    if (!this.inBounds(cx, cy)) return undefined;
    return this.cells[this.index(cx, cy)];
  }

  setState(cx: number, cy: number, state: ConquestCell): void {
    if (!this.inBounds(cx, cy)) return;
    this.cells[this.index(cx, cy)] = state;
  }

  /** 모든 칸을 빈 칸으로 되돌린다(모드 재진입 시 초기화). */
  resetCells(): void {
    this.cells.fill('empty');
  }

  private buildStaticLayer(): HTMLCanvasElement {
    const layer = document.createElement('canvas');
    layer.width = COLS * TILE;
    layer.height = ROWS * TILE;
    const c = layer.getContext('2d');
    if (!c) throw new Error('오프스크린 Canvas 2D context를 얻을 수 없습니다.');

    paintCircuitFloor(c, COLS, ROWS, COLOR_FLOOR);
    return layer;
  }

  /** 정적 레이어(바닥+격자)를 통째로 찍는다(읽기 전용). */
  render(ctx: CanvasRenderingContext2D): void {
    ctx.drawImage(this.staticLayer, 0, 0);
  }
}

/** 대상 칸(비통행)에 인접한 통행 가능 칸 목록(4방향). 일꾼 접근점 후보. */
export function walkableNeighbors(grid: ConquestGrid, cx: number, cy: number): { cx: number; cy: number }[] {
  const dirs = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];
  const out: { cx: number; cy: number }[] = [];
  for (const [dx, dy] of dirs) {
    if (grid.isWalkable(cx + dx, cy + dy)) out.push({ cx: cx + dx, cy: cy + dy });
  }
  return out;
}

/** 셀 픽셀 좌상단(외부에서 grid.ts를 또 import하지 않도록 재노출). */
export { cellToPixel };

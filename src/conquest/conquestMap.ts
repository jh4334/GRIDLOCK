// 정복 모드 그리드 — 디펜스 Grid와 별도(스폰/기지 개념이 없고 셀 종류가 다르다).
// 20×14 칸·48px 좌표계는 그대로 재사용(grid.ts의 순수 좌표 유틸을 import).
//
// 셀 종류: empty(통행 가능) / crystal(채집지, 통행·건설 불가) / wall(본진·건물, 통행 차단).
// A*는 systems/astar의 PathGrid 인터페이스로 이 클래스를 받는다(구조적 계약).
// 정적 레이어(바닥+격자)만 프리렌더하고, 크리스탈·본진·건물은 동적 엔티티가 직접 그린다.

import { COLS, ROWS, TILE, cellToPixel, cellCenter } from '../game/grid';
import { paintGroundFloor, drawRock } from '../render/tileSprites';
import { onAssetsReady } from '../render/sprites';
import type { PathGrid } from '../systems/astar';

// 셀 종류(D7.4에서 rock 추가) — empty(통행) / crystal(채집지·통행×) / wall(본진·건물·통행×) /
// rock(맵 지형 장애물·통행×·건설×). isWalkable은 empty만 참이라 rock은 자동으로 벽처럼 막힌다.
export type ConquestCell = 'empty' | 'crystal' | 'wall' | 'rock';

export class ConquestGrid implements PathGrid {
  readonly cols = COLS;
  readonly rows = ROWS;

  private cells: ConquestCell[];
  private staticLayer: HTMLCanvasElement;
  // 맵 지형 바위 좌표(정적, D7.4). setRocks가 주입하고 정적 레이어·미니맵이 읽는다.
  private rockCells: [number, number][] = [];

  constructor() {
    this.cells = new Array(COLS * ROWS).fill('empty');
    this.staticLayer = this.buildStaticLayer();
    // 에셋 스킨 로드가 끝나면 사막 타일로 정적 바닥을 재빌드(로드 전엔 베이스색 폴백).
    onAssetsReady(() => {
      this.staticLayer = this.buildStaticLayer();
    });
  }

  /** 맵 바위 지형 주입(D7.4) — 칸을 rock으로 세우고 정적 레이어에 바위를 구워 둔다(통행·건설 불가). */
  setRocks(cells: readonly [number, number][]): void {
    this.rockCells = cells.map(([cx, cy]) => [cx, cy]);
    for (const [cx, cy] of this.rockCells) this.setState(cx, cy, 'rock');
    this.staticLayer = this.buildStaticLayer();
  }

  /** 바위 좌표 목록(미니맵 표시용, 읽기 전용 스냅샷). */
  get rocks(): { cx: number; cy: number }[] {
    return this.rockCells.map(([cx, cy]) => ({ cx, cy }));
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

    paintGroundFloor(c, COLS, ROWS, 'sand');
    // 맵 지형 바위(D7.4)를 바닥 위에 함께 구워 둔다 — 게임 중 불변이라 매 프레임 그릴 필요 없음.
    for (const [cx, cy] of this.rockCells) {
      const { x, y } = cellCenter(cx, cy);
      drawRock(c, x, y);
    }
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

// 20×14 그리드 자료구조 + 좌표 변환 유틸 + 정적 레이어 프리렌더.
//
// 그리드 크기와 타일 크기는 밸런스 수치가 아니라 캔버스 해상도를 결정하는
// 구조 상수이므로 코드 상수로 둔다 (CLAUDE.md 예외 규정).
// 20열 × 14행 × 48px = 캔버스 960×672 와 정확히 일치.

export const COLS = 20;
export const ROWS = 14;
export const TILE = 48;

// 회로 바닥·스폰 포털·기지 리액터 스프라이트(NEON GRID 아트 패스).
import { paintCircuitFloor, drawPortal, drawReactor } from '../render/tileSprites';

// 스폰: 좌측 중앙 / 기지: 우측 중앙.
export const SPAWN = { cx: 0, cy: 7 } as const;
export const BASE = { cx: COLS - 1, cy: 7 } as const;

// 칸 상태 — M1에서는 빈 칸/타워 두 종류. 스폰·기지는 별도 특수 칸으로 표시한다.
export type CellState = 'empty' | 'tower';

// NEON GRID 바닥 베이스색(밸런스 아닌 시각 상수). 회로 패턴·격자선은 tileSprites가 그린다.
const COLOR_FLOOR = '#12172a';

// ── 좌표 변환 유틸 ─────────────────────────────────────────────
// 인자 px, py 는 이미 캔버스 픽셀 좌표계로 보정된 값이어야 한다 (core/input.ts 참고).

/** 캔버스 픽셀 좌표 → 칸 인덱스. 범위 밖 값도 그대로 계산하므로 호출부에서 inBounds로 검사. */
export function pixelToCell(px: number, py: number): { cx: number; cy: number } {
  return { cx: Math.floor(px / TILE), cy: Math.floor(py / TILE) };
}

/** 칸 인덱스 → 칸 좌상단 픽셀 좌표. */
export function cellToPixel(cx: number, cy: number): { x: number; y: number } {
  return { x: cx * TILE, y: cy * TILE };
}

/** 칸 인덱스 → 칸 중심 픽셀 좌표. */
export function cellCenter(cx: number, cy: number): { x: number; y: number } {
  return { x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 };
}

// ── Grid ───────────────────────────────────────────────────────
export class Grid {
  readonly cols = COLS;
  readonly rows = ROWS;

  // 1차원 배열로 관리 (index = cy * COLS + cx).
  private cells: CellState[];
  // 정적 바닥+격자+스폰/기지 표시를 1회 프리렌더해 둔 오프스크린 캔버스.
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

  /** 적이 지나갈 수 있는 칸인가 (범위 안 + 타워 아님). 스폰·기지는 빈 칸이라 통행 가능. */
  isWalkable(cx: number, cy: number): boolean {
    return this.inBounds(cx, cy) && this.cells[this.index(cx, cy)] !== 'tower';
  }

  getState(cx: number, cy: number): CellState | undefined {
    if (!this.inBounds(cx, cy)) return undefined;
    return this.cells[this.index(cx, cy)];
  }

  setState(cx: number, cy: number, state: CellState): void {
    if (!this.inBounds(cx, cy)) return;
    this.cells[this.index(cx, cy)] = state;
  }

  /** 재시작 — 모든 칸을 빈 칸으로 되돌린다(정적 레이어는 스폰/기지 고정이라 그대로). */
  resetCells(): void {
    this.cells.fill('empty');
  }

  isSpawn(cx: number, cy: number): boolean {
    return cx === SPAWN.cx && cy === SPAWN.cy;
  }

  isBase(cx: number, cy: number): boolean {
    return cx === BASE.cx && cy === BASE.cy;
  }

  // 정적 레이어(바닥+격자+스폰/기지)를 오프스크린 캔버스에 1회만 그린다.
  private buildStaticLayer(): HTMLCanvasElement {
    const layer = document.createElement('canvas');
    layer.width = COLS * TILE;
    layer.height = ROWS * TILE;
    const c = layer.getContext('2d');
    if (!c) throw new Error('오프스크린 Canvas 2D context를 얻을 수 없습니다.');

    // 회로기판 바닥 + 옅은 격자선(1회 프리렌더). 스폰/기지는 애니메이션이라 render에서 동적으로.
    paintCircuitFloor(c, COLS, ROWS, COLOR_FLOOR);
    return layer;
  }

  /** 정적 바닥 + 동적 스폰 포털/기지 리액터(시간 기반 펄스)를 그린다 (상태 변경 없음). */
  render(ctx: CanvasRenderingContext2D): void {
    ctx.drawImage(this.staticLayer, 0, 0);
    const spawn = cellCenter(SPAWN.cx, SPAWN.cy);
    drawPortal(ctx, spawn.x, spawn.y);
    const base = cellCenter(BASE.cx, BASE.cy);
    drawReactor(ctx, base.x, base.y, 'cyan');
  }
}

// 20×14 그리드 자료구조 + 좌표 변환 유틸 + 정적 레이어 프리렌더.
//
// 그리드 크기와 타일 크기는 밸런스 수치가 아니라 캔버스 해상도를 결정하는
// 구조 상수이므로 코드 상수로 둔다 (CLAUDE.md 예외 규정).
// 20열 × 14행 × 48px = 캔버스 960×672 와 정확히 일치.

export const COLS = 20;
export const ROWS = 14;
export const TILE = 48;

// 지형 바닥·스폰 포털·기지 리액터·바위 스프라이트(STEEL GRID 아트 패스).
import { paintGroundFloor, drawPortal, drawReactor, drawRock } from '../render/tileSprites';
import { onAssetsReady } from '../render/sprites';
import type { RockCell } from './maps';

// 스폰: 좌측 중앙 / 기지: 우측 중앙.
export const SPAWN = { cx: 0, cy: 7 } as const;
export const BASE = { cx: COLS - 1, cy: 7 } as const;

// 칸 상태 — 빈 칸/타워/바위. 스폰·기지는 별도 특수 칸으로 표시한다.
// 'rock'(D4.4): 맵이 미리 배치한 장애물 — 통행·건설·판매 불가(정적, 게임 중 불변).
export type CellState = 'empty' | 'tower' | 'rock';

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
  // 정적 바닥+격자+스폰/기지+바위 표시를 1회 프리렌더해 둔 오프스크린 캔버스.
  private staticLayer: HTMLCanvasElement;
  // 현재 맵의 바위 칸(정적). resetCells가 재주입하고 buildStaticLayer가 그린다(D4.4).
  private rocks: RockCell[] = [];

  constructor() {
    this.cells = new Array(COLS * ROWS).fill('empty');
    this.staticLayer = this.buildStaticLayer();
    // 에셋 스킨 로드가 끝나면 초원 타일로 정적 바닥을 재빌드(로드 전엔 베이스색 폴백).
    onAssetsReady(() => {
      this.staticLayer = this.buildStaticLayer();
    });
  }

  private index(cx: number, cy: number): number {
    return cy * COLS + cx;
  }

  inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS;
  }

  /** 적이 지나갈 수 있는 칸인가 (범위 안 + 빈 칸). 타워·바위는 벽. 스폰·기지는 빈 칸이라 통행 가능. */
  isWalkable(cx: number, cy: number): boolean {
    return this.inBounds(cx, cy) && this.cells[this.index(cx, cy)] === 'empty';
  }

  getState(cx: number, cy: number): CellState | undefined {
    if (!this.inBounds(cx, cy)) return undefined;
    return this.cells[this.index(cx, cy)];
  }

  setState(cx: number, cy: number, state: CellState): void {
    if (!this.inBounds(cx, cy)) return;
    this.cells[this.index(cx, cy)] = state;
  }

  /** 재시작 — 타워를 걷어내고 맵의 바위는 유지한다(같은 맵으로 재플레이). */
  resetCells(): void {
    this.cells.fill('empty');
    for (const [cx, cy] of this.rocks) {
      if (this.inBounds(cx, cy)) this.cells[this.index(cx, cy)] = 'rock';
    }
  }

  /**
   * 맵 로드(D4.4) — 바위 좌표를 주입해 정적 지형을 세팅한다. 디펜스 진입 시 App→Game이 호출.
   * 칸을 바위로 세우고 정적 레이어를 재빌드(바위 스프라이트를 바닥 위에 굽는다). 재시작은
   * resetCells가 같은 바위를 되살려 같은 맵을 유지한다.
   */
  setMap(rocks: RockCell[]): void {
    this.rocks = rocks.map(([cx, cy]) => [cx, cy] as RockCell);
    this.resetCells();
    this.staticLayer = this.buildStaticLayer();
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

    // 초원 지형 바닥 + 옅은 격자선(1회 프리렌더). 스폰/기지는 애니메이션이라 render에서 동적으로.
    paintGroundFloor(c, COLS, ROWS, 'grass');
    // 바위(정적 장애물)는 바닥 위에 함께 구워 둔다 — 게임 중 불변이라 매 프레임 그릴 필요 없음(D4.4).
    for (const [cx, cy] of this.rocks) {
      const { x, y } = cellCenter(cx, cy);
      drawRock(c, x, y);
    }
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

// 20×14 그리드 자료구조 + 좌표 변환 유틸 + 정적 레이어 프리렌더.
//
// 그리드 크기와 타일 크기는 밸런스 수치가 아니라 캔버스 해상도를 결정하는
// 구조 상수이므로 코드 상수로 둔다 (CLAUDE.md 예외 규정).
// 20열 × 14행 × 48px = 캔버스 960×672 와 정확히 일치.

export const COLS = 20;
export const ROWS = 14;
export const TILE = 48;

// 지형 바닥·스폰 포털·기지 리액터·바위 스프라이트(STEEL GRID 아트 패스) + 물·거친땅 타일(D7.1).
import { paintGroundFloor, drawPortal, drawReactor, drawRock } from '../render/tileSprites';
import { drawWater, drawRough } from '../render/terrainTiles';
import { onAssetsReady } from '../render/sprites';
import type { MapTerrain, TerrainCell } from './maps';

// 스폰: 좌측 중앙 / 기지: 우측 중앙.
export const SPAWN = { cx: 0, cy: 7 } as const;
export const BASE = { cx: COLS - 1, cy: 7 } as const;

// 칸 상태 — 빈 칸/타워/지형 3종(D7.1). 스폰·기지는 별도 특수 칸으로 표시한다.
//   'rock'(D4.4)  — 통행×·건설× (장애물).
//   'water'(D7.1) — 통행×·건설× (물, 시각만 구분).
//   'rough'(D7.1) — 통행○·건설○이되 적 이속 감속(전략 지형).
// 지형은 맵이 미리 배치하며 게임 중 불변(타워를 rough 위에 설치·판매하면 rough로 복원).
export type CellState = 'empty' | 'tower' | 'rock' | 'water' | 'rough';

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
  // 정적 바닥+격자+스폰/기지+지형(바위/물/거친땅) 표시를 1회 프리렌더한 오프스크린 캔버스.
  private staticLayer: HTMLCanvasElement;
  // 현재 맵의 지형(정적). resetCells가 재주입하고 buildStaticLayer가 그린다(D4.4→D7.1).
  private terrain: MapTerrain = { rock: [], water: [], rough: [] };

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

  /** 적이 지나갈 수 있는 칸인가. 빈 칸·rough(감속 지형)는 통행 가능, 타워·바위·물은 벽(D7.1). */
  isWalkable(cx: number, cy: number): boolean {
    if (!this.inBounds(cx, cy)) return false;
    const s = this.cells[this.index(cx, cy)];
    return s === 'empty' || s === 'rough';
  }

  /** rough(거친 지형) 칸인가 — 적 이속 감속 판정용(D7.1). 타워가 올라가면 'tower'라 false. */
  isRough(cx: number, cy: number): boolean {
    return this.inBounds(cx, cy) && this.cells[this.index(cx, cy)] === 'rough';
  }

  getState(cx: number, cy: number): CellState | undefined {
    if (!this.inBounds(cx, cy)) return undefined;
    return this.cells[this.index(cx, cy)];
  }

  setState(cx: number, cy: number, state: CellState): void {
    if (!this.inBounds(cx, cy)) return;
    this.cells[this.index(cx, cy)] = state;
  }

  // 지형 좌표를 해당 상태로 칸에 세운다(범위 밖은 무시).
  private applyTerrain(cells: TerrainCell[], state: CellState): void {
    for (const [cx, cy] of cells) {
      if (this.inBounds(cx, cy)) this.cells[this.index(cx, cy)] = state;
    }
  }

  /** 재시작 — 타워를 걷어내고 맵 지형(바위·물·거친땅)은 유지한다(같은 맵으로 재플레이). */
  resetCells(): void {
    this.cells.fill('empty');
    this.applyTerrain(this.terrain.rough, 'rough');
    this.applyTerrain(this.terrain.water, 'water');
    this.applyTerrain(this.terrain.rock, 'rock');
  }

  /**
   * 타워 판매 시 칸 복원 — 원래 rough 지형이었으면 rough로, 아니면 빈 칸으로 되돌린다(D7.1).
   * 타워는 빈 칸·rough 위에만 설치되므로 두 경우만 처리한다.
   */
  restoreTerrainCell(cx: number, cy: number): void {
    if (!this.inBounds(cx, cy)) return;
    const wasRough = this.terrain.rough.some(([rx, ry]) => rx === cx && ry === cy);
    this.cells[this.index(cx, cy)] = wasRough ? 'rough' : 'empty';
  }

  /**
   * 맵 로드(D4.4→D7.1) — 지형 3종(바위·물·거친땅) 좌표를 주입해 정적 지형을 세팅한다.
   * 디펜스 진입 시 App→Game이 호출. 칸을 지형 상태로 세우고 정적 레이어를 재빌드(지형
   * 스프라이트를 바닥 위에 굽는다). 재시작은 resetCells가 같은 지형을 되살려 맵을 유지한다.
   */
  setMap(terrain: MapTerrain): void {
    this.terrain = {
      rock: terrain.rock.map(([cx, cy]) => [cx, cy] as TerrainCell),
      water: terrain.water.map(([cx, cy]) => [cx, cy] as TerrainCell),
      rough: terrain.rough.map(([cx, cy]) => [cx, cy] as TerrainCell),
    };
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
    // 정적 지형(D7.1)을 바닥 위에 함께 구워 둔다 — 게임 중 불변이라 매 프레임 그릴 필요 없음.
    // 거친땅·물(바닥 타일) 먼저, 바위(장애물)를 그 위에.
    for (const [cx, cy] of this.terrain.rough) drawRough(c, cx, cy);
    for (const [cx, cy] of this.terrain.water) {
      const { x, y } = cellCenter(cx, cy);
      drawWater(c, x, y);
    }
    for (const [cx, cy] of this.terrain.rock) {
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

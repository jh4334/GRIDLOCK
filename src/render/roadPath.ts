// 동적 도로 경로 — 디펜스 모드에서 적이 따라가는 스폰→기지 현재 최단 경로를 Kenney 도로
// 타일로 바닥에 깐다. 순수 렌더 기능(게임 로직 무변경): flowField가 바뀔 때(설치/판매/시작)
// Game이 computeRoadCells로 조각 목록을 1회 계산해 상태로 들고, render는 renderRoad로 읽기만 한다.
//
// ── 조각 결정 ────────────────────────────────────────────────────
// 각 칸은 이전 칸(적이 온 방향)·다음 칸(적이 갈 방향)과 도로로 이어진다. 두 이음 변으로 조각을 정한다.
//   진입 방향(prev→cur)의 반대 변 = 이전 칸 쪽 이음, 진출 방향(cur→next) 변 = 다음 칸 쪽 이음.
//   {좌,우}=h, {상,하}=v, {상,좌}=ul, {상,우}=ur, {하,좌}=ll, {하,우}=lr.
// 스폰(끝점)은 진출 방향 직선, 기지는 진입 방향 직선(단일 방향을 양쪽으로 써 직선을 만든다).
//
// ── 코너 매핑 근거(Kenney tileGrass_roadCorner*) ──────────────────
// 실제 PNG 픽셀 분석으로 각 코너가 잇는 두 변을 확정: UL=상+좌, UR=상+우, LL=하+좌, LR=하+우.

import { FlowField, computeFlowField } from '../systems/pathfinding';
import { SPAWN, BASE, COLS, ROWS, TILE, cellToPixel, type Grid } from '../game/grid';
import { getSprite, assetsReady } from './sprites';

export type RoadKind = 'h' | 'v' | 'ul' | 'ur' | 'll' | 'lr';
export interface RoadPiece {
  cx: number;
  cy: number;
  kind: RoadKind;
}

interface Step {
  cx: number;
  cy: number;
}

// 방향 벡터 → 그 방향의 칸 변('상'/'하'/'좌'/'우').
type Edge = 't' | 'b' | 'l' | 'r';
function edgeOf(dx: number, dy: number): Edge {
  if (dy < 0) return 't';
  if (dy > 0) return 'b';
  if (dx < 0) return 'l';
  return 'r';
}

// 두 이음 변 → 도로 조각. 변 조합을 정렬 키로 만들어 매핑(순서 무관).
const EDGE_TO_KIND: Record<string, RoadKind> = {
  lr: 'h', // 좌+우 = 가로 직선
  bt: 'v', // 상+하 = 세로 직선
  lt: 'ul', // 상+좌
  rt: 'ur', // 상+우
  bl: 'll', // 하+좌
  br: 'lr', // 하+우
};

function pieceKind(inDx: number, inDy: number, outDx: number, outDy: number): RoadKind {
  const a = edgeOf(-inDx, -inDy); // 이전 칸 쪽 변(진입의 반대).
  const b = edgeOf(outDx, outDy); // 다음 칸 쪽 변(진출).
  const key = [a, b].sort().join('');
  return EDGE_TO_KIND[key] ?? 'h';
}

/**
 * SPAWN에서 field.getDir를 따라 BASE까지 걸으며 도로 조각 목록을 만든다.
 * 무한 루프 가드: 칸 수 상한 COLS×ROWS. 도달 불가(막다른 방향 or BASE 미도달)면 빈 배열.
 */
export function computeRoadCells(field: FlowField): RoadPiece[] {
  const cells: Step[] = [];
  let cx = SPAWN.cx;
  let cy = SPAWN.cy;
  const max = COLS * ROWS;
  let reached = false;

  for (let i = 0; i < max; i++) {
    cells.push({ cx, cy });
    if (cx === BASE.cx && cy === BASE.cy) {
      reached = true;
      break;
    }
    const { dx, dy } = field.getDir(cx, cy);
    if (dx === 0 && dy === 0) break; // 막다른 칸(도달 불가) — 경로 없음.
    cx += dx;
    cy += dy;
  }
  if (!reached) return [];

  const pieces: RoadPiece[] = [];
  for (let i = 0; i < cells.length; i++) {
    const cur = cells[i];
    const prev = cells[i - 1];
    const next = cells[i + 1];
    // 진출: cur→next. 진입: prev→cur. 끝점은 단일 방향을 양쪽으로 써 직선을 만든다.
    let outDx = next ? next.cx - cur.cx : 0;
    let outDy = next ? next.cy - cur.cy : 0;
    let inDx = prev ? cur.cx - prev.cx : 0;
    let inDy = prev ? cur.cy - prev.cy : 0;
    if (!prev) {
      inDx = outDx;
      inDy = outDy;
    } // 스폰: 진출 방향 직선.
    if (!next) {
      outDx = inDx;
      outDy = inDy;
    } // 기지: 진입 방향 직선.
    pieces.push({ cx: cur.cx, cy: cur.cy, kind: pieceKind(inDx, inDy, outDx, outDy) });
  }
  return pieces;
}

/**
 * D2.2 미리보기 — 고스트 칸(cx,cy)을 임시 벽으로 세운 상태의 예상 경로 조각을 계산해 돌려준다.
 * isPathClear의 임시 벽 패턴과 동일하게 계산 후 칸 상태를 반드시 원복한다. 봉쇄면 빈 배열.
 */
export function computePreviewCells(grid: Grid, cx: number, cy: number): RoadPiece[] {
  const prev = grid.getState(cx, cy) ?? 'empty';
  grid.setState(cx, cy, 'tower');
  const cells = computeRoadCells(computeFlowField(grid));
  grid.setState(cx, cy, prev); // 원복
  return cells;
}

// ── 렌더 ─────────────────────────────────────────────────────────
const ROAD_KEY: Record<RoadKind, string> = {
  h: 'tile/road/h',
  v: 'tile/road/v',
  ul: 'tile/road/ul',
  ur: 'tile/road/ur',
  ll: 'tile/road/ll',
  lr: 'tile/road/lr',
};

// 에셋 로드 전 폴백 — 어두운 흙색 반투명 사각.
const DIRT = 'rgba(58, 44, 30, 0.55)';
// 고스트 경로 미리보기(D2.2 재사용) — 회색 반투명 사각.
const PREVIEW = 'rgba(190, 190, 190, 0.30)';

/** 도로 조각을 바닥 위에 그린다. 끝점(스폰·기지)은 포털/리액터가 이미 차지하므로 건너뛴다. */
export function renderRoad(ctx: CanvasRenderingContext2D, pieces: RoadPiece[], preview = false): void {
  const ready = assetsReady();
  for (const p of pieces) {
    if (!preview && (isEndpoint(p, SPAWN) || isEndpoint(p, BASE))) continue; // 포털/리액터 가림 방지.
    const { x, y } = cellToPixel(p.cx, p.cy);
    if (preview) {
      ctx.fillStyle = PREVIEW;
      ctx.fillRect(x, y, TILE, TILE);
    } else if (ready) {
      ctx.drawImage(getSprite(ROAD_KEY[p.kind]), x, y, TILE, TILE);
    } else {
      ctx.fillStyle = DIRT;
      ctx.fillRect(x, y, TILE, TILE);
    }
  }
}

function isEndpoint(p: RoadPiece, end: { cx: number; cy: number }): boolean {
  return p.cx === end.cx && p.cy === end.cy;
}

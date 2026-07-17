// A* 길찾기(M11) — 그리드 4방향, 맨해튼 휴리스틱, 이진 최소 힙 오픈리스트.
//
// 적은 플로우필드(pathfinding.ts)로 기지를 향해 이동하지만, 아군 병사는 임의 목적지로
// 이동 명령을 받으므로 "이 칸 → 저 칸" 개별 경로가 필요하다. 여기서 그 경로를 만든다.
// 벽(타워) 칸은 통과 불가. 시작 칸은 벽 위여도 허용(배럭 칸에서 막 나온 병사도 탈출 가능).
// 반환 경로는 시작 칸을 제외한 웨이포인트 목록(도착 칸 포함). 시작=도착이면 빈 배열.

import type { Cell } from './pathfinding';

// A*가 필요로 하는 그리드의 최소 인터페이스 — 벽/범위 판정과 크기만 있으면 된다.
// 디펜스 Grid와 정복 ConquestGrid(private 필드가 달라 클래스 구조 호환이 안 됨)를 함께
// 받기 위한 구조적 계약. 둘 다 이 네 멤버를 공개로 갖는다.
export interface PathGrid {
  readonly cols: number;
  readonly rows: number;
  inBounds(cx: number, cy: number): boolean;
  isWalkable(cx: number, cy: number): boolean;
}

// 상, 하, 좌, 우(대각선 없음 — 미로 통로가 직교라 4방향으로 충분).
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

// f-score 기준 이진 최소 힙. 노드 인덱스(1D)와 그 f값을 병렬 배열로 담는다.
// decrease-key 대신 더 낮은 f로 재삽입 + closed 검사로 지연 삭제(그리드가 작아 충분).
class MinHeap {
  private node: number[] = [];
  private fScore: number[] = [];

  get size(): number {
    return this.node.length;
  }

  push(node: number, f: number): void {
    this.node.push(node);
    this.fScore.push(f);
    let i = this.node.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.fScore[parent] <= this.fScore[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number {
    const top = this.node[0];
    const lastNode = this.node.pop() as number;
    const lastF = this.fScore.pop() as number;
    if (this.node.length > 0) {
      this.node[0] = lastNode;
      this.fScore[0] = lastF;
      this.siftDown(0);
    }
    return top;
  }

  private siftDown(i: number): void {
    const n = this.node.length;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let smallest = i;
      if (l < n && this.fScore[l] < this.fScore[smallest]) smallest = l;
      if (r < n && this.fScore[r] < this.fScore[smallest]) smallest = r;
      if (smallest === i) break;
      this.swap(i, smallest);
      i = smallest;
    }
  }

  private swap(a: number, b: number): void {
    [this.node[a], this.node[b]] = [this.node[b], this.node[a]];
    [this.fScore[a], this.fScore[b]] = [this.fScore[b], this.fScore[a]];
  }
}

/**
 * from → to 최단 경로(칸 목록). 벽 통과 불가. 경로 없으면 null.
 *   - to가 범위 밖이거나 벽이면 null(도착 불가 명령은 호출부가 무시).
 *   - from=to면 빈 배열([]) — 이미 도착.
 *   - 반환은 시작 칸을 뺀 웨이포인트 순서(도착 칸이 마지막).
 */
export function findPath(grid: PathGrid, from: Cell, to: Cell): Cell[] | null {
  if (!grid.inBounds(to.cx, to.cy) || !grid.isWalkable(to.cx, to.cy)) return null;
  if (!grid.inBounds(from.cx, from.cy)) return null;
  if (from.cx === to.cx && from.cy === to.cy) return [];

  const cols = grid.cols;
  const rows = grid.rows;
  const n = cols * rows;
  const idx = (cx: number, cy: number): number => cy * cols + cx;
  const heuristic = (cx: number, cy: number): number => Math.abs(cx - to.cx) + Math.abs(cy - to.cy);

  const g = new Float64Array(n).fill(Infinity);
  const cameFrom = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);

  const startI = idx(from.cx, from.cy);
  const goalI = idx(to.cx, to.cy);
  g[startI] = 0;

  const open = new MinHeap();
  open.push(startI, heuristic(from.cx, from.cy));

  while (open.size > 0) {
    const cur = open.pop();
    if (cur === goalI) return reconstruct(cameFrom, startI, goalI, cols);
    if (closed[cur]) continue; // 지연 삭제된 구버전 엔트리.
    closed[cur] = 1;

    const ccx = cur % cols;
    const ccy = (cur - ccx) / cols;
    for (const [dx, dy] of DIRS) {
      const nx = ccx + dx;
      const ny = ccy + dy;
      if (!grid.isWalkable(nx, ny)) continue; // 범위·벽 검사 포함.
      const ni = idx(nx, ny);
      if (closed[ni]) continue;
      const tentative = g[cur] + 1; // 균일 비용 4방향.
      if (tentative < g[ni]) {
        g[ni] = tentative;
        cameFrom[ni] = cur;
        open.push(ni, tentative + heuristic(nx, ny));
      }
    }
  }
  return null;
}

// 도착 칸에서 cameFrom을 거슬러 시작 칸 직전까지 모아 뒤집는다(시작 칸 제외).
function reconstruct(cameFrom: Int32Array, startI: number, goalI: number, cols: number): Cell[] {
  const path: Cell[] = [];
  let cur = goalI;
  while (cur !== startI && cur !== -1) {
    const cx = cur % cols;
    const cy = (cur - cx) / cols;
    path.push({ cx, cy });
    cur = cameFrom[cur];
  }
  path.reverse();
  return path;
}

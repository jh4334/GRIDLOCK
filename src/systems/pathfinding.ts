// 플로우필드(기지에서 BFS 역방향) + BFS 도달성 검사.
//
// 4방향(상하좌우)만 사용. 대각선 없음.
// 기지(BASE) 칸에서 시작해 walkable 칸으로 BFS를 퍼뜨리면, 각 칸이 "몇 스텝이면
// 기지에 닿는지(dist)"와 "기지 쪽 다음 칸으로 향하는 방향(dir)"을 알게 된다.
// 적은 매 칸에서 이 방향만 따라가면 최단 경로로 기지에 도달한다.

import { Grid, BASE, type Cell } from '../game/grid';

export type { Cell };

// 상, 하, 좌, 우.
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

export class FlowField {
  readonly cols: number;
  readonly rows: number;

  // BFS 스텝 거리. -1 = 도달 불가(또는 벽).
  private readonly dist: Int32Array;
  // 기지 쪽 다음 칸으로의 단위 방향 벡터. 기지 칸·도달 불가 칸은 (0, 0).
  private readonly dirX: Int8Array;
  private readonly dirY: Int8Array;

  constructor(grid: Grid) {
    this.cols = grid.cols;
    this.rows = grid.rows;
    const n = this.cols * this.rows;
    this.dist = new Int32Array(n).fill(-1);
    this.dirX = new Int8Array(n);
    this.dirY = new Int8Array(n);
    this.build(grid);
  }

  private idx(cx: number, cy: number): number {
    return cy * this.cols + cx;
  }

  private inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cx < this.cols && cy >= 0 && cy < this.rows;
  }

  // 기지에서 walkable 칸을 향해 BFS 역전파. 큐는 인덱스를 담는 링버퍼 대신
  // head 포인터로 소비(shift 비용 회피).
  private build(grid: Grid): void {
    if (!grid.isWalkable(BASE.cx, BASE.cy)) return;

    const queue: number[] = [];
    const baseIdx = this.idx(BASE.cx, BASE.cy);
    this.dist[baseIdx] = 0; // 기지 방향은 (0,0) 그대로.
    queue.push(baseIdx);

    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      const ccx = cur % this.cols;
      const ccy = (cur - ccx) / this.cols;

      for (const [dx, dy] of DIRS) {
        const nx = ccx + dx;
        const ny = ccy + dy;
        if (!this.inBounds(nx, ny)) continue;
        if (!grid.isWalkable(nx, ny)) continue;
        const nIdx = this.idx(nx, ny);
        if (this.dist[nIdx] !== -1) continue; // 이미 방문(더 짧은 거리 확정).

        this.dist[nIdx] = this.dist[cur] + 1;
        // 이웃 N의 다음 칸은 현재 칸 C. 방향 = C - N.
        this.dirX[nIdx] = ccx - nx;
        this.dirY[nIdx] = ccy - ny;
        queue.push(nIdx);
      }
    }
  }

  /** 기지까지의 BFS 스텝 수. 도달 불가/범위 밖이면 -1. */
  getDistance(cx: number, cy: number): number {
    if (!this.inBounds(cx, cy)) return -1;
    return this.dist[this.idx(cx, cy)];
  }

  /** 기지 쪽 다음 칸으로의 방향 벡터. 기지·도달 불가 칸은 (0, 0). */
  getDir(cx: number, cy: number): { dx: number; dy: number } {
    if (!this.inBounds(cx, cy)) return { dx: 0, dy: 0 };
    const i = this.idx(cx, cy);
    return { dx: this.dirX[i], dy: this.dirY[i] };
  }

  /** 이 칸에서 기지에 닿을 수 있는가. */
  isReachable(cx: number, cy: number): boolean {
    return this.getDistance(cx, cy) >= 0;
  }
}

/** 기지에서 역방향 BFS를 돌려 플로우필드를 만든다. */
export function computeFlowField(grid: Grid): FlowField {
  return new FlowField(grid);
}

/**
 * from 칸에서 기지까지 walkable 경로가 존재하는지 BFS로 검사.
 * M3의 타워 설치 봉쇄 검사에서 재사용 예정(설치 후 스폰→기지 도달성 확인).
 */
export function isReachable(grid: Grid, from: Cell): boolean {
  if (!grid.isWalkable(from.cx, from.cy)) return false;
  if (!grid.isWalkable(BASE.cx, BASE.cy)) return false;

  const cols = grid.cols;
  const rows = grid.rows;
  const visited = new Uint8Array(cols * rows);
  const queue: number[] = [];
  const startIdx = from.cy * cols + from.cx;
  visited[startIdx] = 1;
  queue.push(startIdx);

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const ccx = cur % cols;
    const ccy = (cur - ccx) / cols;
    if (ccx === BASE.cx && ccy === BASE.cy) return true;

    for (const [dx, dy] of DIRS) {
      const nx = ccx + dx;
      const ny = ccy + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      if (!grid.isWalkable(nx, ny)) continue;
      const nIdx = ny * cols + nx;
      if (visited[nIdx]) continue;
      visited[nIdx] = 1;
      queue.push(nIdx);
    }
  }
  return false;
}

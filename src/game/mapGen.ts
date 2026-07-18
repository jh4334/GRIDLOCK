// 시드 절차 생성(D7.5) — 시드 하나로 결정적으로 디펜스 맵 지형·스폰을 만든다.
// 결정적 의사난수(mulberry32, 라이브러리·Math.random 금지)로 규칙 배치를 굴리고,
// 생성 후 "모든 스폰→기지 BFS 도달성"을 검증한다. 실패하면 seed+1로 재시도하고,
// 상한(maxRetries)을 넘으면 평원(빈 지형)으로 폴백한다.
//
// 같은 시드 = 항상 같은 맵(재현성). 생성 파라미터(개수·크기 범위 등)는 밸런스 수치이므로
// 전부 maps.json의 randomGen 섹션이 소유한다(코드에 매직넘버 금지).

import { COLS, ROWS, BASE, type Cell } from './grid';
import type { MapTerrain, TerrainCell } from './maps';
import mapsData from '../data/maps.json';

const GEN = mapsData.randomGen;
const PRIMARY_SPAWN: Cell = { cx: 0, cy: 7 }; // 좌측 중앙 기본 스폰(grid.DEFAULT_SPAWNS와 일치).
const DIRS: ReadonlyArray<readonly [number, number]> = [[0, -1], [0, 1], [-1, 0], [1, 0]];

// ── 결정적 PRNG(mulberry32) ─────────────────────────────────────────
// 32비트 시드 하나로 [0,1) 난수열을 재현 가능하게 생성한다. 같은 시드 → 같은 수열.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [min,max] 정수 난수(양끝 포함). */
function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

// ── 지형 배치 ───────────────────────────────────────────────────────
// 한 시드로 지형·스폰을 굽는다(도달성 검증 전의 후보). 배치 순서대로 배열에 push하므로
// 같은 시드는 항상 동일한 배열(순서 포함)을 만든다 → E2E deep-equal 재현성 보장.
function buildTerrain(seed: number): { terrain: MapTerrain; spawns: Cell[] } {
  const rng = mulberry32(seed);

  // 스폰: 기본 1개 + 낮은 확률로 2번째(멀티 스폰 재사용, 상/하 중 한쪽 무작위 행).
  const spawns: Cell[] = [{ cx: PRIMARY_SPAWN.cx, cy: PRIMARY_SPAWN.cy }];
  if (rng() < GEN.spawn.chance) {
    const cy = rng() < 0.5 ? randInt(rng, GEN.spawn.topMin, GEN.spawn.topMax) : randInt(rng, GEN.spawn.botMin, GEN.spawn.botMax);
    spawns.push({ cx: 0, cy });
  }

  const key = (x: number, y: number) => y * COLS + x;

  // 스폰·기지 주변 clearRadius칸(체비쇼프)은 항상 비운다 — 진입/기지 길목을 보장.
  const reserved = new Set<number>();
  const reserve = (cx: number, cy: number) => {
    for (let dy = -GEN.clearRadius; dy <= GEN.clearRadius; dy++)
      for (let dx = -GEN.clearRadius; dx <= GEN.clearRadius; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && x < COLS && y >= 0 && y < ROWS) reserved.add(key(x, y));
      }
  };
  reserve(BASE.cx, BASE.cy);
  for (const sp of spawns) reserve(sp.cx, sp.cy);

  const occupied = new Set<number>();
  const rock: TerrainCell[] = [], water: TerrainCell[] = [], rough: TerrainCell[] = [];
  const place = (cx: number, cy: number, arr: TerrainCell[]) => {
    if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) return;
    const k = key(cx, cy);
    if (reserved.has(k) || occupied.has(k)) return; // 예약칸·중복 배치 금지.
    occupied.add(k);
    arr.push([cx, cy]);
  };

  // 세로 능선 1~2개 — 무작위 열에 개방 구간(gap) 하나를 뚫은 전체 높이 rock 벽.
  const ridgeCount = randInt(rng, GEN.ridge.minCount, GEN.ridge.maxCount);
  for (let r = 0; r < ridgeCount; r++) {
    const col = randInt(rng, GEN.ridge.colMin, GEN.ridge.colMax);
    const gapLen = randInt(rng, GEN.ridge.gapMin, GEN.ridge.gapMax);
    const gapStart = randInt(rng, 0, ROWS - gapLen);
    for (let cy = 0; cy < ROWS; cy++) {
      if (cy >= gapStart && cy < gapStart + gapLen) continue; // 개방 구간은 비움.
      place(col, cy, rock);
    }
  }

  // 산발 rock 6~12개.
  const rockCount = randInt(rng, GEN.rock.min, GEN.rock.max);
  for (let i = 0; i < rockCount; i++) place(randInt(rng, 1, COLS - 2), randInt(rng, 0, ROWS - 1), rock);

  // water 웅덩이 0~2개(2~4칸) — 랜덤워크 블롭.
  const poolCount = randInt(rng, 0, GEN.water.poolMax);
  for (let p = 0; p < poolCount; p++) blob(rng, randInt(rng, GEN.water.sizeMin, GEN.water.sizeMax), water, place);

  // rough 지대 2~3곳(2~6칸) — 랜덤워크 블롭(통행 가능·감속 지형).
  const areaCount = randInt(rng, GEN.rough.areaMin, GEN.rough.areaMax);
  for (let a = 0; a < areaCount; a++) blob(rng, randInt(rng, GEN.rough.sizeMin, GEN.rough.sizeMax), rough, place);

  return { terrain: { rock, water, rough }, spawns };
}

// 랜덤워크 블롭 — 시작칸에서 상하좌우로 걸으며 size칸을 arr에 배치(웅덩이·지대 공용).
function blob(
  rng: () => number,
  size: number,
  arr: TerrainCell[],
  place: (cx: number, cy: number, arr: TerrainCell[]) => void,
): void {
  let cx = randInt(rng, 1, COLS - 2), cy = randInt(rng, 1, ROWS - 2);
  for (let i = 0; i < size; i++) {
    place(cx, cy, arr);
    const [dx, dy] = DIRS[randInt(rng, 0, 3)];
    cx = Math.max(0, Math.min(COLS - 1, cx + dx));
    cy = Math.max(0, Math.min(ROWS - 1, cy + dy));
  }
}

// ── 도달성 검증 ─────────────────────────────────────────────────────
// 기지에서 walkable(비-rock·비-water) 칸으로 BFS를 퍼뜨려 모든 스폰이 닿는지 확인.
// rough·빈 칸은 통행 가능. Grid를 만들지 않고 순수 배열로 계산해 어디서든 호출 가능하게 둔다.
function allReachable(terrain: MapTerrain, spawns: Cell[]): boolean {
  const wall = new Uint8Array(COLS * ROWS);
  for (const [x, y] of terrain.rock) wall[y * COLS + x] = 1;
  for (const [x, y] of terrain.water) wall[y * COLS + x] = 1;

  const dist = new Int32Array(COLS * ROWS).fill(-1);
  const baseIdx = BASE.cy * COLS + BASE.cx;
  if (wall[baseIdx]) return false;

  const queue: number[] = [baseIdx];
  dist[baseIdx] = 0;
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const cx = cur % COLS, cy = (cur - cx) / COLS;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      const ni = ny * COLS + nx;
      if (wall[ni] || dist[ni] !== -1) continue;
      dist[ni] = dist[cur] + 1;
      queue.push(ni);
    }
  }
  return spawns.every((s) => dist[s.cy * COLS + s.cx] >= 0);
}

/**
 * 시드 절차 생성 — 결정적. 도달성 실패 시 seed+1로 재시도(상한 maxRetries), 초과 시 평원 폴백.
 * 같은 시드는 항상 같은 지형·스폰을 반환한다(재현성).
 */
export function generateMap(seed: number): { terrain: MapTerrain; spawns: Cell[] } {
  for (let attempt = 0; attempt <= GEN.maxRetries; attempt++) {
    const candidate = buildTerrain((seed + attempt) >>> 0);
    if (allReachable(candidate.terrain, candidate.spawns)) return candidate;
  }
  // 폴백: 평원(장애물 없음)은 항상 도달 가능.
  return { terrain: { rock: [], water: [], rough: [] }, spawns: [{ cx: PRIMARY_SPAWN.cx, cy: PRIMARY_SPAWN.cy }] };
}

/** 오늘의 맵 시드 — 로컬 날짜 YYYYMMDD 숫자(하루 동안 동일). */
export function todaySeed(now: Date = new Date()): number {
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

/** 랜덤 맵 진입용 새 시드 — 현재 시각 기반(32비트). */
export function randomSeed(): number {
  return (Date.now() >>> 0) ^ 0x9e3779b9;
}

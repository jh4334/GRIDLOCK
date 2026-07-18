// 타워 설치 가능성 검사 — 두 단계로 나눈다.
//   1) isCellPlaceable: 칸 자체의 기본 조건(범위/타워/스폰·기지/적 점유). 매 프레임 고스트 색에 사용.
//   2) isPathClear: 봉쇄 검사(BFS 도달성). 설치 직전에만 호출 — 무겁진 않지만 의미가 다르다.
//
// 봉쇄 검사는 대상 칸을 임시로 벽('tower')으로 세운 뒤 (스폰→기지)와 (살아있는 모든
// 적의 현재 칸→기지) 도달성을 확인하고 원상복구한다. 하나라도 막히면 설치 거부.

import type { Grid } from '../game/grid';
import { SPAWN } from '../game/grid';
import { isReachable } from './pathfinding';
import type { Enemy } from '../entities/enemy';

/** 칸 자체의 기본 설치 조건. 봉쇄 검사는 포함하지 않는다. */
export function isCellPlaceable(grid: Grid, enemies: Enemy[], cx: number, cy: number): boolean {
  if (!grid.inBounds(cx, cy)) return false;
  const state = grid.getState(cx, cy);
  if (state === 'tower' || state === 'rock' || state === 'water') return false; // 타워/바위/물 칸(rough는 건설 가능, D7.1)
  if (grid.isSpawn(cx, cy) || grid.isBase(cx, cy)) return false; // 스폰·기지 칸
  for (const e of enemies) {
    const c = e.cell; // 적이 현재 점유 중인 칸
    if (c.cx === cx && c.cy === cy) return false;
  }
  return true;
}

/**
 * 대상 칸을 벽으로 세워도 (스폰→기지)와 (모든 적→기지) 경로가 남는지 검사.
 * 검사 후 칸 상태를 반드시 원복한다. 봉쇄면 false → 설치 거부.
 */
export function isPathClear(grid: Grid, enemies: Enemy[], cx: number, cy: number): boolean {
  const prev = grid.getState(cx, cy) ?? 'empty';
  grid.setState(cx, cy, 'tower');

  let ok = isReachable(grid, SPAWN);
  if (ok) {
    for (const e of enemies) {
      if (!isReachable(grid, e.cell)) {
        ok = false;
        break;
      }
    }
  }

  grid.setState(cx, cy, prev); // 원복
  return ok;
}

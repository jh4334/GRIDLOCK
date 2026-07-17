// 정복 모드 플레이어 명령 변환(우클릭) — 클릭 지점을 선택 유닛·일꾼의 이동/공격/채집 명령으로 옮긴다.
// ConquestWorld에서 분리한 순수 헬퍼(모델 상태는 world의 공개 필드만 읽는다). 상태 변경은
// 명령 대상(유닛·일꾼)에만 일어나며 world 자체 구조는 바꾸지 않는다. update/render 분리 유지.

import conquestData from '../data/conquest.json';
import { cellCenter, pixelToCell } from '../game/grid';
import { findPath } from '../systems/astar';
import { pathToStructure } from './conquestCombat';
import type { ConquestWorld } from './conquestWorld';
import type { CombatUnit, Combatant } from './combatUnit';
import type { Worker } from './worker';

const C = conquestData;

/** 선택 유닛에게 이동/공격 명령 — 클릭 지점이 적 구조물/유닛 근처면 접근 후 공격.
 *  attackMove=true(A키)면 경로 이동 중에도 전체 사거리로 적 유닛·건물을 감지·교전한다. */
export function commandUnits(
  world: ConquestWorld,
  units: CombatUnit[],
  px: number,
  py: number,
  attackMove: boolean,
): void {
  const { cx, cy } = pixelToCell(px, py);
  const target = hostileTargetAt(world, px, py, 'player');
  for (const u of units) {
    u.attackMove = attackMove;
    if (target && target.structure) {
      const tcell = structureCell(target);
      const path = pathToStructure(world.grid, u.cell, tcell.cx, tcell.cy);
      if (path) {
        u.path = path;
        u.orderedTarget = target;
      }
    } else if (target) {
      const p = findPath(world.grid, u.cell, pixelToCell(target.x, target.y));
      if (p) u.path = p.map((c) => cellCenter(c.cx, c.cy));
      u.orderedTarget = target;
    } else if (world.grid.isWalkable(cx, cy)) {
      const p = findPath(world.grid, u.cell, { cx, cy });
      if (p) {
        u.path = p.map((c) => cellCenter(c.cx, c.cy));
        u.orderedTarget = null;
        u.setGuard(cellCenter(cx, cy).x, cellCenter(cx, cy).y);
      }
    }
  }
}

/** 선택 일꾼 명령 — 클릭 칸이 크리스탈이면 채집, 통행 칸이면 이동. */
export function commandWorkers(world: ConquestWorld, workers: Worker[], px: number, py: number): void {
  const { cx, cy } = pixelToCell(px, py);
  const crystal = world.crystals.find((c) => c.cx === cx && c.cy === cy && !c.depleted);
  for (const w of workers) {
    if (crystal) w.commandHarvest(crystal, world.grid);
    else if (world.grid.isWalkable(cx, cy)) w.commandMove(cx, cy, world.grid);
  }
}

// 클릭 지점 근처의 적(반대 진영) 구조물/유닛. 없으면 null.
function hostileTargetAt(world: ConquestWorld, px: number, py: number, side: 'player' | 'enemy'): Combatant | null {
  const { cx, cy } = pixelToCell(px, py);
  const foeHQ = side === 'player' ? world.enemyHQ : world.playerHQ;
  if (foeHQ.occupies(cx, cy) && !foeHQ.dead) return foeHQ;
  for (const b of world.buildings) {
    if (b.side !== side && b.complete && !b.destroyed && b.cx === cx && b.cy === cy) return b;
  }
  let best: CombatUnit | null = null;
  let bestD = C.unit.radius * C.unit.radius * 4;
  for (const u of world.units) {
    if (u.dead || u.side === side) continue;
    const d = (u.x - px) ** 2 + (u.y - py) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = u;
    }
  }
  return best;
}

function structureCell(c: Combatant): { cx: number; cy: number } {
  return pixelToCell(c.x, c.y);
}

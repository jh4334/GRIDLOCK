// 배럭 로스터 — 배럭이 전투 유닛 unitCount기를 유지하는 공유 로직(플레이어·적 공통).
// 유닛은 월드의 공유 units 배열에 담기고, 각 유닛은 소속 배럭(home)을 역참조해 리스폰
// 회계·집결지를 조회한다. 수치(유닛 스탯·리스폰 시간)는 conquest.json에서 읽는다.
//
// spawnUnitsFor: 배럭 완성 시 unitCount기 즉시 배치. maintainBarracks: 사망으로 결원이
// 생기면 리스폰 큐에 넣고, 타이머 만료 시 재배치. 상태 변경은 이 함수들에서만(update 규칙).

import conquestData from '../data/conquest.json';
import { cellCenter } from '../game/grid';
import { walkableNeighbors } from './conquestMap';
import type { ConquestGrid } from './conquestMap';
import { CombatUnit } from './combatUnit';
import type { Side } from './hq';
import type { Building } from './building';

const C = conquestData;

function unitStats(side: Side): { hp: number; damage: number; attackRate: number; speed: number; radius: number; color: string } {
  const u = C.unit;
  return {
    hp: u.hp,
    damage: u.damage,
    attackRate: u.attackRate,
    speed: u.speed,
    radius: u.radius,
    color: side === 'player' ? u.playerColor : u.enemyColor,
  };
}

// 배럭 인접 통행 칸을 집결지로 삼는다(없으면 배럭 칸 중심). 유닛은 여기서 대기·방어한다.
function computeRally(b: Building, grid: ConquestGrid): { x: number; y: number } {
  const nb = walkableNeighbors(grid, b.cx, b.cy)[0];
  return nb ? cellCenter(nb.cx, nb.cy) : cellCenter(b.cx, b.cy);
}

// 유닛 1기를 배럭 집결지 주변에 배치한다(원주 균등 분산).
function spawnOne(b: Building, slot: number, units: CombatUnit[]): void {
  const n = C.buildings.barracks.unitCount;
  const ang = -Math.PI / 2 + (slot * (Math.PI * 2)) / n;
  const gx = b.rallyX + Math.cos(ang) * C.buildings.barracks.rallyRadius;
  const gy = b.rallyY + Math.sin(ang) * C.buildings.barracks.rallyRadius;
  const c = cellCenter(b.cx, b.cy); // 배럭 칸에서 나와 집결지로.
  const u = new CombatUnit(b.side, c.x, c.y, unitStats(b.side), b);
  u.setGuard(gx, gy);
  units.push(u);
}

/** 배럭 완성 시 unitCount기를 즉시 배치하고 집결지를 확정한다. */
export function spawnUnitsFor(b: Building, units: CombatUnit[], grid: ConquestGrid): void {
  const rally = computeRally(b, grid);
  b.setRally(rally.x, rally.y);
  for (let i = 0; i < C.buildings.barracks.unitCount; i++) spawnOne(b, i, units);
}

/** 로스터 유지 — 결원만큼 리스폰 큐에 넣고, 타이머 만료 시 재배치. 파괴된 배럭은 건너뛴다. */
export function maintainBarracks(dt: number, b: Building, units: CombatUnit[]): void {
  if (b.destroyed || !b.complete) return;
  const alive = units.reduce((n, u) => n + (u.home === b && !u.dead ? 1 : 0), 0);
  const deficit = C.buildings.barracks.unitCount - alive - b.respawnQueue.length;
  for (let i = 0; i < deficit; i++) b.respawnQueue.push(C.buildings.barracks.respawnTime);

  for (let i = b.respawnQueue.length - 1; i >= 0; i--) {
    b.respawnQueue[i] -= dt;
    if (b.respawnQueue[i] <= 0) {
      b.respawnQueue.splice(i, 1);
      const slot = units.reduce((n, u) => n + (u.home === b && !u.dead ? 1 : 0), 0); // 현 생존 수를 슬롯으로.
      spawnOne(b, slot % C.buildings.barracks.unitCount, units);
    }
  }
}

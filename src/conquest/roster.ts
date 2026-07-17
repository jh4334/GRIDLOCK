// 로스터 — 생산 건물이 전투 유닛 unitCount기를 유지하는 공유 로직(플레이어·적 공통).
// 두 종류를 대칭으로 다룬다: 배럭 → 근접 병사(unit), 차량 공장(factory) → 원거리 포격 전차(artillery).
// 유닛은 월드의 공유 units 배열에 담기고, 각 유닛은 소속 건물(home)을 역참조해 리스폰
// 회계·집결지를 조회한다. 수치(유닛 스탯·리스폰 시간·유닛 수)는 conquest.json에서 읽는다.
//
// spawnUnitsFor: 건물 완성 시 unitCount기 즉시 배치. maintainRoster: 사망으로 결원이
// 생기면 리스폰 큐에 넣고, 타이머 만료 시 재배치. 상태 변경은 이 함수들에서만(update 규칙).

import conquestData from '../data/conquest.json';
import { cellCenter } from '../game/grid';
import { walkableNeighbors } from './conquestMap';
import type { ConquestGrid } from './conquestMap';
import { CombatUnit, UnitStats } from './combatUnit';
import type { Side } from './hq';
import type { Building } from './building';

const C = conquestData;

// 로스터를 가진 건물 종류(생산 유닛이 있는 것) — 배럭·공장.
type RosterKind = 'barracks' | 'factory';

// 건물 종류별 유닛 스탯 — 배럭=근접 병사, 공장=원거리 포격 전차. 진영색만 다르다.
function unitStats(kind: RosterKind, side: Side): UnitStats {
  if (kind === 'factory') {
    const a = C.artillery;
    return {
      hp: a.hp,
      damage: a.damage,
      attackRate: a.attackRate,
      speed: a.speed,
      radius: a.radius,
      color: side === 'player' ? a.playerColor : a.enemyColor,
      range: a.range,
      isRanged: true,
    };
  }
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

// 건물 종류별 로스터 규격(유닛 수·리스폰 시간·집결 반경).
function rosterConf(kind: RosterKind): { unitCount: number; respawnTime: number; rallyRadius: number } {
  return C.buildings[kind];
}

// 건물 인접 통행 칸을 집결지로 삼는다(없으면 건물 칸 중심). 유닛은 여기서 대기·방어한다.
function computeRally(b: Building, grid: ConquestGrid): { x: number; y: number } {
  const nb = walkableNeighbors(grid, b.cx, b.cy)[0];
  return nb ? cellCenter(nb.cx, nb.cy) : cellCenter(b.cx, b.cy);
}

// 유닛 1기를 건물 집결지 주변에 배치한다(원주 균등 분산).
function spawnOne(b: Building, slot: number, units: CombatUnit[]): void {
  const conf = rosterConf(b.kind as RosterKind);
  const ang = -Math.PI / 2 + (slot * (Math.PI * 2)) / conf.unitCount;
  const gx = b.rallyX + Math.cos(ang) * conf.rallyRadius;
  const gy = b.rallyY + Math.sin(ang) * conf.rallyRadius;
  const c = cellCenter(b.cx, b.cy); // 건물 칸에서 나와 집결지로.
  const u = new CombatUnit(b.side, c.x, c.y, unitStats(b.kind as RosterKind, b.side), b);
  u.setGuard(gx, gy);
  units.push(u);
}

/** 생산 건물 완성 시 unitCount기를 즉시 배치하고 집결지를 확정한다(배럭·공장 공통). */
export function spawnUnitsFor(b: Building, units: CombatUnit[], grid: ConquestGrid): void {
  const rally = computeRally(b, grid);
  b.setRally(rally.x, rally.y);
  const conf = rosterConf(b.kind as RosterKind);
  for (let i = 0; i < conf.unitCount; i++) spawnOne(b, i, units);
}

/** 로스터 유지 — 결원만큼 리스폰 큐에 넣고, 타이머 만료 시 재배치. 파괴된 건물은 건너뛴다. */
export function maintainRoster(dt: number, b: Building, units: CombatUnit[]): void {
  if (b.destroyed || !b.complete) return;
  const conf = rosterConf(b.kind as RosterKind);
  const alive = units.reduce((n, u) => n + (u.home === b && !u.dead ? 1 : 0), 0);
  const deficit = conf.unitCount - alive - b.respawnQueue.length;
  for (let i = 0; i < deficit; i++) b.respawnQueue.push(conf.respawnTime);

  for (let i = b.respawnQueue.length - 1; i >= 0; i--) {
    b.respawnQueue[i] -= dt;
    if (b.respawnQueue[i] <= 0) {
      b.respawnQueue.splice(i, 1);
      const slot = units.reduce((n, u) => n + (u.home === b && !u.dead ? 1 : 0), 0); // 현 생존 수를 슬롯으로.
      spawnOne(b, slot % conf.unitCount, units);
    }
  }
}

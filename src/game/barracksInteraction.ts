// 배럭/집결지/병사 상호작용·렌더 — Interaction에서 분리한 순수 헬퍼(M10 리팩토링).
//
// 상태(towers/selectedTower)는 여전히 Interaction이 소유하고, 여기서는 인자로 받은 값만
// 읽거나(렌더·패널) 배럭 인스턴스에 위임(집결지 이동)한다. 동작 변화 없음 — 코드 위치만 이동.
// update/render 분리 규칙 유지: setRallyFromClick만 상태를 바꾸고, 나머지는 읽기 전용.

import type { Grid } from './grid';
import { cellCenter, pixelToCell } from './grid';
import { Barracks } from '../entities/unit';
import { Tower } from '../entities/tower';
import type { TowerKind } from '../entities/tower';
import type { SoldierPanelInfo, TowerPanelInfo } from '../ui/buildMenu';
import type { Economy } from './economy';
import economyData from '../data/economy.json';

/** 종류에 맞는 타워 인스턴스 생성 — 배럭이면 병사를 운용하는 Barracks, 그 외엔 기본 Tower. */
export function createTower(kind: TowerKind, cx: number, cy: number, grid: Grid): Tower {
  return kind === 'barracks' ? new Barracks(cx, cy, grid) : new Tower(kind, cx, cy);
}

/** towers 중 배럭만 추린다(melee 시스템·병사 렌더용). 타워 수가 적어 매 프레임 필터해도 저렴. */
export function barracksList(towers: Tower[]): Barracks[] {
  return towers.filter((t): t is Barracks => t instanceof Barracks);
}

/**
 * 배럭 선택 시 정보 패널에 넣을 병사 정보(공격력/사거리/공속 대신 병사 수·리스폰·스탯).
 * 배럭이 아니면 undefined → 일반 타워 패널로 렌더된다.
 */
export function soldierPanelInfo(selected: Tower | null): SoldierPanelInfo | undefined {
  if (!(selected instanceof Barracks)) return undefined;
  return {
    alive: selected.aliveCount,
    count: selected.bspec.soldierCount,
    respawning: selected.respawningCount,
    hp: Math.round(selected.soldierMaxHp),
    damage: Math.round(selected.soldierDamage * 10) / 10,
  };
}

/**
 * 배럭 패널 실시간 갱신 판단용 시그니처(병사 수/리스폰이 바뀔 때만 재렌더 → DOM 깜빡임 방지).
 * 배럭이 아니면 null.
 */
export function barracksPanelSig(selected: Tower | null, gold: number): string | null {
  if (!(selected instanceof Barracks)) return null;
  return `${selected.level}|${selected.aliveCount}|${selected.respawningCount}|${gold}`;
}

/** 판매 환급 골드 — 누적 투자액 × 환급률. showPanel·sellSelected가 공유한다. */
export function sellRefund(t: Tower): number {
  return Math.round(t.invested * economyData.sellRefundRate);
}

/**
 * 선택 타워 → 정보 패널 DTO. 배럭이면 soldierPanelInfo가 병사 스탯 섹션을 채운다.
 * (interaction.ts가 300줄을 넘어 패널 값 구성 로직을 여기로 분리 — M11.)
 */
export function towerPanelInfo(t: Tower, gold: number): TowerPanelInfo {
  const cost = t.upgradeCost;
  const chosen = t.specialSpec; // 이미 선택된 분기(없으면 null).
  const canChoose = t.canChooseSpecial; // 최대 레벨 + 미선택 + 분기 보유.
  return {
    name: t.spec.name,
    level: t.level,
    maxLevel: t.maxLevel,
    damage: Math.round(t.effectiveDamage * 10) / 10, // 소수 1자리.
    range: Math.round(t.effectiveRange),
    fireRate: Math.round(t.effectiveFireRate * 100) / 100, // rapid 반영 실효 공속.
    soldier: soldierPanelInfo(t), // 배럭이면 병사 스탯, 아니면 undefined(일반 타워 패널).
    upgradeCost: cost,
    canAffordUpgrade: cost !== null && gold >= cost,
    refund: sellRefund(t),
    specials: canChoose ? t.specials.map((s) => ({ id: s.id, name: s.name, desc: s.desc })) : undefined,
    specialCost: canChoose ? t.specialCost : undefined,
    canAffordSpecial: canChoose && gold >= t.specialCost,
    chosenSpecial: chosen ? { id: chosen.id, name: chosen.name, desc: chosen.desc } : null,
  };
}

/**
 * 4레벨 스페셜 분기 선택(D4.2) — 골드 충분 + 선택 가능(최대 레벨·미선택)일 때만. 골드 차감 후
 * 타워에 분기를 확정한다(invested += specialCost, 이후 다른 분기 불가). 패널 갱신은 호출부가 한다.
 */
export function chooseTowerSpecial(economy: Economy, selected: Tower | null, id: string): void {
  if (!selected || !selected.canChooseSpecial) return;
  const cost = selected.specialCost;
  if (economy.gold < cost) return;
  economy.spend(cost);
  selected.chooseSpecial(id);
}

/**
 * 우클릭 집결지 지정 — 선택된 배럭의 집결지를 클릭 칸으로 이동(M10). 통행 불가(벽/타워)·범위 밖
 * 이면 거부. 경로는 단순 직선 이동 허용(A*는 M11). 배럭 미선택이면 아무것도 하지 않는다.
 */
export function setRallyFromClick(grid: Grid, selected: Tower | null, px: number, py: number): void {
  if (!(selected instanceof Barracks)) return;
  const { cx, cy } = pixelToCell(px, py);
  if (!grid.inBounds(cx, cy)) return;
  if (!grid.isWalkable(cx, cy)) return; // 벽/타워 칸이면 거부.
  const c = cellCenter(cx, cy);
  selected.setRally(c.x, c.y);
}

/** 병사 + (배럭 선택 시)집결지 마커 렌더 — 적 위 레이어에 그린다(Game.render가 조율). 읽기 전용. */
export function renderUnits(ctx: CanvasRenderingContext2D, towers: Tower[], selected: Tower | null): void {
  for (const b of barracksList(towers)) for (const s of b.soldiers) s.render(ctx);
  if (selected instanceof Barracks) selected.renderRally(ctx);
}

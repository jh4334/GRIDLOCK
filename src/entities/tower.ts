// 타워 엔티티 — 한 칸을 차지하는 벽 겸 공격 유닛. 3단계 업그레이드(M7)를 지원한다.
//
// 수치는 전부 data/towers.json에서 로딩(코드에 매직넘버 금지). 업그레이드 규칙(비용 배수·
// 성능 배수)은 towers.json의 공통 upgrade 섹션에서 읽는다. 전투/히트박스 렌더는 레벨을
// 반영한 "실효 스탯"(effectiveDamage/Range/SlowDuration)을 사용한다.

import towersData from '../data/towers.json';
import { TILE, cellToPixel } from '../game/grid';

export type TowerKind = keyof typeof towersData.towers;

// 배럭 전용 병사 스탯(M10). 투사체를 쏘지 않는 대신 병사를 유지한다.
export interface BarracksSpec {
  soldierCount: number; // 유지할 병사 수
  soldierHp: number;
  soldierDamage: number;
  soldierAttackRate: number; // 병사 근접 공속(회/s)
  soldierSpeed: number; // px/s
  soldierRadius: number; // px
  respawnTime: number; // 사망 후 리스폰까지 대기(초)
  rallyRadius: number; // 집결지 중심 기준 병사 대기 간격(px)
  engageRadius: number; // 집결지 주변 적 감지·교전 반경(px)
  soldierColor: string;
}

export interface TowerSpec {
  name: string;
  cost: number;
  range: number; // px
  fireRate: number; // 회/s
  damage: number;
  color: string;
  projectileSpeed: number; // px/s
  projectileRadius: number; // px (투사체 크기 + 명중 여유)
  projectileColor: string;
  splashRadius?: number; // 캐논 전용
  slowFactor?: number; // 프로스트 전용 — 이속 감소 비율
  slowDuration?: number; // 프로스트 전용 — 초
  barracks?: BarracksSpec; // 배럭 전용 — 존재하면 투사체 대신 병사 운용(M10)
}

interface UpgradeRules {
  maxLevel: number;
  costFactors: number[]; // 2레벨=원가×[0], 3레벨=원가×[1]
  damageMult: number; // 레벨당 공격력 배수
  rangeMult: number; // 레벨당 사거리 배수
  slowDurationMult: number; // 레벨당 슬로우 지속 배수(프로스트)
}

// 공통 업그레이드 규칙(모든 타워 공유).
export const UPGRADE = towersData.upgrade as UpgradeRules;

/** 종류별 스펙 조회. */
export function towerSpec(kind: TowerKind): TowerSpec {
  return towersData.towers[kind] as TowerSpec;
}

// 칸 안쪽 여백(시각 상수) — 격자선이 보이도록 칸을 꽉 채우지 않고 살짝 줄인다.
// 고스트 미리보기도 같은 여백을 써서 설치 후 모습과 일치시킨다.
export const TOWER_INSET = 4;
const COLOR_SELECT_RING = '#ffe066';
// 레벨 표시(시각 상수) — 타워 상단에 레벨 수만큼 작은 점을 찍는다.
const LEVEL_PIP_RADIUS = 2;
const LEVEL_PIP_GAP = 6;
const COLOR_LEVEL_PIP = '#ffe066';
const COLOR_RANGE_RING = 'rgba(255, 224, 102, 0.5)'; // 선택 시 실효 사거리 원.

export class Tower {
  readonly kind: TowerKind;
  readonly spec: TowerSpec;
  readonly cx: number;
  readonly cy: number;
  // 현재 강화 레벨(1~maxLevel). 실효 스탯과 업그레이드 비용의 기준.
  level = 1;
  // 누적 투자액 — 판매 환급(invested × sellRefundRate) 계산용. 업그레이드 시 비용만큼 증가.
  invested: number;
  // 발사 쿨다운(초). 0 이하면 발사 가능. combat 시스템이 감소·갱신한다.
  cooldown = 0;

  constructor(kind: TowerKind, cx: number, cy: number) {
    this.kind = kind;
    this.spec = towerSpec(kind);
    this.cx = cx;
    this.cy = cy;
    this.invested = this.spec.cost;
  }

  /** 배럭(투사체 미발사)인가 — combat이 발사 대상에서 제외하는 판정(M10). */
  get isBarracks(): boolean {
    return this.spec.barracks !== undefined;
  }

  // ── 레벨 반영 실효 스탯 ──────────────────────────────────────
  // 레벨 L의 배수 = mult^(L-1). combat·히트박스 렌더가 이 값을 사용한다.
  get effectiveDamage(): number {
    return this.spec.damage * Math.pow(UPGRADE.damageMult, this.level - 1);
  }
  get effectiveRange(): number {
    return this.spec.range * Math.pow(UPGRADE.rangeMult, this.level - 1);
  }
  get effectiveSlowDuration(): number {
    return (this.spec.slowDuration ?? 0) * Math.pow(UPGRADE.slowDurationMult, this.level - 1);
  }

  // ── 업그레이드 ───────────────────────────────────────────────
  get maxLevel(): number {
    return UPGRADE.maxLevel;
  }
  get canUpgrade(): boolean {
    return this.level < UPGRADE.maxLevel;
  }
  /** 다음 레벨로 올리는 비용(원가 × costFactors[level-1]). 최대 레벨이면 null. */
  get upgradeCost(): number | null {
    if (!this.canUpgrade) return null;
    return Math.round(this.spec.cost * UPGRADE.costFactors[this.level - 1]);
  }

  /**
   * 레벨을 1 올리고 그 비용을 누적 투자액에 더한다(판매 환급이 함께 증가).
   * 골드 차감·가능 여부 판단은 호출부(interaction)가 담당한다.
   */
  upgrade(): void {
    const cost = this.upgradeCost;
    if (cost === null) return;
    this.invested += cost;
    this.level += 1;
  }

  // 렌더는 상태를 읽기만 한다(변경 없음). selected면 선택 링을 덧그린다.
  render(ctx: CanvasRenderingContext2D, selected: boolean): void {
    const { x, y } = cellToPixel(this.cx, this.cy);
    const size = TILE - TOWER_INSET * 2;
    ctx.fillStyle = this.spec.color;
    ctx.fillRect(x + TOWER_INSET, y + TOWER_INSET, size, size);

    // 레벨 점 — 상단 가운데에 레벨 수만큼(1~3) 나란히.
    this.renderLevelPips(ctx, x, y);

    if (selected) {
      ctx.save();
      ctx.strokeStyle = COLOR_SELECT_RING;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2.5, y + 2.5, TILE - 5, TILE - 5);
      ctx.restore();
    }
  }

  private renderLevelPips(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.save();
    ctx.fillStyle = COLOR_LEVEL_PIP;
    const cx = x + TILE / 2;
    const py = y + TOWER_INSET + LEVEL_PIP_RADIUS + 1;
    const start = cx - ((this.level - 1) * LEVEL_PIP_GAP) / 2;
    for (let i = 0; i < this.level; i++) {
      ctx.beginPath();
      ctx.arc(start + i * LEVEL_PIP_GAP, py, LEVEL_PIP_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** 선택 시 캔버스에 표시하는 실효 사거리 원(읽기 전용). */
  renderRange(ctx: CanvasRenderingContext2D): void {
    const { x, y } = cellToPixel(this.cx, this.cy);
    ctx.save();
    ctx.strokeStyle = COLOR_RANGE_RING;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + TILE / 2, y + TILE / 2, this.effectiveRange, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

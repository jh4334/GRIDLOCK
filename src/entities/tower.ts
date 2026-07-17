// 타워 엔티티 — 한 칸을 차지하는 벽 겸 공격 유닛. 3단계 업그레이드(M7)를 지원한다.
//
// 수치는 전부 data/towers.json에서 로딩(코드에 매직넘버 금지). 업그레이드 규칙(비용 배수·
// 성능 배수)은 towers.json의 공통 upgrade 섹션에서 읽는다. 전투/히트박스 렌더는 레벨을
// 반영한 "실효 스탯"(effectiveDamage/Range/SlowDuration)을 사용한다.

import towersData from '../data/towers.json';
import { TILE, cellToPixel } from '../game/grid';
import { drawTower, drawSelectRing, drawRangeRing, drawSpecialStar, type TowerVisualKind } from '../render/towerSprites';

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

// 4레벨 스페셜 분기(D4.2) — 3레벨 도달 후 2택 중 하나를 선택한다. 효과 수치는 전부 여기(JSON).
// 종류별로 쓰이는 필드만 채워지고(선택), 실효 스탯·combat이 존재하는 필드만 반영한다.
export interface SpecialSpec {
  id: string;
  name: string;
  desc: string; // 패널 버튼 소문구·툴팁.
  fireRateMult?: number; // 애로우 rapid — 공속 배수.
  pierceCount?: number; // 애로우 pierce — 경로상 최대 타격 수.
  pierceFalloff?: number; // 애로우 pierce — 관통당 피해 배수(누적 지수).
  splashRadiusMult?: number; // 캐논 bigblast — 스플래시 반경 배수.
  damageMult?: number; // 캐논 bigblast — 피해 배수.
  napalmDps?: number; // 캐논 napalm — 잔류 화염 초당 피해.
  napalmDuration?: number; // 캐논 napalm — 화염 지대 지속(초).
  napalmRadius?: number; // 캐논 napalm — 화염 지대 반경(px).
  slowFactor?: number; // 프로스트 deepfreeze — 슬로우 비율 덮어쓰기.
  slowDurationMult?: number; // 프로스트 deepfreeze — 슬로우 지속 배수.
  slowSplashRadius?: number; // 프로스트 frostfield — 명중 지점 광역 슬로우 반경(px).
  executeThreshold?: number; // 스나이퍼 execute — 이 HP 비율 이하면 즉사.
  burstCount?: number; // 스나이퍼 doubleshot — 연발 수.
  burstInterval?: number; // 스나이퍼 doubleshot — 연발 간격(초).
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
  specials?: SpecialSpec[]; // 4레벨 스페셜 분기 2택(D4.2). 없으면 분기 없음(배럭).
}

interface UpgradeRules {
  maxLevel: number;
  costFactors: number[]; // 2레벨=원가×[0], 3레벨=원가×[1]
  damageMult: number; // 레벨당 공격력 배수
  rangeMult: number; // 레벨당 사거리 배수
  slowDurationMult: number; // 레벨당 슬로우 지속 배수(프로스트)
  specialCostFactor: number; // 스페셜 분기 비용 = 원가 × 이 배수(D4.2)
}

// 공통 업그레이드 규칙(모든 타워 공유).
export const UPGRADE = towersData.upgrade as UpgradeRules;

/** 종류별 스펙 조회. */
export function towerSpec(kind: TowerKind): TowerSpec {
  return towersData.towers[kind] as TowerSpec;
}

// 칸 안쪽 여백(시각 상수) — 고스트 미리보기와 설치 후 모습의 여백을 맞추는 데만 쓴다.
export const TOWER_INSET = 4;

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
  // 마지막으로 조준한 방향(rad). combat이 매 프레임 사거리 내 대상 방향으로 갱신하고,
  // render는 포탑을 이 각도로 회전시킨다(update/render 분리). 기본 0 = 기지(오른쪽) 방향.
  aimAngle = 0;
  // 발사 반동 진행도(0~1). 발사 순간 1로 세팅되고 combat.update가 매 프레임 감쇠시킨다.
  // render는 이 값으로 포신 후퇴 오프셋을 계산한다(update/render 분리).
  recoil = 0;
  // 선택된 4레벨 스페셜 분기 id(D4.2). null이면 미선택. 선택 후엔 다른 분기로 못 바꾼다.
  // 타워 인스턴스에만 존재하므로 재시작(interaction.reset)에서 타워와 함께 사라진다(런 단위).
  special: string | null = null;

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

  /** 선택된 스페셜 분기 정의(D4.2). 미선택이면 null. 실효 스탯·combat이 존재 필드만 반영. */
  get specialSpec(): SpecialSpec | null {
    if (!this.special) return null;
    return (this.spec.specials ?? []).find((s) => s.id === this.special) ?? null;
  }

  // ── 레벨 + 스페셜 반영 실효 스탯 ─────────────────────────────
  // 레벨 L의 배수 = mult^(L-1). 스페셜은 그 위에 곱/덮어쓰기로 얹는다(존재 시). combat·히트박스가 사용.
  get effectiveDamage(): number {
    const base = this.spec.damage * Math.pow(UPGRADE.damageMult, this.level - 1);
    return base * (this.specialSpec?.damageMult ?? 1); // 캐논 bigblast.
  }
  get effectiveRange(): number {
    return this.spec.range * Math.pow(UPGRADE.rangeMult, this.level - 1);
  }
  get effectiveFireRate(): number {
    return this.spec.fireRate * (this.specialSpec?.fireRateMult ?? 1); // 애로우 rapid.
  }
  get effectiveSplashRadius(): number {
    return (this.spec.splashRadius ?? 0) * (this.specialSpec?.splashRadiusMult ?? 1); // 캐논 bigblast.
  }
  get effectiveSlowFactor(): number {
    return this.specialSpec?.slowFactor ?? this.spec.slowFactor ?? 0; // 프로스트 deepfreeze는 덮어쓰기.
  }
  get effectiveSlowDuration(): number {
    const base = (this.spec.slowDuration ?? 0) * Math.pow(UPGRADE.slowDurationMult, this.level - 1);
    return base * (this.specialSpec?.slowDurationMult ?? 1); // 프로스트 deepfreeze.
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

  // ── 4레벨 스페셜 분기(D4.2) ─────────────────────────────────
  /** 선택 가능한 분기 목록(최대 레벨 도달 + 미선택 + 분기 보유 시에만 노출). */
  get specials(): SpecialSpec[] {
    return this.spec.specials ?? [];
  }
  /** 지금 분기를 고를 수 있는가 — 최대 레벨 + 미선택 + 분기 보유(배럭은 분기 없음). */
  get canChooseSpecial(): boolean {
    return this.level >= UPGRADE.maxLevel && this.special === null && this.specials.length > 0;
  }
  /** 분기 선택 비용 = 원가 × specialCostFactor. */
  get specialCost(): number {
    return Math.round(this.spec.cost * UPGRADE.specialCostFactor);
  }
  /**
   * 분기 선택 — 선택 후엔 다른 분기로 못 바꾼다. 비용을 누적 투자액에 더한다(판매 환급이 함께 증가).
   * 골드 차감·가능 여부 판단은 호출부(interaction)가 담당한다.
   */
  chooseSpecial(id: string): void {
    if (!this.canChooseSpecial) return;
    if (!this.specials.some((s) => s.id === id)) return;
    this.invested += this.specialCost;
    this.special = id;
  }

  // 렌더는 상태를 읽기만 한다(변경 없음). 베이스+회전 포탑 스프라이트 + 레벨 마커 + 선택 링.
  render(ctx: CanvasRenderingContext2D, selected: boolean): void {
    const { x, y } = cellToPixel(this.cx, this.cy);
    drawTower(ctx, this.kind as TowerVisualKind, this.level, x + TILE / 2, y + TILE / 2, this.aimAngle, this.recoil);
    if (this.special) drawSpecialStar(ctx, x + TILE / 2, y + TILE / 2); // 분기 선택 표식(금색 별).
    if (selected) drawSelectRing(ctx, x, y);
  }

  /** 선택 시 캔버스에 표시하는 실효 사거리 원(점선 네온, 읽기 전용). */
  renderRange(ctx: CanvasRenderingContext2D): void {
    const { x, y } = cellToPixel(this.cx, this.cy);
    drawRangeRing(ctx, x + TILE / 2, y + TILE / 2, this.effectiveRange);
  }
}

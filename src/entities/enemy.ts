// 적 엔티티 — 픽셀 좌표로 이동하되, 플로우필드의 "칸 단위 방향"을 따라간다.
//
// 이동 방식: 현재 목표 칸의 중심으로 직진한다. 중심에 도달하면 그 칸의
// 플로우필드 방향을 읽어 다음 목표 칸을 정한다. 한 프레임의 이동량(budget)이
// 남으면 while로 이어서 소비하므로, 빠른 적도 칸 경계에서 멈칫하지 않고
// 부드럽게 연속 이동한다.

import enemiesData from '../data/enemies.json';
import { SPAWN, cellCenter, pixelToCell } from '../game/grid';
import type { FlowField } from '../systems/pathfinding';
import { drawEnemy, drawSlowOverlay, drawShieldRing, drawRegenPulse, drawSplitMark, visualSkin } from '../render/enemySprites';
import { drawHpBar } from '../render/hpbar';

export type EnemyKind = keyof typeof enemiesData;

// 분열 능력 정의(splitter) — 처치 시 사망 위치에서 이 종류를 count만큼 스폰한다.
export interface SplitSpec {
  kind: EnemyKind;
  count: number;
}

interface EnemySpec {
  hp: number;
  speed: number; // px/s
  reward: number;
  color: string;
  radius: number; // px
  meleeDamage: number; // 접촉 시 병사에게 주는 데미지(M10)
  meleeRate: number; // 근접 공격 공속(회/s)
  shield?: number; // 첫 피격 무효 횟수(D4.1). 없으면 실드 없음.
  regenPerSec?: number; // 초당 HP 회복량(D4.1). 없으면 재생 없음.
  splitInto?: SplitSpec; // 처치 시 분열 스폰(D4.1). 없으면 분열 없음.
}

const EPS = 1e-6;

// HP바 표시 상수(밸런스 아님, 시각 상수).
const HP_BAR_HEIGHT = 3;
const HP_BAR_GAP = 7; // 몸통 위 여백.

export class Enemy {
  readonly kind: EnemyKind;
  readonly maxHp: number;
  readonly speed: number;
  readonly reward: number;
  readonly color: string;
  readonly radius: number;
  readonly meleeDamage: number; // 접촉한 병사에게 주는 데미지(M10).
  readonly meleeRate: number; // 근접 공속(회/s).
  readonly hpMultiplier: number; // 이 개체의 웨이브 HP 배율(분열체가 상속받는다).
  readonly regenPerSec: number; // 초당 HP 회복량(D4.1). 0이면 재생 없음.

  hp: number;
  // 실드 잔량(D4.1) — 남아있으면 다음 피격 1회를 무효화하고 감소한다.
  shield: number;
  // 분열 정의(D4.1) — 처치 시 game이 사망 위치에서 자식을 스폰한다(1회). null이면 분열 없음.
  splitInto: SplitSpec | null;
  // 병사와 교전 중 이동 정지(M10). melee 시스템이 매 프레임 재판정한다.
  blocked = false;
  // 근접 반격 쿨다운(초). melee 시스템이 감소·갱신한다(combat의 tower.cooldown과 동일 패턴).
  meleeCooldown = 0;
  // 칸 중심 기준 픽셀 좌표.
  x: number;
  y: number;
  // 이동 방향각(rad). update가 이동 벡터로 갱신하고 render가 몸통 회전에 쓴다(update/render 분리).
  // 기본 0 = 오른쪽(기지 방향)을 앞으로.
  facing = 0;

  // 현재 점유(막 떠난) 칸과 향하는 다음 칸.
  private cx: number;
  private cy: number;
  private tx: number;
  private ty: number;

  reachedBase = false; // 기지 칸 중심 도달 → 게임 쪽에서 라이프 감소 후 제거.
  dead = false; // M4 처치용. 프레임 끝 filter로 일괄 제거.

  // 슬로우 상태(프로스트) — 이동 속도에만 적용. 중첩 없이 리프레시.
  private slowFactor = 0; // 이속 감소 비율(0 = 감속 없음).
  private slowTimer = 0; // 남은 감속 시간(초).

  // hpMultiplier: 웨이브 스케일(HP = 기본 × 배율). 디버그 스폰은 1(기본).
  // startPos: 지정 시 스폰 칸이 아니라 그 픽셀 좌표에서 시작(분열체 — 부모 사망 위치, D4.1).
  constructor(kind: EnemyKind, field: FlowField, hpMultiplier = 1, startPos?: { x: number; y: number }) {
    const spec = enemiesData[kind] as EnemySpec;
    this.kind = kind;
    this.hpMultiplier = hpMultiplier;
    this.maxHp = Math.round(spec.hp * hpMultiplier);
    this.hp = this.maxHp;
    this.speed = spec.speed;
    this.reward = spec.reward;
    this.color = spec.color;
    this.radius = spec.radius;
    this.meleeDamage = spec.meleeDamage;
    this.meleeRate = spec.meleeRate;
    this.shield = spec.shield ?? 0;
    this.regenPerSec = spec.regenPerSec ?? 0;
    this.splitInto = spec.splitInto ?? null;

    // 시작 칸·좌표 — 기본은 스폰 칸 중심, startPos가 있으면 그 픽셀이 속한 칸에서 출발.
    if (startPos) {
      this.x = startPos.x;
      this.y = startPos.y;
      const cell = pixelToCell(this.x, this.y);
      this.cx = cell.cx;
      this.cy = cell.cy;
    } else {
      this.cx = SPAWN.cx;
      this.cy = SPAWN.cy;
      const c = cellCenter(this.cx, this.cy);
      this.x = c.x;
      this.y = c.y;
    }

    this.tx = this.cx;
    this.ty = this.cy;
    this.pickNextTarget(field);
  }

  // 현재 칸(cx, cy)의 플로우필드 방향으로 다음 목표 칸을 정한다.
  // 방향이 (0,0)이면 기지(거리 0)거나 갇힌 칸 → 목표를 현재 칸으로 두어 정지.
  private pickNextTarget(field: FlowField): void {
    const { dx, dy } = field.getDir(this.cx, this.cy);
    if (dx === 0 && dy === 0) {
      this.tx = this.cx;
      this.ty = this.cy;
      if (field.getDistance(this.cx, this.cy) === 0) this.reachedBase = true;
    } else {
      this.tx = this.cx + dx;
      this.ty = this.cy + dy;
    }
  }

  update(dt: number, field: FlowField): void {
    if (this.reachedBase || this.dead) return;

    // 재생(D4.1) — dt 기반 HP 회복(maxHp 상한). 블록·슬로우와 독립적으로 매 프레임 적용.
    if (this.regenPerSec > 0 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.regenPerSec * dt);
    }

    // 슬로우 타이머 감소 → 남아있으면 이번 프레임 이속에 감속 배율 적용.
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) this.slowTimer = 0;
    }
    const speedMult = this.slowTimer > 0 ? 1 - this.slowFactor : 1;

    // 병사에게 블로킹당하면 이번 프레임 이동만 정지(슬로우 타이머는 위에서 이미 갱신).
    if (this.blocked) return;

    let budget = this.speed * speedMult * dt;
    while (budget > 0 && !this.reachedBase) {
      const target = cellCenter(this.tx, this.ty);
      const ddx = target.x - this.x;
      const ddy = target.y - this.y;
      const d = Math.hypot(ddx, ddy);
      if (d > EPS) this.facing = Math.atan2(ddy, ddx); // 이동 방향으로 몸통 회전(렌더용).

      if (d <= EPS) {
        // 이미 목표 칸 중심에 있음 → 칸 갱신 후 다음 방향 결정.
        this.cx = this.tx;
        this.cy = this.ty;
        this.pickNextTarget(field);
        if (this.tx === this.cx && this.ty === this.cy) break; // 정지 지점.
        continue;
      }

      if (d <= budget) {
        // 이번 프레임에 목표 칸 중심 도달. 남은 이동량은 다음 칸으로 이어감.
        this.x = target.x;
        this.y = target.y;
        budget -= d;
        this.cx = this.tx;
        this.cy = this.ty;
        this.pickNextTarget(field);
        if (this.tx === this.cx && this.ty === this.cy) break;
      } else {
        this.x += (ddx / d) * budget;
        this.y += (ddy / d) * budget;
        budget = 0;
      }
    }
  }

  /** 기지까지 남은 BFS 스텝 수(진행도). 작을수록 앞선 적. 도달 불가면 -1. */
  distanceToBase(field: FlowField): number {
    return field.getDistance(this.cx, this.cy);
  }

  /** 다음 목표 칸 중심까지 남은 픽셀 거리(타겟팅 동률 판정 보조). 작을수록 앞섬. */
  distanceToNextCenter(): number {
    const c = cellCenter(this.tx, this.ty);
    return Math.hypot(c.x - this.x, c.y - this.y);
  }

  /** 슬로우 적용 — 중첩 없이 배율·타이머를 리프레시. 이동 속도에만 반영된다. */
  applySlow(factor: number, duration: number): void {
    this.slowFactor = factor;
    this.slowTimer = duration;
  }

  /**
   * 실드 판정(D4.1) — 실드가 남아 있으면 1 소모하고 true(이번 피격 전부 무효: 데미지·슬로우 없음).
   * 없으면 false(정상 피격). combat.applyHit·melee 양쪽에서 첫 피격을 흡수한다.
   */
  consumeShield(): boolean {
    if (this.shield > 0) {
      this.shield -= 1;
      return true;
    }
    return false;
  }

  /** 현재 감속 중인가(시각 표시용). */
  get slowed(): boolean {
    return this.slowTimer > 0;
  }

  /** 몸통 중심이 현재 기하학적으로 속한 칸. 타워 설치 점유 검사·재경로의 기준. */
  get cell(): { cx: number; cy: number } {
    return pixelToCell(this.x, this.y);
  }

  /**
   * 플로우필드가 바뀐 뒤(타워 설치·판매) 호출. 현재 몸통이 속한 칸을 기준으로
   * 다음 목표 칸을 다시 정한다. 향하던 칸이 벽이 됐어도 새 방향으로 자연스럽게
   * 우회하며, 점유 중인 칸은 설치가 금지되므로 벽으로 걸어 들어갈 일은 없다.
   */
  reroute(field: FlowField): void {
    if (this.reachedBase || this.dead) return;
    const { cx, cy } = pixelToCell(this.x, this.y);
    this.cx = cx;
    this.cy = cy;
    this.pickNextTarget(field);
  }

  // 렌더는 상태를 읽기만 한다(변경 없음). 몸통 스프라이트(방향 회전) + 슬로우 표시 + HP바.
  render(ctx: CanvasRenderingContext2D): void {
    // 특수 종은 기존 스킨(grunt/tanker/runner)을 재사용하고 그 위에 능력 오버레이(벡터)를 얹는다.
    drawEnemy(ctx, visualSkin(this.kind), this.x, this.y, this.facing);
    if (this.slowed) drawSlowOverlay(ctx, this.x, this.y, this.radius);
    if (this.shield > 0) drawShieldRing(ctx, this.x, this.y, this.radius);
    if (this.regenPerSec > 0) drawRegenPulse(ctx, this.x, this.y, this.radius, this.hp < this.maxHp);
    if (this.splitInto) drawSplitMark(ctx, this.x, this.y, this.facing, this.radius);

    // HP바 — 얇고 둥근 세련된 바(비율에 따라 초록→빨강).
    const ratio = Math.max(0, this.hp / this.maxHp);
    const barW = this.radius * 2;
    const r = Math.round(255 * (1 - ratio));
    const g = Math.round(255 * ratio);
    drawHpBar(
      ctx,
      this.x - this.radius,
      this.y - this.radius - HP_BAR_GAP - HP_BAR_HEIGHT,
      barW,
      HP_BAR_HEIGHT,
      ratio,
      `rgb(${r}, ${g}, 90)`,
    );
  }
}

/**
 * 지정 종류의 적을 생성한다. hpMultiplier로 웨이브 스케일 HP를 적용하고,
 * startPos가 있으면 스폰 칸이 아니라 그 픽셀 좌표에서 출발한다(분열체, D4.1).
 */
export function createEnemy(kind: EnemyKind, field: FlowField, hpMultiplier = 1, startPos?: { x: number; y: number }): Enemy {
  return new Enemy(kind, field, hpMultiplier, startPos);
}

// 자식 분산 거리(px) — 완전 겹침 방지용 구조 상수(밸런스 아님).
const SPLIT_SPREAD = 8;

/**
 * 분열(D4.1) — 이번 스텝에 죽은 분열체(splitInto가 남은 dead 적)의 자식을 사망 위치에서 스폰해
 * enemies 배열에 추가한다. dead 필터 직전에 호출하므로 자식은 곧바로 필드에 포함되어 웨이브
 * 완료(적 0) 판정에 반영된다(분열체 전멸까지 클리어되지 않음). 자식은 부모의 웨이브 HP 배율을
 * 상속하고, 스폰 위치를 조금씩 벌려 완전 겹침을 피한다. 각 개체는 1회만 분열한다.
 */
export function spawnSplits(enemies: Enemy[], field: FlowField): void {
  const parents = enemies.filter((e) => e.dead && e.splitInto);
  for (const e of parents) {
    const spec = e.splitInto!;
    e.splitInto = null; // 1회만 분열(이미 dead라 다음 filter에서 제거된다).
    for (let i = 0; i < spec.count; i++) {
      const ox = spec.count > 1 ? SPLIT_SPREAD * (i / (spec.count - 1) - 0.5) * 2 : 0;
      enemies.push(createEnemy(spec.kind, field, e.hpMultiplier, { x: e.x + ox, y: e.y }));
    }
  }
}

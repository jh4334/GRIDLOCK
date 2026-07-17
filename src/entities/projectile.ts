// 투사체 엔티티 — 발사 시점의 대상을 매 프레임 유도(호밍) 추적한다.
//
// 데미지/스플래시/슬로우 "수치"는 지니고 있되, 실제 적용(HP 차감·골드·감속)은
// combat 시스템이 명중 시점에 수행한다. 엔티티가 economy나 enemies 배열을
// 소유하지 않게 하기 위함(관심사 분리).
//
// 대상이 먼저 죽으면 target을 놓고 마지막으로 알던 위치로 직진해 소멸한다.

import type { Enemy } from './enemy';
import { drawProjectile } from '../render/fx';

// 명중 지점 화염 지대 정의(캐논 napalm, D4.2). combat이 명중 시 fireZone을 생성하는 데 쓴다.
export interface NapalmPayload {
  dps: number; // 초당 피해.
  duration: number; // 지속(초).
  radius: number; // 반경(px).
}

export interface ProjectileInit {
  x: number;
  y: number;
  speed: number; // px/s
  radius: number; // px (시각 크기 겸 명중 여유)
  color: string;
  target: Enemy;
  damage: number;
  splashRadius: number; // 0이면 단일 타격
  slowFactor: number; // 0이면 감속 없음
  slowDuration: number; // 초
  // ── 4레벨 스페셜(D4.2) — 없으면 기본값(효과 없음) ──
  pierceCount?: number; // >0이면 관통 모드(직진하며 최대 N기 타격).
  pierceFalloff?: number; // 관통당 피해 배수(누적 지수). 기본 1.
  executeThreshold?: number; // >0이면 대상 HP 비율이 이 값 이하일 때 즉사.
  slowSplashRadius?: number; // >0이면 명중 지점 이 반경 내 광역 슬로우(frostfield).
  napalm?: NapalmPayload | null; // 있으면 명중 지점에 잔류 화염 지대 생성.
  maxTravel?: number; // 관통 모드 최대 비행 거리(px) — N기 미만 타격 시 소멸 보증.
}

export class Projectile {
  x: number;
  y: number;
  readonly speed: number;
  readonly radius: number;
  readonly color: string;
  readonly damage: number;
  readonly splashRadius: number;
  readonly slowFactor: number;
  readonly slowDuration: number;

  // ── 스페셜 효과 수치(D4.2) — combat이 명중 해석에서 읽는다. ──
  readonly pierceCount: number;
  readonly pierceFalloff: number;
  readonly executeThreshold: number;
  readonly slowSplashRadius: number;
  readonly napalm: NapalmPayload | null;
  // 관통 모드: 직진 방향(정규화)과 누적 비행 거리, 이미 타격한 적 집합(중복 타격 방지).
  private readonly piercing: boolean;
  private dirX = 0;
  private dirY = 0;
  private traveled = 0;
  private readonly maxTravel: number;
  readonly hitSet = new Set<Enemy>();

  // 대상이 죽으면 null이 되고, 마지막으로 알던 위치(aimX/aimY)로 직진한다.
  private target: Enemy | null;
  private aimX: number;
  private aimY: number;

  arrived = false; // 대상/목표 지점 도달 → combat이 효과 해석에 사용.
  dead = false; // 명중(또는 소멸) → 프레임 끝 filter로 제거.

  // 트레일용 직전 위치(update가 이동 전에 갱신, render가 페이드 꼬리에 사용).
  private px: number;
  private py: number;

  constructor(init: ProjectileInit) {
    this.x = init.x;
    this.y = init.y;
    this.px = init.x;
    this.py = init.y;
    this.speed = init.speed;
    this.radius = init.radius;
    this.color = init.color;
    this.damage = init.damage;
    this.splashRadius = init.splashRadius;
    this.slowFactor = init.slowFactor;
    this.slowDuration = init.slowDuration;
    this.pierceCount = init.pierceCount ?? 0;
    this.pierceFalloff = init.pierceFalloff ?? 1;
    this.executeThreshold = init.executeThreshold ?? 0;
    this.slowSplashRadius = init.slowSplashRadius ?? 0;
    this.napalm = init.napalm ?? null;
    this.maxTravel = init.maxTravel ?? 0;
    this.target = init.target;
    this.aimX = init.target.x;
    this.aimY = init.target.y;

    // 관통 모드: 발사 순간 대상 방향으로 직진 벡터를 고정하고, 이후 호밍하지 않는다.
    this.piercing = this.pierceCount > 0;
    if (this.piercing) {
      const dx = init.target.x - init.x;
      const dy = init.target.y - init.y;
      const d = Math.hypot(dx, dy) || 1;
      this.dirX = dx / d;
      this.dirY = dy / d;
    }
  }

  /** 관통 모드인가 — combat이 명중 해석 분기(직진·다중 타격)에 쓴다. */
  get isPiercing(): boolean {
    return this.piercing;
  }

  // 대상이 살아있으면 그 위치로, 죽었으면 마지막 위치로 유도 이동.
  update(dt: number): void {
    if (this.dead) return;
    this.px = this.x; // 이동 전 위치를 트레일 시작점으로 기록.
    this.py = this.y;

    // 관통: 고정 방향으로 직진(호밍·근접 소멸 없음). 명중 판정·소멸은 combat이 담당하고,
    // 최대 비행 거리를 넘기면 스스로 소멸한다(적을 다 못 뚫어도 무한 비행 방지).
    if (this.piercing) {
      const step = this.speed * dt;
      this.x += this.dirX * step;
      this.y += this.dirY * step;
      this.traveled += step;
      if (this.traveled >= this.maxTravel) this.dead = true;
      return;
    }

    if (this.target && !this.target.dead && !this.target.reachedBase) {
      this.aimX = this.target.x;
      this.aimY = this.target.y;
    } else {
      this.target = null; // 대상 소멸 → 지점 직진.
    }

    const ddx = this.aimX - this.x;
    const ddy = this.aimY - this.y;
    const d = Math.hypot(ddx, ddy);
    const step = this.speed * dt;

    // 명중 판정: 이번 프레임에 도달/추월하거나, 명중 여유 반경 안이면 명중.
    const hitRadius = this.radius + (this.target ? this.target.radius : 0);
    if (d <= step || d <= hitRadius) {
      this.x = this.aimX;
      this.y = this.aimY;
      this.arrived = true;
      this.dead = true;
      return;
    }

    this.x += (ddx / d) * step;
    this.y += (ddy / d) * step;
  }

  /** 명중 시점의 대상(살아있으면). combat의 단일 타격 해석용. */
  get hitTarget(): Enemy | null {
    return this.target;
  }

  // 렌더는 상태를 읽기만 한다(변경 없음). 발광 코어 + 페이드 트레일.
  render(ctx: CanvasRenderingContext2D): void {
    drawProjectile(ctx, this.x, this.y, this.px, this.py, this.radius, this.color);
  }
}

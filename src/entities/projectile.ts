// 투사체 엔티티 — 발사 시점의 대상을 매 프레임 유도(호밍) 추적한다.
//
// 데미지/스플래시/슬로우 "수치"는 지니고 있되, 실제 적용(HP 차감·골드·감속)은
// combat 시스템이 명중 시점에 수행한다. 엔티티가 economy나 enemies 배열을
// 소유하지 않게 하기 위함(관심사 분리).
//
// 대상이 먼저 죽으면 target을 놓고 마지막으로 알던 위치로 직진해 소멸한다.

import type { Enemy } from './enemy';

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

  // 대상이 죽으면 null이 되고, 마지막으로 알던 위치(aimX/aimY)로 직진한다.
  private target: Enemy | null;
  private aimX: number;
  private aimY: number;

  arrived = false; // 대상/목표 지점 도달 → combat이 효과 해석에 사용.
  dead = false; // 명중(또는 소멸) → 프레임 끝 filter로 제거.

  constructor(init: ProjectileInit) {
    this.x = init.x;
    this.y = init.y;
    this.speed = init.speed;
    this.radius = init.radius;
    this.color = init.color;
    this.damage = init.damage;
    this.splashRadius = init.splashRadius;
    this.slowFactor = init.slowFactor;
    this.slowDuration = init.slowDuration;
    this.target = init.target;
    this.aimX = init.target.x;
    this.aimY = init.target.y;
  }

  // 대상이 살아있으면 그 위치로, 죽었으면 마지막 위치로 유도 이동.
  update(dt: number): void {
    if (this.dead) return;

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

  // 렌더는 상태를 읽기만 한다(변경 없음). 작은 원으로 표시.
  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

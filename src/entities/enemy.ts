// 적 엔티티 — 픽셀 좌표로 이동하되, 플로우필드의 "칸 단위 방향"을 따라간다.
//
// 이동 방식: 현재 목표 칸의 중심으로 직진한다. 중심에 도달하면 그 칸의
// 플로우필드 방향을 읽어 다음 목표 칸을 정한다. 한 프레임의 이동량(budget)이
// 남으면 while로 이어서 소비하므로, 빠른 적도 칸 경계에서 멈칫하지 않고
// 부드럽게 연속 이동한다.

import enemiesData from '../data/enemies.json';
import { SPAWN, cellCenter, pixelToCell } from '../game/grid';
import type { FlowField } from '../systems/pathfinding';

export type EnemyKind = keyof typeof enemiesData;

interface EnemySpec {
  hp: number;
  speed: number; // px/s
  reward: number;
  color: string;
  radius: number; // px
  meleeDamage: number; // 접촉 시 병사에게 주는 데미지(M10)
  meleeRate: number; // 근접 공격 공속(회/s)
}

const EPS = 1e-6;

// HP바 표시 상수(밸런스 아님, 시각 상수).
const HP_BAR_HEIGHT = 4;
const HP_BAR_GAP = 6; // 몸통 위 여백.

// 슬로우 시각 표시(밸런스 아님, 시각 상수).
const COLOR_SLOW_TINT = 'rgba(150, 220, 255, 0.35)';
const COLOR_SLOW_RING = 'rgba(150, 220, 255, 0.9)';

export class Enemy {
  readonly kind: EnemyKind;
  readonly maxHp: number;
  readonly speed: number;
  readonly reward: number;
  readonly color: string;
  readonly radius: number;
  readonly meleeDamage: number; // 접촉한 병사에게 주는 데미지(M10).
  readonly meleeRate: number; // 근접 공속(회/s).

  hp: number;
  // 병사와 교전 중 이동 정지(M10). melee 시스템이 매 프레임 재판정한다.
  blocked = false;
  // 근접 반격 쿨다운(초). melee 시스템이 감소·갱신한다(combat의 tower.cooldown과 동일 패턴).
  meleeCooldown = 0;
  // 칸 중심 기준 픽셀 좌표.
  x: number;
  y: number;

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
  constructor(kind: EnemyKind, field: FlowField, hpMultiplier = 1) {
    const spec = enemiesData[kind] as EnemySpec;
    this.kind = kind;
    this.maxHp = Math.round(spec.hp * hpMultiplier);
    this.hp = this.maxHp;
    this.speed = spec.speed;
    this.reward = spec.reward;
    this.color = spec.color;
    this.radius = spec.radius;
    this.meleeDamage = spec.meleeDamage;
    this.meleeRate = spec.meleeRate;

    this.cx = SPAWN.cx;
    this.cy = SPAWN.cy;
    const c = cellCenter(this.cx, this.cy);
    this.x = c.x;
    this.y = c.y;

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

  // 렌더는 상태를 읽기만 한다(변경 없음).
  render(ctx: CanvasRenderingContext2D): void {
    // 몸통.
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // 슬로우 표시 — 옅은 하늘색 틴트 + 테두리.
    if (this.slowed) {
      ctx.save();
      ctx.fillStyle = COLOR_SLOW_TINT;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COLOR_SLOW_RING;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius + 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // HP바.
    const ratio = Math.max(0, this.hp / this.maxHp);
    const barW = this.radius * 2;
    const bx = this.x - this.radius;
    const by = this.y - this.radius - HP_BAR_GAP - HP_BAR_HEIGHT;

    // 배경(검정 테두리).
    ctx.fillStyle = '#000';
    ctx.fillRect(bx - 1, by - 1, barW + 2, HP_BAR_HEIGHT + 2);

    // 체력(비율에 따라 초록→빨강).
    const r = Math.round(255 * (1 - ratio));
    const g = Math.round(255 * ratio);
    ctx.fillStyle = `rgb(${r}, ${g}, 60)`;
    ctx.fillRect(bx, by, barW * ratio, HP_BAR_HEIGHT);
  }
}

/** 스폰 칸에서 지정 종류의 적을 생성한다. hpMultiplier로 웨이브 스케일 HP를 적용한다. */
export function createEnemy(kind: EnemyKind, field: FlowField, hpMultiplier = 1): Enemy {
  return new Enemy(kind, field, hpMultiplier);
}

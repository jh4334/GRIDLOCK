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
}

const EPS = 1e-6;

// HP바 표시 상수(밸런스 아님, 시각 상수).
const HP_BAR_HEIGHT = 4;
const HP_BAR_GAP = 6; // 몸통 위 여백.

export class Enemy {
  readonly kind: EnemyKind;
  readonly maxHp: number;
  readonly speed: number;
  readonly reward: number;
  readonly color: string;
  readonly radius: number;

  hp: number;
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

  constructor(kind: EnemyKind, field: FlowField) {
    const spec = enemiesData[kind] as EnemySpec;
    this.kind = kind;
    this.maxHp = spec.hp;
    this.hp = spec.hp;
    this.speed = spec.speed;
    this.reward = spec.reward;
    this.color = spec.color;
    this.radius = spec.radius;

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

    let budget = this.speed * dt;
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

/** 스폰 칸에서 지정 종류의 적을 생성한다. */
export function createEnemy(kind: EnemyKind, field: FlowField): Enemy {
  return new Enemy(kind, field);
}

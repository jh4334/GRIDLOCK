// 아군 유닛(M10, Kingdom Rush식 배럭) — 배럭이 병사 3기를 유지하고, 병사는 근접전으로
// 적을 블로킹한다. 밸런스 수치는 전부 towers.json의 barracks 섹션에서 로딩(매직넘버 금지).
//
// 역할 분담:
//   - Soldier: 순수 엔티티(위치·스탯·상태·이동·자기 공격 쿨다운). 소속 배럭을 참조한다.
//   - Barracks: Tower 상속. 병사 로스터 유지(사망 → 리스폰 타이머 → 재스폰), 집결지 소유.
// 타겟팅·교전·블로킹 판정은 systems/melee.ts가 담당한다(전투 로직은 여기 두지 않는다).
// update(dt)/render(ctx) 분리 — 상태 변경은 melee/maintain에서, render는 읽기 전용.

import { cellCenter } from '../game/grid';
import type { PathGrid } from '../systems/astar';
import { Tower, UPGRADE } from './tower';
import type { BarracksSpec } from './tower';
import type { Enemy } from './enemy';

// 병사 상태머신: 집결지로/대기 이동(moving) → 대기(idle) ↔ 교전(engaging) → 사망(dead).
export type SoldierState = 'moving' | 'idle' | 'engaging' | 'dead';

// 병사 렌더 상수(밸런스 아님, 시각 상수).
const SOLDIER_OUTLINE = '#26324a';
const HP_BAR_HEIGHT = 3;
const HP_BAR_GAP = 5;

interface SoldierOptions {
  barracks: Barracks;
  slot: number;
  x: number;
  y: number;
  hp: number;
  damage: number;
  attackRate: number;
  speed: number;
  radius: number;
  color: string;
}

export class Soldier {
  readonly barracks: Barracks; // 소속 배럭(집결지 슬롯 조회·리스폰 큐 반환용).
  readonly slot: number; // 집결지 산개 배치에서 차지하는 자리(0..count-1).
  readonly speed: number;
  readonly radius: number;
  readonly color: string;
  readonly attackRate: number;

  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  attackCooldown = 0; // 다음 공격까지 남은 시간(초). melee가 감소·갱신.
  target: Enemy | null = null; // 현재 교전 대상(melee가 지정·해제).
  state: SoldierState = 'moving';
  dead = false; // hp<=0. Barracks.maintain이 제거하고 리스폰 큐에 넣는다.

  // ── RTS 이동 명령(M11) ──
  // 명령 경로 — A*가 만든 칸 중심 웨이포인트 목록. 앞에서부터 소비한다(비면 도착).
  path: { x: number; y: number }[] = [];
  // 개별 집결지 — 이동 명령 도착점(산개 슬롯). null이면 배럭 슬롯으로 복귀한다.
  rallyOverride: { x: number; y: number } | null = null;

  /** 지금 대기해야 할 지점 — 개별 명령이 있으면 그 슬롯, 없으면 배럭 집결 슬롯. */
  guardPoint(): { x: number; y: number } {
    return this.rallyOverride ?? this.barracks.slotPosition(this.slot);
  }

  constructor(o: SoldierOptions) {
    this.barracks = o.barracks;
    this.slot = o.slot;
    this.x = o.x;
    this.y = o.y;
    this.hp = o.hp;
    this.maxHp = o.hp;
    this.damage = o.damage;
    this.attackRate = o.attackRate;
    this.speed = o.speed;
    this.radius = o.radius;
    this.color = o.color;
  }

  /** 목표점으로 이번 프레임만큼 직선 이동. 도착하면 true. */
  moveToward(tx: number, ty: number, dt: number): boolean {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (d <= step || d === 0) {
      this.x = tx;
      this.y = ty;
      return true;
    }
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
    return false;
  }

  /**
   * 교전 대상이 없을 때의 이동 — 명령 경로가 남아 있으면 그 웨이포인트를 순차로 따라가고,
   * 다 소비했으면 자기 대기 지점(guardPoint)으로 복귀. 도착하면 idle, 아니면 moving.
   */
  returnToRally(dt: number): void {
    if (this.path.length > 0) {
      const wp = this.path[0];
      if (this.moveToward(wp.x, wp.y, dt)) this.path.shift(); // 웨이포인트 도달 → 다음 칸으로.
      this.state = 'moving';
      return;
    }
    const p = this.guardPoint();
    const arrived = this.moveToward(p.x, p.y, dt);
    this.state = arrived ? 'idle' : 'moving';
  }

  /** 배럭 업그레이드 시 생존 병사 스탯 갱신 — 최대HP/공격력 반영, 현재 체력비 유지. */
  applyStats(maxHp: number, damage: number): void {
    const ratio = this.maxHp > 0 ? this.hp / this.maxHp : 1;
    this.maxHp = maxHp;
    this.hp = Math.max(1, Math.min(maxHp, Math.round(maxHp * ratio)));
    this.damage = damage;
  }

  // 렌더는 읽기 전용 — 아군 색 작은 원 + 외곽선 + HP바(적과 구분).
  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = this.color;
    ctx.strokeStyle = SOLDIER_OUTLINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const ratio = Math.max(0, this.hp / this.maxHp);
    const barW = this.radius * 2;
    const bx = this.x - this.radius;
    const by = this.y - this.radius - HP_BAR_GAP - HP_BAR_HEIGHT;
    ctx.fillStyle = '#000';
    ctx.fillRect(bx - 1, by - 1, barW + 2, HP_BAR_HEIGHT + 2);
    ctx.fillStyle = '#7fd0ff'; // 아군 HP바 — 적(초록→빨강)과 다른 하늘색.
    ctx.fillRect(bx, by, barW * ratio, HP_BAR_HEIGHT);
  }
}

// 집결지 마커(시각 상수).
const FLAG_HEIGHT = 22;
const FLAG_COLOR = '#eaf0ff';
const FLAG_POLE = '#c8c8d0';
const RALLY_RING = 'rgba(234, 240, 255, 0.25)';

export class Barracks extends Tower {
  readonly bspec: BarracksSpec;
  readonly soldiers: Soldier[] = [];
  private readonly respawnQueue: number[] = []; // 대기 중 리스폰 타이머(각 원소 = 남은 초).
  rallyX: number; // 집결지 중심(픽셀).
  rallyY: number;

  constructor(cx: number, cy: number, grid: PathGrid) {
    super('barracks', cx, cy);
    this.bspec = this.spec.barracks as BarracksSpec;
    const rally = this.defaultRally(cx, cy, grid);
    this.rallyX = rally.x;
    this.rallyY = rally.y;
    for (let i = 0; i < this.bspec.soldierCount; i++) this.spawnSoldier(i);
  }

  // ── 병사 실효 스탯(레벨 반영, 업그레이드 damageMult 재사용 — 사거리 배수는 무의미) ──
  get soldierMaxHp(): number {
    return this.bspec.soldierHp * Math.pow(UPGRADE.damageMult, this.level - 1);
  }
  get soldierDamage(): number {
    return this.bspec.soldierDamage * Math.pow(UPGRADE.damageMult, this.level - 1);
  }
  get engageRadius(): number {
    return this.bspec.engageRadius;
  }
  get aliveCount(): number {
    return this.soldiers.length;
  }
  get respawningCount(): number {
    return this.respawnQueue.length;
  }

  /** 기본 집결지 = 배럭 인접 통행 칸(기지 방향 우선). 없으면 배럭 칸 중심. */
  private defaultRally(cx: number, cy: number, grid: PathGrid): { x: number; y: number } {
    const cand: ReadonlyArray<readonly [number, number]> = [
      [1, 0],
      [0, -1],
      [0, 1],
      [-1, 0],
    ];
    for (const [dx, dy] of cand) {
      if (grid.isWalkable(cx + dx, cy + dy)) return cellCenter(cx + dx, cy + dy);
    }
    return cellCenter(cx, cy);
  }

  /** 집결지 중심 주변 산개 좌표(원주 균등 분산 — 3기면 삼각 배치). */
  slotPosition(slot: number): { x: number; y: number } {
    const n = this.bspec.soldierCount;
    const ang = -Math.PI / 2 + (slot * (Math.PI * 2)) / n;
    return {
      x: this.rallyX + Math.cos(ang) * this.bspec.rallyRadius,
      y: this.rallyY + Math.sin(ang) * this.bspec.rallyRadius,
    };
  }

  /** 우클릭으로 새 집결지 지정(호출부가 통행 가능 여부를 이미 검증). */
  setRally(x: number, y: number): void {
    this.rallyX = x;
    this.rallyY = y;
  }

  private freeSlot(): number {
    const used = new Set(this.soldiers.map((s) => s.slot));
    for (let i = 0; i < this.bspec.soldierCount; i++) if (!used.has(i)) return i;
    return 0;
  }

  private spawnSoldier(slot?: number): void {
    const c = cellCenter(this.cx, this.cy); // 배럭 칸에서 나와 집결지로 이동.
    this.soldiers.push(
      new Soldier({
        barracks: this,
        slot: slot ?? this.freeSlot(),
        x: c.x,
        y: c.y,
        hp: this.soldierMaxHp,
        damage: this.soldierDamage,
        attackRate: this.bspec.soldierAttackRate,
        speed: this.bspec.soldierSpeed,
        radius: this.bspec.soldierRadius,
        color: this.bspec.soldierColor,
      }),
    );
  }

  /**
   * 로스터 유지 — 사망 병사를 제거하고 리스폰 타이머를 큐에 넣은 뒤, 만료된 타이머만큼
   * 새 병사를 스폰한다. melee 시스템이 매 프레임(월드 서브스텝) 호출한다.
   */
  maintain(dt: number): void {
    for (let i = this.soldiers.length - 1; i >= 0; i--) {
      if (this.soldiers[i].dead) {
        this.soldiers.splice(i, 1);
        this.respawnQueue.push(this.bspec.respawnTime);
      }
    }
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      this.respawnQueue[i] -= dt;
      if (this.respawnQueue[i] <= 0) {
        this.respawnQueue.splice(i, 1);
        this.spawnSoldier();
      }
    }
  }

  /** 업그레이드 — 레벨을 올리고(super) 생존 병사 스탯도 즉시 갱신. */
  upgrade(): void {
    super.upgrade();
    for (const s of this.soldiers) s.applyStats(this.soldierMaxHp, this.soldierDamage);
  }

  /** 선택 중일 때 집결지 깃발 + 감지 반경 표시(읽기 전용). */
  renderRally(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    // 감지 반경.
    ctx.strokeStyle = RALLY_RING;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(this.rallyX, this.rallyY, this.engageRadius, 0, Math.PI * 2);
    ctx.stroke();

    // 깃대 + 페넌트.
    const px = this.rallyX;
    const topY = this.rallyY - FLAG_HEIGHT;
    ctx.strokeStyle = FLAG_POLE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, this.rallyY);
    ctx.lineTo(px, topY);
    ctx.stroke();
    ctx.fillStyle = FLAG_COLOR;
    ctx.beginPath();
    ctx.moveTo(px, topY);
    ctx.lineTo(px + 14, topY + 5);
    ctx.lineTo(px, topY + 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

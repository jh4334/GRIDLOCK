// 일꾼(Worker) — 정복 모드의 채집·건설 유닛. 상태머신으로 채집 사이클을 무한 반복한다.
//
// 상태: idle | toCrystal | harvesting | returning  (핵심 채집 사이클, T12.2)
//       moving | toBuild | building                (우클릭 이동 / 건설, T12.3)
//
// 채집 사이클: idle(가장 가까운 크리스탈 자동 탐색) → A*로 크리스탈 인접까지 이동(toCrystal)
//   → 채집(harvesting, harvestTime초) → 크리스탈을 들고 HQ 인접까지 복귀(returning) → 반납
//   → 크리스탈이 남아 있으면 다시 toCrystal, 고갈됐으면 idle(다른 크리스탈 탐색).
// A*(systems/astar)·좌표 유틸(grid.ts)을 재사용한다. 수치는 conquest.json에서 코디네이터가 주입.

import { cellCenter, pixelToCell } from '../game/grid';
import { findPath } from '../systems/astar';
import { walkableNeighbors } from './conquestMap';
import type { ConquestGrid } from './conquestMap';
import type { Crystal } from './crystal';
import type { HQ } from './hq';
import type { Building } from './building';

export type WorkerState = 'idle' | 'toCrystal' | 'harvesting' | 'returning' | 'moving' | 'toBuild' | 'building';

// 일꾼이 참조하는 주변 세계(코디네이터가 매 업데이트 주입).
export interface WorkerContext {
  grid: ConquestGrid;
  crystals: Crystal[];
  hq: HQ;
  onDeposit(amount: number): void; // 반납 시 크리스탈 자원 증가.
  onBuildComplete(b: Building): void; // 건설 완료 시 부수효과 처리(배럭 생성/보급고 인구).
}

const COLOR_BODY = '#e0b357';
const COLOR_OUTLINE = '#4a3a12';
const COLOR_CARRY = '#5be0d0';
const HP_BAR_H = 3;
const HP_BAR_GAP = 5;

type Pt = { x: number; y: number };

export class Worker {
  x: number;
  y: number;
  hp: number;
  readonly maxHp: number;
  readonly speed: number;
  readonly radius: number;
  private readonly harvestAmount: number;
  private readonly harvestTime: number;

  state: WorkerState = 'idle';
  dead = false;

  private path: Pt[] = []; // A* 웨이포인트(칸 중심). 앞에서부터 소비.
  private targetCrystal: Crystal | null = null;
  private targetBuilding: Building | null = null;
  private carrying = 0;
  private harvestTimer = 0;

  constructor(x: number, y: number, stats: { hp: number; speed: number; radius: number; harvestAmount: number; harvestTime: number }) {
    this.x = x;
    this.y = y;
    this.hp = stats.hp;
    this.maxHp = stats.hp;
    this.speed = stats.speed;
    this.radius = stats.radius;
    this.harvestAmount = stats.harvestAmount;
    this.harvestTime = stats.harvestTime;
  }

  private get cell(): { cx: number; cy: number } {
    return pixelToCell(this.x, this.y);
  }

  // 목표점으로 이번 프레임만큼 직선 이동. 도착하면 true.
  private moveToward(tx: number, ty: number, dt: number): boolean {
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

  // 경로 웨이포인트를 따라 이동. 경로를 다 소비하면(=도착) true.
  private followPath(dt: number): boolean {
    if (this.path.length === 0) return true;
    const wp = this.path[0];
    if (this.moveToward(wp.x, wp.y, dt)) this.path.shift();
    return this.path.length === 0;
  }

  // ── 명령(선택/우클릭) ────────────────────────────────────────
  /** 지정 크리스탈 채집 시작. 도달 불가면 idle 유지. */
  commandHarvest(c: Crystal, grid: ConquestGrid): void {
    this.startHarvest(c, grid);
  }

  /** 임의 통행 칸으로 이동(우클릭). 도착 후 idle → 자동 채집 재개. */
  commandMove(cx: number, cy: number, grid: ConquestGrid): void {
    const p = findPath(grid, this.cell, { cx, cy });
    if (p === null) return;
    this.path = p.map((c) => cellCenter(c.cx, c.cy));
    this.targetCrystal = null;
    this.targetBuilding = null;
    this.state = 'moving';
  }

  /** 건물 건설 배정 — 건물 인접까지 이동해 건설한다. */
  commandBuild(b: Building, grid: ConquestGrid): void {
    const p = pathToNode(grid, this.cell, b.cx, b.cy);
    if (p === null) return;
    this.targetBuilding = b;
    this.targetCrystal = null;
    this.path = p;
    this.state = 'toBuild';
  }

  // ── 채집 시작 헬퍼 ───────────────────────────────────────────
  private startHarvest(c: Crystal, grid: ConquestGrid): void {
    const p = pathToNode(grid, this.cell, c.cx, c.cy);
    if (p === null) {
      this.targetCrystal = null;
      this.state = 'idle';
      return;
    }
    this.targetCrystal = c;
    this.path = p;
    this.state = 'toCrystal';
  }

  // HQ 인접까지 복귀 경로 설정.
  private startReturn(ctx: WorkerContext): void {
    const p = pathToNode(ctx.grid, this.cell, ctx.hq.cx, ctx.hq.cy);
    this.path = p ?? [];
    this.state = 'returning';
  }

  // ── update(상태머신) ─────────────────────────────────────────
  update(dt: number, ctx: WorkerContext): void {
    switch (this.state) {
      case 'idle':
        this.tickIdle(ctx);
        break;
      case 'toCrystal':
        if (!this.targetCrystal || this.targetCrystal.depleted) {
          this.state = 'idle';
        } else if (this.followPath(dt)) {
          this.state = 'harvesting';
          this.harvestTimer = this.harvestTime;
        }
        break;
      case 'harvesting':
        this.tickHarvest(dt, ctx);
        break;
      case 'returning':
        if (this.followPath(dt)) this.tickDeposit(ctx);
        break;
      case 'moving':
        if (this.followPath(dt)) this.state = 'idle';
        break;
      case 'toBuild':
        if (!this.targetBuilding || this.targetBuilding.complete) this.state = 'idle';
        else if (this.followPath(dt)) this.state = 'building';
        break;
      case 'building':
        this.tickBuild(dt, ctx);
        break;
    }
  }

  private tickIdle(ctx: WorkerContext): void {
    const pick = chooseCrystal(ctx.grid, this.cell, ctx.crystals);
    if (!pick) return; // 채집 가능한 크리스탈 없음 → 대기.
    this.targetCrystal = pick.crystal;
    this.path = pick.path;
    this.state = 'toCrystal';
  }

  private tickHarvest(dt: number, ctx: WorkerContext): void {
    if (!this.targetCrystal || this.targetCrystal.depleted) {
      this.state = 'idle';
      return;
    }
    this.harvestTimer -= dt;
    if (this.harvestTimer <= 0) {
      this.carrying = this.targetCrystal.extract(this.harvestAmount);
      this.startReturn(ctx);
    }
  }

  private tickDeposit(ctx: WorkerContext): void {
    if (this.carrying > 0) ctx.onDeposit(this.carrying);
    this.carrying = 0;
    if (this.targetCrystal && !this.targetCrystal.depleted) {
      this.startHarvest(this.targetCrystal, ctx.grid);
    } else {
      this.targetCrystal = null;
      this.state = 'idle';
    }
  }

  private tickBuild(dt: number, ctx: WorkerContext): void {
    const b = this.targetBuilding;
    if (!b) {
      this.state = 'idle';
      return;
    }
    if (b.advance(dt)) {
      ctx.onBuildComplete(b);
      this.targetBuilding = null;
      this.state = 'idle';
    }
  }

  // ── render(읽기 전용) ────────────────────────────────────────
  render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = COLOR_BODY;
    ctx.strokeStyle = COLOR_OUTLINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 크리스탈 운반 표시 — 작은 점.
    if (this.carrying > 0) {
      ctx.fillStyle = COLOR_CARRY;
      ctx.beginPath();
      ctx.arc(this.x, this.y - this.radius - 3, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.hp < this.maxHp) {
      const ratio = Math.max(0, this.hp / this.maxHp);
      const barW = this.radius * 2;
      const bx = this.x - this.radius;
      const by = this.y - this.radius - HP_BAR_GAP - HP_BAR_H;
      ctx.fillStyle = '#000';
      ctx.fillRect(bx - 1, by - 1, barW + 2, HP_BAR_H + 2);
      ctx.fillStyle = '#7fd0ff';
      ctx.fillRect(bx, by, barW * ratio, HP_BAR_H);
    }
  }
}

// 비통행 노드(크리스탈/HQ/건물)에 인접한 통행 칸 중 최단 경로를 골라 웨이포인트로 반환.
// 도달 가능한 인접 칸이 없으면 null. (from에서 이미 인접해 있으면 빈 경로 = 즉시 도착.)
function pathToNode(grid: ConquestGrid, from: { cx: number; cy: number }, cx: number, cy: number): Pt[] | null {
  let best: Pt[] | null = null;
  let bestLen = Infinity;
  for (const nb of walkableNeighbors(grid, cx, cy)) {
    const p = findPath(grid, from, nb);
    if (p === null) continue;
    if (p.length < bestLen) {
      bestLen = p.length;
      best = p.map((c) => cellCenter(c.cx, c.cy));
    }
  }
  return best;
}

// from에서 가장 가까운(도달 가능·잔량 있는) 크리스탈과 그 경로. 없으면 null.
function chooseCrystal(
  grid: ConquestGrid,
  from: { cx: number; cy: number },
  crystals: Crystal[],
): { crystal: Crystal; path: Pt[] } | null {
  const live = crystals
    .filter((c) => !c.depleted)
    .sort((a, b) => manhattan(from, a) - manhattan(from, b));
  for (const c of live) {
    const p = pathToNode(grid, from, c.cx, c.cy);
    if (p !== null) return { crystal: c, path: p };
  }
  return null;
}

function manhattan(a: { cx: number; cy: number }, b: { cx: number; cy: number }): number {
  return Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy);
}

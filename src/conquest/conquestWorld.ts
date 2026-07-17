// 정복 모드 월드(모델) — 두 진영(플레이어/적)의 경제·건물·유닛·본진을 소유하고 시뮬레이션한다.
// 코디네이터(conquestGame)는 이 모델을 update/render 조율하고 입력을 명령으로 옮긴다.
// 전투는 conquestCombat, 적 성장·웨이브는 enemyAI에 위임한다. 수치는 전부 conquest.json.
// update(dt)에서만 상태 변경. 승패 확정(phase) 후에는 시뮬레이션을 정지한다.

import conquestData from '../data/conquest.json';
import { cellCenter, pixelToCell } from '../game/grid';
import { findPath } from '../systems/astar';
import { EffectsSystem } from '../systems/effects';
import { ConquestGrid, walkableNeighbors } from './conquestMap';
import { Crystal } from './crystal';
import { HQ } from './hq';
import { Building, BuildKind } from './building';
import { Worker, WorkerContext } from './worker';
import { CombatUnit, Combatant } from './combatUnit';
import { spawnUnitsFor, maintainBarracks } from './roster';
import { ConquestCombat, pathToStructure } from './conquestCombat';
import { EnemyAI } from './enemyAI';

const C = conquestData;

export type ConquestPhase = 'playing' | 'won' | 'lost';

// 승/패 효과음 배선용 최소 계약(코디네이터의 AudioEngine이 구조적으로 만족).
export interface WorldAudio {
  kill(): void;
  hit(): void;
}

export class ConquestWorld {
  readonly grid = new ConquestGrid();
  readonly crystals: Crystal[] = [];
  readonly workers: Worker[] = []; // 플레이어 일꾼.
  readonly buildings: Building[] = []; // 양 진영 건물(파괴 시 in-place 제거).
  readonly units: CombatUnit[] = []; // 양 진영 전투 유닛(사망 시 in-place 제거).
  readonly playerHQ: HQ;
  readonly enemyHQ: HQ;
  readonly effects = new EffectsSystem();
  readonly combat: ConquestCombat;
  readonly enemyAI: EnemyAI;

  crystal = C.startCrystal; // 플레이어 보유 자원.
  phase: ConquestPhase = 'playing';
  private depotsBuilt = 0;

  constructor(private audio?: WorldAudio) {
    this.playerHQ = new HQ('player', C.hq.playerCell[0], C.hq.playerCell[1], C.hq.hp, C.hq.workerBuildTime, C.hq.queueMax);
    this.enemyHQ = new HQ('enemy', C.hq.enemyCell[0], C.hq.enemyCell[1], C.hq.hp, C.hq.workerBuildTime, C.hq.queueMax);
    this.grid.setState(this.playerHQ.cx, this.playerHQ.cy, 'wall');
    this.grid.setState(this.enemyHQ.cx, this.enemyHQ.cy, 'wall');

    const cells = [...C.crystal.playerCells, ...C.crystal.enemyCells, ...C.crystal.centerCells];
    for (const [cx, cy] of cells) {
      this.crystals.push(new Crystal(cx, cy, C.crystal.amount));
      this.grid.setState(cx, cy, 'crystal');
    }

    this.combat = new ConquestCombat({
      onUnitKilled: (x, y, color) => {
        this.effects.spawnKill(x, y, color);
        this.audio?.kill();
      },
      onProjectileHit: () => this.audio?.hit(),
    });

    this.enemyAI = new EnemyAI({
      grid: this.grid,
      crystals: this.crystals,
      enemyHQ: this.enemyHQ,
      playerHQ: this.playerHQ,
      buildings: this.buildings,
      units: this.units,
      onBuildComplete: (b) => this.onBuildComplete(b),
    });
  }

  /** 다음 적 공격 웨이브까지 남은 초(HUD). */
  get secondsToAttack(): number {
    return this.enemyAI.secondsToAttack;
  }
  get allWorkers(): Worker[] {
    return [...this.workers, ...this.enemyAI.workers];
  }
  get playerUnits(): CombatUnit[] {
    return this.units.filter((u) => u.side === 'player' && !u.dead);
  }

  // ── 인구(플레이어) ───────────────────────────────────────────
  get popMax(): number {
    return Math.min(C.population.cap, C.population.base + this.depotsBuilt * C.population.perDepot);
  }
  private get soldierCount(): number {
    return this.units.reduce((n, u) => n + (u.side === 'player' && !u.dead ? 1 : 0), 0);
  }
  get popUsed(): number {
    return (
      this.workers.length * C.population.perWorker +
      this.soldierCount * C.population.perSoldier +
      this.playerHQ.queueCount * C.population.perWorker
    );
  }

  // ── 일꾼 생산(플레이어) ──────────────────────────────────────
  get canProduceWorker(): boolean {
    return (
      this.crystal >= C.hq.workerCost && this.playerHQ.canQueue && this.popUsed + C.population.perWorker <= this.popMax
    );
  }
  produceWorker(): void {
    if (!this.canProduceWorker) return;
    this.crystal -= C.hq.workerCost;
    this.playerHQ.enqueue();
  }
  private spawnWorker(): void {
    const nb = walkableNeighbors(this.grid, this.playerHQ.cx, this.playerHQ.cy)[0];
    const p = nb ? cellCenter(nb.cx, nb.cy) : this.playerHQ.spawnPoint();
    this.workers.push(
      new Worker(p.x, p.y, {
        hp: C.worker.hp,
        speed: C.worker.speed,
        radius: C.worker.radius,
        harvestAmount: C.worker.harvestAmount,
        harvestTime: C.worker.harvestTime,
      }),
    );
  }

  // ── 건설(플레이어) ───────────────────────────────────────────
  buildSpec(kind: BuildKind): { cost: number; buildTime: number } {
    return C.buildings[kind];
  }
  canBuildAt(cx: number, cy: number): boolean {
    return this.grid.isWalkable(cx, cy);
  }
  startBuild(kind: BuildKind, cx: number, cy: number): boolean {
    const spec = C.buildings[kind];
    if (this.crystal < spec.cost) return false;
    if (!this.canBuildAt(cx, cy)) return false;
    const worker = this.nearestWorker(cx, cy);
    if (!worker) return false;
    this.crystal -= spec.cost;
    const b = new Building('player', kind, cx, cy, spec.buildTime, spec.hp);
    this.buildings.push(b);
    this.grid.setState(cx, cy, 'wall');
    worker.commandBuild(b, this.grid);
    return true;
  }
  // 건설 배정 일꾼 선택 — 이미 건설 중인 일꾼을 빼앗지 않도록 '건설 중 아닌' 일꾼을 우선하고,
  // 그런 일꾼이 없을 때만 아무 일꾼이나 배정한다.
  private nearestWorker(cx: number, cy: number): Worker | null {
    const target = cellCenter(cx, cy);
    return (
      this.pickWorker(target, (w) => w.state !== 'toBuild' && w.state !== 'building') ??
      this.pickWorker(target, () => true)
    );
  }
  private pickWorker(target: { x: number; y: number }, ok: (w: Worker) => boolean): Worker | null {
    let best: Worker | null = null;
    let bestD = Infinity;
    for (const w of this.workers) {
      if (w.dead || !ok(w)) continue;
      const d = (w.x - target.x) ** 2 + (w.y - target.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    return best;
  }

  // 건설 완료 부수효과(양 진영 공통) — 배럭은 유닛 배치, 플레이어 보급고는 인구 상한 증가.
  private onBuildComplete(b: Building): void {
    if (b.isBarracks) spawnUnitsFor(b, this.units, this.grid);
    else if (b.kind === 'depot' && b.side === 'player') this.depotsBuilt++;
  }

  private workerContext(): WorkerContext {
    return {
      grid: this.grid,
      crystals: this.crystals,
      hq: this.playerHQ,
      onDeposit: (amount) => {
        this.crystal += amount;
      },
      onBuildComplete: (b) => this.onBuildComplete(b),
    };
  }

  // ── 플레이어 유닛 명령(우클릭) ───────────────────────────────
  /** 선택 유닛에게 이동/공격 명령 — 클릭 지점이 적 구조물/유닛 근처면 접근 후 공격.
   *  attackMove=true(A키)면 경로 이동 중에도 전체 사거리로 적 유닛·건물을 감지·교전한다. */
  commandUnits(units: CombatUnit[], px: number, py: number, attackMove = false): void {
    const { cx, cy } = pixelToCell(px, py);
    const target = this.hostileTargetAt(px, py, 'player');
    for (const u of units) {
      u.attackMove = attackMove;
      if (target && target.structure) {
        const tcell = this.structureCell(target);
        const path = pathToStructure(this.grid, u.cell, tcell.cx, tcell.cy);
        if (path) {
          u.path = path;
          u.orderedTarget = target;
        }
      } else if (target) {
        const p = findPath(this.grid, u.cell, pixelToCell(target.x, target.y));
        if (p) u.path = p.map((c) => cellCenter(c.cx, c.cy));
        u.orderedTarget = target;
      } else if (this.grid.isWalkable(cx, cy)) {
        const p = findPath(this.grid, u.cell, { cx, cy });
        if (p) {
          u.path = p.map((c) => cellCenter(c.cx, c.cy));
          u.orderedTarget = null;
          u.setGuard(cellCenter(cx, cy).x, cellCenter(cx, cy).y);
        }
      }
    }
  }

  /** 선택 일꾼 명령 — 클릭 칸이 크리스탈이면 채집, 통행 칸이면 이동. */
  commandWorkers(workers: Worker[], px: number, py: number): void {
    const { cx, cy } = pixelToCell(px, py);
    const crystal = this.crystals.find((c) => c.cx === cx && c.cy === cy && !c.depleted);
    for (const w of workers) {
      if (crystal) w.commandHarvest(crystal, this.grid);
      else if (this.grid.isWalkable(cx, cy)) w.commandMove(cx, cy, this.grid);
    }
  }

  // 클릭 지점 근처의 적(반대 진영) 구조물/유닛. 없으면 null.
  private hostileTargetAt(px: number, py: number, side: 'player' | 'enemy'): Combatant | null {
    const { cx, cy } = pixelToCell(px, py);
    const foeHQ = side === 'player' ? this.enemyHQ : this.playerHQ;
    if (foeHQ.occupies(cx, cy) && !foeHQ.dead) return foeHQ;
    for (const b of this.buildings) {
      if (b.side !== side && b.complete && !b.destroyed && b.cx === cx && b.cy === cy) return b;
    }
    let best: CombatUnit | null = null;
    let bestD = C.unit.radius * C.unit.radius * 4;
    for (const u of this.units) {
      if (u.dead || u.side === side) continue;
      const d = (u.x - px) ** 2 + (u.y - py) ** 2;
      if (d <= bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  private structureCell(c: Combatant): { cx: number; cy: number } {
    return pixelToCell(c.x, c.y);
  }

  // ── update(1 서브스텝) ───────────────────────────────────────
  update(dt: number): void {
    if (this.phase !== 'playing') return; // 승패 확정 후 정지.
    this.playerHQ.update(dt, () => this.spawnWorker());
    const ctx = this.workerContext();
    for (const w of this.workers) w.update(dt, ctx);
    this.enemyAI.update(dt);

    for (const b of this.buildings) if (b.isBarracks) maintainBarracks(dt, b, this.units);
    this.combat.update(dt, this.units, this.buildings, this.playerHQ, this.enemyHQ);
    this.effects.update(dt);

    this.handleDestruction();
    this.removeDeadUnits();
    this.checkEndState();
  }

  // 파괴된 건물 처리 — 벽 해제 + 부수효과(보급고 인구 감소) + 제거. 유닛은 home 참조를 유지.
  private handleDestruction(): void {
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i];
      if (b.complete && !b.destroyed && b.hp <= 0) {
        b.destroyed = true;
        this.grid.setState(b.cx, b.cy, 'empty');
        if (b.kind === 'depot' && b.side === 'player') this.depotsBuilt = Math.max(0, this.depotsBuilt - 1);
        this.effects.spawnKill(b.x, b.y, b.side === 'player' ? '#3a78d0' : '#c0433a');
        this.audio?.hit();
      }
      if (b.destroyed) this.buildings.splice(i, 1);
    }
  }

  private removeDeadUnits(): void {
    for (let i = this.units.length - 1; i >= 0; i--) if (this.units[i].dead) this.units.splice(i, 1);
  }

  private checkEndState(): void {
    if (this.playerHQ.hp <= 0) this.phase = 'lost';
    else if (this.enemyHQ.hp <= 0) this.phase = 'won';
  }
}

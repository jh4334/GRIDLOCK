// 정복 모드 월드(모델) — 그리드/크리스탈/본진/일꾼/건물과 자원·인구를 소유하고 시뮬레이션한다.
// 코디네이터(conquestGame)는 이 모델을 update/render 조율하고 입력을 명령으로 옮긴다.
// 수치는 전부 conquest.json에서 읽는다(코드에 매직넘버 금지). update(dt)에서만 상태 변경.

import conquestData from '../data/conquest.json';
import { cellCenter } from '../game/grid';
import { Barracks } from '../entities/unit';
import { ConquestGrid, walkableNeighbors } from './conquestMap';
import { Crystal } from './crystal';
import { HQ } from './hq';
import { Building, BuildKind } from './building';
import { Worker, WorkerContext } from './worker';

const C = conquestData;

export class ConquestWorld {
  readonly grid = new ConquestGrid();
  readonly crystals: Crystal[] = [];
  readonly workers: Worker[] = [];
  readonly buildings: Building[] = [];
  readonly playerHQ: HQ;
  readonly enemyHQ: HQ;

  crystal = C.startCrystal; // 보유 자원.
  private depotsBuilt = 0; // 완성된 보급고 수(인구 상한 계산용).

  constructor() {
    this.playerHQ = new HQ('player', C.hq.playerCell[0], C.hq.playerCell[1], C.hq.hp, C.hq.workerBuildTime, C.hq.queueMax);
    this.enemyHQ = new HQ('enemy', C.hq.enemyCell[0], C.hq.enemyCell[1], C.hq.hp, C.hq.workerBuildTime, C.hq.queueMax);
    this.grid.setState(this.playerHQ.cx, this.playerHQ.cy, 'wall');
    this.grid.setState(this.enemyHQ.cx, this.enemyHQ.cy, 'wall');

    const cells = [...C.crystal.playerCells, ...C.crystal.enemyCells, ...C.crystal.centerCells];
    for (const [cx, cy] of cells) {
      this.crystals.push(new Crystal(cx, cy, C.crystal.amount));
      this.grid.setState(cx, cy, 'crystal');
    }
  }

  // ── 인구 ─────────────────────────────────────────────────────
  get popMax(): number {
    return Math.min(C.population.cap, C.population.base + this.depotsBuilt * C.population.perDepot);
  }
  private get soldierCount(): number {
    let n = 0;
    for (const b of this.buildings) if (b.barracks) n += b.barracks.aliveCount;
    return n;
  }
  /** 사용 인구 — 일꾼 + 병사 + 생산 대기(예약). */
  get popUsed(): number {
    return (
      this.workers.length * C.population.perWorker +
      this.soldierCount * C.population.perSoldier +
      this.playerHQ.queueCount * C.population.perWorker
    );
  }

  // ── 일꾼 생산 ────────────────────────────────────────────────
  get canProduceWorker(): boolean {
    return (
      this.crystal >= C.hq.workerCost &&
      this.playerHQ.canQueue &&
      this.popUsed + C.population.perWorker <= this.popMax
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

  // ── 건설 ─────────────────────────────────────────────────────
  buildSpec(kind: BuildKind): { cost: number; buildTime: number } {
    return C.buildings[kind];
  }

  /** 건설 가능한 칸인가 — 통행 가능 빈 칸만(크리스탈·본진·건물·범위 밖 제외). */
  canBuildAt(cx: number, cy: number): boolean {
    return this.grid.isWalkable(cx, cy);
  }

  /**
   * 착공 — 비용 차감 후 건물을 세우고(벽) 가장 가까운 일꾼을 건설에 배정한다.
   * 조건 미충족(자원 부족/칸 불가/일꾼 없음)이면 false.
   */
  startBuild(kind: BuildKind, cx: number, cy: number): boolean {
    const spec = this.buildSpec(kind);
    if (this.crystal < spec.cost) return false;
    if (!this.canBuildAt(cx, cy)) return false;
    const worker = this.nearestWorker(cx, cy);
    if (!worker) return false; // 일꾼이 없으면 건설 불가.

    this.crystal -= spec.cost;
    const b = new Building(kind, cx, cy, spec.buildTime);
    this.buildings.push(b);
    this.grid.setState(cx, cy, 'wall'); // 건물도 벽(통행 차단).
    worker.commandBuild(b, this.grid);
    return true;
  }

  private nearestWorker(cx: number, cy: number): Worker | null {
    const target = cellCenter(cx, cy);
    let best: Worker | null = null;
    let bestD = Infinity;
    for (const w of this.workers) {
      if (w.dead) continue;
      const d = (w.x - target.x) ** 2 + (w.y - target.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    return best;
  }

  private onBuildComplete(b: Building): void {
    if (b.kind === 'barracks') {
      b.barracks = new Barracks(b.cx, b.cy, this.grid); // 병사 3기 유지(기존 Barracks 재사용).
    } else if (b.kind === 'depot') {
      this.depotsBuilt++;
    }
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

  // ── update(1 서브스텝) ───────────────────────────────────────
  update(dt: number): void {
    this.playerHQ.update(dt, () => this.spawnWorker());
    const ctx = this.workerContext();
    for (const w of this.workers) w.update(dt, ctx);
    // 배럭 병사 유지 + 집결지 배치. 적이 없어 교전은 없고(전투는 M12 후반부),
    // 기존 Soldier.returnToRally로 3기가 집결지 슬롯으로 흩어지게만 한다.
    for (const b of this.buildings) {
      if (!b.barracks) continue;
      b.barracks.maintain(dt);
      for (const s of b.barracks.soldiers) s.returnToRally(dt);
    }
  }
}

// 적 AI(T12.4) — 결정적(랜덤 없음) 고정 빌드오더 + 90초 주기 공격 웨이브.
//   경제: 적 HQ도 크리스탈 150 시작, 일꾼 2기로 자기 크리스탈 채집(플레이어와 동일 규칙·클래스).
//   빌드오더: conquest.json enemy.buildOrder 순서대로 — 일꾼 생산 / 고정 좌표(enemy.layout)에 건설.
//     적 일꾼이 실제로 이동·건설하고, 배럭은 완성 시 유닛 3기를 유지·리스폰(roster 공유).
//   웨이브: attackInterval초마다 대기 아닌 적 유닛 전원이 플레이어 HQ로 공격 이동(A*). waveDuration
//     후 생존 유닛은 방어 위치로 복귀. 남은 시간은 코디네이터가 HUD에 표시한다.
//
// 월드와는 좁은 EnemyDeps 계약으로만 접촉한다(공유 배열·그리드·완성 콜백). 상태 변경은 update에서만.

import conquestData from '../data/conquest.json';
import { cellCenter } from '../game/grid';
import { Worker } from './worker';
import type { WorkerContext } from './worker';
import { Building } from './building';
import type { BuildKind } from './building';
import { walkableNeighbors } from './conquestMap';
import type { ConquestGrid } from './conquestMap';
import type { Crystal } from './crystal';
import type { HQ } from './hq';
import type { CombatUnit } from './combatUnit';
import { pathToStructure } from './conquestCombat';

const C = conquestData;

export interface EnemyDeps {
  grid: ConquestGrid;
  crystals: Crystal[];
  enemyHQ: HQ;
  playerHQ: HQ;
  buildings: Building[]; // 공유 — 적 건물을 push한다.
  units: CombatUnit[]; // 공유 — 웨이브 때 적 유닛 부분집합을 명령한다.
  onBuildComplete(b: Building): void; // 배럭 완성 시 유닛 배치 등(월드 공유 로직).
  onWaveLaunch?(): void; // 공격 웨이브 출발 시(≥1기 출발) — 경보음 배선용.
}

export class EnemyAI {
  readonly workers: Worker[] = [];
  crystal = C.enemy.startCrystal;

  private stepIndex = 0;
  private readonly layoutIdx: Record<BuildKind, number> = { barracks: 0, turret: 0, depot: 0 };
  private waveTimer = C.enemy.attackInterval;
  private waveActive = false;
  private recallTimer = 0;

  constructor(private deps: EnemyDeps) {
    for (let i = 0; i < C.enemy.workerCount; i++) this.spawnWorker();
  }

  /** 다음 공격 웨이브까지 남은 초(HUD 표시용). */
  get secondsToAttack(): number {
    return Math.max(0, Math.ceil(this.waveTimer));
  }

  update(dt: number): void {
    this.deps.enemyHQ.update(dt, () => this.spawnWorker()); // 빌드오더가 예약한 일꾼 생산.
    const ctx = this.workerContext();
    for (const w of this.workers) w.update(dt, ctx);
    this.executeBuildOrder();
    this.tickWave(dt);
  }

  // ── 경제 ─────────────────────────────────────────────────────
  private workerContext(): WorkerContext {
    return {
      grid: this.deps.grid,
      crystals: this.deps.crystals,
      hq: this.deps.enemyHQ,
      onDeposit: (amount) => {
        this.crystal += amount;
      },
      onBuildComplete: (b) => this.deps.onBuildComplete(b),
    };
  }

  private spawnWorker(): void {
    const hq = this.deps.enemyHQ;
    const nb = walkableNeighbors(this.deps.grid, hq.cx, hq.cy)[0];
    const p = nb ? cellCenter(nb.cx, nb.cy) : hq.spawnPoint();
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

  // 빌드오더 한 스텝을 조건 충족 시 실행(자원·일꾼·칸). 미충족이면 대기(자원 축적).
  private executeBuildOrder(): void {
    const order = C.enemy.buildOrder as (BuildKind | 'worker')[];
    if (this.stepIndex >= order.length) return;
    const step = order[this.stepIndex];

    if (step === 'worker') {
      if (this.crystal >= C.hq.workerCost && this.deps.enemyHQ.canQueue) {
        this.crystal -= C.hq.workerCost;
        this.deps.enemyHQ.enqueue();
        this.stepIndex++;
      }
      return;
    }

    const kind = step;
    const layout = C.enemy.layout as Record<BuildKind, number[][]>;
    const coord = layout[kind]?.[this.layoutIdx[kind]];
    if (!coord) {
      this.stepIndex++; // 좌표 소진 — 스텝 건너뜀.
      return;
    }
    const spec = C.buildings[kind];
    if (this.crystal < spec.cost) return; // 자원 부족 — 대기.
    const [cx, cy] = coord;
    if (!this.deps.grid.isWalkable(cx, cy)) {
      this.layoutIdx[kind]++; // 칸이 막혔으면 다음 좌표로.
      return;
    }
    const worker = this.pickBuilder(cx, cy);
    if (!worker) return; // 건설할 일꾼 없음 — 대기.

    this.crystal -= spec.cost;
    const b = new Building('enemy', kind, cx, cy, spec.buildTime, spec.hp);
    this.deps.buildings.push(b);
    this.deps.grid.setState(cx, cy, 'wall');
    worker.commandBuild(b, this.deps.grid);
    this.layoutIdx[kind]++;
    this.stepIndex++;
  }

  // 건설 중이 아닌 가장 가까운 일꾼(채집을 잠시 멈추고 건설에 배정).
  private pickBuilder(cx: number, cy: number): Worker | null {
    const target = cellCenter(cx, cy);
    let best: Worker | null = null;
    let bestD = Infinity;
    for (const w of this.workers) {
      if (w.dead || w.state === 'toBuild' || w.state === 'building') continue;
      const d = (w.x - target.x) ** 2 + (w.y - target.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    return best;
  }

  // ── 웨이브 ───────────────────────────────────────────────────
  private tickWave(dt: number): void {
    this.waveTimer -= dt;
    if (this.waveTimer <= 0) {
      this.launchWave();
      this.waveTimer = C.enemy.attackInterval;
    }
    if (this.waveActive) {
      this.recallTimer -= dt;
      if (this.recallTimer <= 0) this.recall();
    }
  }

  // 대기 아닌(리스폰 대기 제외 = units에 존재하는) 적 유닛 전원을 플레이어 HQ로 공격 이동.
  private launchWave(): void {
    const hq = this.deps.playerHQ;
    let launched = 0;
    for (const u of this.deps.units) {
      if (u.side !== 'enemy' || u.dead) continue;
      const path = pathToStructure(this.deps.grid, u.cell, hq.cx, hq.cy);
      if (path) {
        u.path = path;
        u.orderedTarget = hq;
        launched++;
      }
    }
    this.waveActive = true;
    this.recallTimer = C.enemy.waveDuration;
    if (launched > 0) this.deps.onWaveLaunch?.(); // 실제 병력이 출발할 때만 경보.
  }

  // 웨이브 종료 — 생존 유닛은 명령을 놓고 집결지 방어로 복귀한다.
  private recall(): void {
    for (const u of this.deps.units) {
      if (u.side !== 'enemy' || u.dead) continue;
      u.path = [];
      u.orderedTarget = null;
    }
    this.waveActive = false;
  }
}

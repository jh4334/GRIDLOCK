// 웨이브 스포너 — 스폰 큐 진행, "대기 중/진행 중" 상태, 웨이브 완료 판정을 담당한다.
//
// 상태 흐름:
//   ready  ──(startNextWave)──▶ inProgress ──(스폰 완료 + 필드의 적 0)──▶ ready
//   웨이브 완료 시 onWaveClear(보너스) 지급, 마지막 웨이브(totalWaves)면 onVictory.
//
// 1~10웨이브는 waves.json에 수동 정의(조합의 재미), 11웨이브부터는 웨이브 번호만으로
// 결정적으로 절차 생성한다(랜덤 없음 → 재현 가능). HP 스케일은 웨이브당 hpScalePerWave 배.
//
// 밸런스 수치(조합/스케일/보너스)는 전부 data/*.json에서 읽는다(코드에 매직넘버 금지).

import wavesData from '../data/waves.json';
import economyData from '../data/economy.json';
import type { EnemyKind } from '../entities/enemy';

interface SpawnGroup {
  kind: EnemyKind;
  count: number;
  interval: number; // 그룹 내 기 사이 간격(초).
  delay: number; // 그룹 시작 지연(웨이브 시작 기준, 초).
}

// 웨이브 타임라인 상의 개별 스폰 이벤트(절대 시간 오름차순).
interface SpawnEvent {
  time: number;
  kind: EnemyKind;
}

export type WavePhase = 'ready' | 'inProgress';

export interface WaveCallbacks {
  // hpMultiplier = hpScalePerWave^(웨이브-1). 스폰 시점의 flowField는 game이 클로저로 주입.
  spawn: (kind: EnemyKind, hpMultiplier: number) => void;
  // 웨이브 완료 보너스 지급(골드 적용은 economy가 담당).
  onWaveClear: (waveNumber: number, bonus: number) => void;
  // 마지막 웨이브까지 완료 → 승리.
  onVictory: () => void;
}

const TOTAL_WAVES = wavesData.totalWaves;

export class WaveManager {
  private phase: WavePhase = 'ready';
  private waveNumber = 0; // 시작된(진행 중이거나 마지막으로 완료된) 웨이브. 0 = 아직 시작 전.

  private schedule: SpawnEvent[] = [];
  private nextIndex = 0; // 다음에 스폰할 schedule 인덱스.
  private elapsed = 0; // 현재 웨이브 진행 시간(초).

  constructor(private cb: WaveCallbacks) {}

  get current(): number {
    return this.waveNumber;
  }
  get total(): number {
    return TOTAL_WAVES;
  }
  get phaseName(): WavePhase {
    return this.phase;
  }
  /** 다음 웨이브 버튼 활성 조건: 대기 중 + 남은 웨이브 있음. */
  get canStart(): boolean {
    return this.phase === 'ready' && this.waveNumber < TOTAL_WAVES;
  }
  private get allSpawned(): boolean {
    return this.nextIndex >= this.schedule.length;
  }

  /** 다음 웨이브 시작. 시작하면 true. (진행 중이거나 마지막 웨이브 이후면 false.) */
  startNextWave(): boolean {
    if (!this.canStart) return false;
    this.waveNumber += 1;
    this.schedule = buildSchedule(groupsForWave(this.waveNumber));
    this.nextIndex = 0;
    this.elapsed = 0;
    this.phase = 'inProgress';
    return true;
  }

  /** 이번 웨이브의 HP 배율 = hpScalePerWave^(웨이브-1). */
  private get hpMultiplier(): number {
    return Math.pow(wavesData.hpScalePerWave, this.waveNumber - 1);
  }

  /**
   * 진행 중이면 타임라인을 전진시키며 예정된 적을 스폰하고, 스폰이 모두 끝났고
   * 필드의 적이 0이면 웨이브를 완료 처리한다. getAliveCount는 스폰 이후 시점의
   * 살아있는 적 수를 돌려줘야 한다(스폰이 이 프레임에 일어나므로 콜백으로 지연 평가).
   */
  update(dt: number, getAliveCount: () => number): void {
    if (this.phase !== 'inProgress') return;
    this.elapsed += dt;

    const mult = this.hpMultiplier;
    while (this.nextIndex < this.schedule.length && this.schedule[this.nextIndex].time <= this.elapsed) {
      this.cb.spawn(this.schedule[this.nextIndex].kind, mult);
      this.nextIndex += 1;
    }

    if (this.allSpawned && getAliveCount() === 0) this.completeWave();
  }

  /**
   * 치트(N키) — 현재 웨이브를 즉시 완료 처리. 대기 중이면 먼저 다음 웨이브를 시작한다.
   * 필드의 적 제거(보상 없이)는 game이 담당하고, 여기선 상태·보너스·승리만 처리한다.
   * 남은 웨이브가 없으면 아무 것도 하지 않고 false.
   */
  skip(): boolean {
    if (this.phase === 'ready' && !this.startNextWave()) return false;
    this.nextIndex = this.schedule.length; // 남은 스폰 큐 비움.
    this.completeWave();
    return true;
  }

  private completeWave(): void {
    const bonus = economyData.waveClearBase + economyData.waveClearPerWave * this.waveNumber;
    this.phase = 'ready';
    this.cb.onWaveClear(this.waveNumber, bonus);
    if (this.waveNumber >= TOTAL_WAVES) this.cb.onVictory();
  }

  /** 재시작 — 웨이브 진행 상태를 초기화한다. */
  reset(): void {
    this.phase = 'ready';
    this.waveNumber = 0;
    this.schedule = [];
    this.nextIndex = 0;
    this.elapsed = 0;
  }
}

// ── 스케줄/조합 생성 ───────────────────────────────────────────────

// 스폰 그룹 배열 → 절대 시간 오름차순의 개별 스폰 이벤트 목록.
function buildSchedule(groups: SpawnGroup[]): SpawnEvent[] {
  const events: SpawnEvent[] = [];
  for (const g of groups) {
    for (let i = 0; i < g.count; i++) {
      events.push({ time: g.delay + i * g.interval, kind: g.kind });
    }
  }
  events.sort((a, b) => a.time - b.time);
  return events;
}

// 웨이브 번호 → 스폰 그룹 배열. 1~10은 waves.json 수동 정의, 11~는 절차 생성.
function groupsForWave(n: number): SpawnGroup[] {
  const manual = wavesData.waves as unknown as SpawnGroup[][];
  if (n <= manual.length) return manual[n - 1];
  return proceduralWave(n);
}

// 11웨이브부터의 결정적 절차 생성(랜덤 없이 웨이브 번호로만 계산).
//   - grunt 기본 물량이 웨이브에 비례해 증가
//   - 홀수 웨이브엔 runner, 짝수 웨이브엔 swarm
//   - 3의 배수 웨이브엔 tanker
//   - 5의 배수 웨이브엔 boss(웨이브가 커질수록 마리수 증가)
// 그룹은 delay를 계단식으로 벌려 한꺼번에 겹치지 않게 한다.
function proceduralWave(n: number): SpawnGroup[] {
  const t = n - 10; // 11웨이브부터 1, 2, 3, ...
  const groups: SpawnGroup[] = [];

  groups.push({ kind: 'grunt', count: 6 + t * 2, interval: 0.7, delay: 0 });
  if (n % 2 === 1) groups.push({ kind: 'runner', count: 6 + t, interval: 0.45, delay: 1.5 });
  if (n % 2 === 0) groups.push({ kind: 'swarm', count: 12, interval: 0.22, delay: 1.5 });
  if (n % 3 === 0) groups.push({ kind: 'tanker', count: 2 + Math.floor(t / 2), interval: 1.1, delay: 3.0 });
  if (n % 5 === 0) groups.push({ kind: 'boss', count: Math.floor(n / 10), interval: 2.0, delay: 0 });

  return groups;
}

// 웨이브 스포너 — 여러 웨이브를 동시에(중첩) 진행시키는 다중 스폰 큐를 담당한다.
//
// 상태 흐름(중첩 웨이브, D2.4):
//   startNextWave 는 진행 중이라도 마지막 웨이브 전까지 언제나 호출 가능(중첩 시작).
//   각 웨이브는 자기만의 스폰 큐(ActiveWave: waveNumber·schedule·nextIndex·elapsed)를 갖고
//   update 는 진행 중인 모든 큐를 함께 전진시킨다.
//   완료 판정: "시작된 모든 웨이브의 스폰이 끝났고 필드의 적이 0"이면 진행 중 웨이브를 일괄
//   완료 처리(각 웨이브별 클리어 보너스 지급). 완료 배치에 마지막 웨이브(totalWaves)가 들면 승리.
//   조기 호출(필드에 적/미완료 스폰이 남은 상태에서 다음 웨이브 시작) 시 얼리콜 보너스 지급.
//
// 1~20웨이브(= totalWaves)는 waves.json에 전부 수동 정의(조합의 재미). 절차 생성은
// totalWaves를 넘어서는 경우에 대비한 결정적 폴백으로만 남겨 둔다(랜덤 없음 → 재현 가능).
// HP 스케일은 웨이브당 hpScalePerWave 배(동시 진행이어도 각 웨이브 고유 배율).
//
// 밸런스 수치(조합/스케일/보너스/얼리콜)는 전부 data/*.json에서 읽는다(코드에 매직넘버 금지).

import wavesData from '../data/waves.json';
import economyData from '../data/economy.json';
import type { EnemyKind } from '../entities/enemy';

interface SpawnGroup {
  kind: EnemyKind;
  count: number;
  interval: number; // 그룹 내 개체 사이 간격(초).
  delay: number; // 그룹 시작 지연(웨이브 시작 기준, 초).
}

// 웨이브 타임라인 상의 개별 스폰 이벤트(절대 시간 오름차순).
interface SpawnEvent {
  time: number;
  kind: EnemyKind;
}

// 진행 중인 한 웨이브의 독립 스폰 큐. 여러 개가 동시에 존재할 수 있다(중첩).
interface ActiveWave {
  waveNumber: number;
  schedule: SpawnEvent[];
  nextIndex: number; // 다음에 스폰할 schedule 인덱스.
  elapsed: number; // 이 웨이브의 진행 시간(초).
}

// 다음 웨이브 프리뷰용 — 적 종류별 마리수 합산 항목.
export interface WaveComposition {
  kind: EnemyKind;
  count: number;
}

export interface WaveCallbacks {
  // hpMultiplier = hpScalePerWave^(웨이브-1). 스폰 시점의 flowField는 game이 클로저로 주입.
  spawn: (kind: EnemyKind, hpMultiplier: number) => void;
  // 웨이브 완료 보너스 지급(골드 적용은 economy가 담당).
  onWaveClear: (waveNumber: number, bonus: number) => void;
  // 조기 호출(얼리콜) 보너스 지급 — bonus>0 일 때만 호출. game이 골드/사운드로 피드백.
  onEarlyCall?: (bonus: number) => void;
  // 마지막 웨이브까지 완료 → 승리.
  onVictory: () => void;
  // 다음 웨이브가 바뀌는 시점(시작/완료/리셋)에만 호출 — 프리뷰 갱신용(매 프레임 아님).
  onWaveChange?: () => void;
}

const TOTAL_WAVES = wavesData.totalWaves;

export class WaveManager {
  private active: ActiveWave[] = []; // 진행 중(아직 완료 처리 전) 웨이브들의 독립 큐.
  private startedCount = 0; // 지금까지 시작된 최고 웨이브 번호(순차 시작이라 곧 마지막 시작 웨이브). 0 = 시작 전.
  private endless = false; // 엔드리스 모드(D4.3) — totalWaves 이후 무한 진행. 승리 판정 없이 패배만.

  constructor(private cb: WaveCallbacks) {}

  /** HUD·최고기록 표시 기준 = 마지막으로 시작한 웨이브. */
  get current(): number {
    return this.startedCount;
  }
  get total(): number {
    return TOTAL_WAVES;
  }
  /** 엔드리스 모드 여부(HUD 표기·최고 웨이브 기록 판단용). */
  get isEndless(): boolean {
    return this.endless;
  }
  /** 진행 중인 웨이브가 하나라도 있는가(다음 웨이브 버튼의 진행 표시용). */
  get inProgress(): boolean {
    return this.active.length > 0;
  }
  /** 다음 웨이브 버튼 활성 조건: 남은 웨이브가 있으면 진행 중이라도 활성(중첩 허용). 엔드리스는 항상 활성. */
  get canStart(): boolean {
    return this.endless || this.startedCount < TOTAL_WAVES;
  }

  /** 엔드리스 모드 진입(D4.3) — 20웨이브 승리 후 "엔드리스 계속" 시. 이후 승리 재판정 없음. */
  enterEndless(): void {
    this.endless = true;
  }

  /**
   * 다음 웨이브(startedCount+1) 구성을 종류별로 합산해 돌려준다. 프리뷰 표시용.
   * 스폰 스케줄과 같은 groupsForWave를 사용하므로 실제 스폰 구성과 일치가 보장된다.
   * 남은 웨이브가 없으면 빈 배열(프리뷰 숨김).
   */
  nextWaveComposition(): WaveComposition[] {
    const next = this.startedCount + 1;
    if (next > TOTAL_WAVES && !this.endless) return []; // 엔드리스에선 절차 생성 구성을 프리뷰로 노출.
    const totals = new Map<EnemyKind, number>();
    for (const g of groupsForWave(next)) totals.set(g.kind, (totals.get(g.kind) ?? 0) + g.count);
    return [...totals].map(([kind, count]) => ({ kind, count }));
  }

  /**
   * 다음 웨이브를 시작한다(중첩 가능). 진행 중인 웨이브/필드의 적이 남은 상태에서 부르면
   * 조기 호출로 보고 얼리콜 보너스를 지급한다. getAliveCount는 현재 필드의 적 수(보너스 근사용).
   * 시작하면 true. (남은 웨이브가 없으면 false.)
   */
  startNextWave(getAliveCount: () => number = () => 0): boolean {
    if (!this.canStart) return false;
    const bonus = this.earlyCallBonus(getAliveCount()); // 새 웨이브 추가 전(진행 중 큐 기준)으로 계산.
    this.startedCount += 1;
    this.active.push({
      waveNumber: this.startedCount,
      schedule: buildSchedule(groupsForWave(this.startedCount)),
      nextIndex: 0,
      elapsed: 0,
    });
    if (bonus > 0) this.cb.onEarlyCall?.(bonus);
    this.cb.onWaveChange?.();
    return true;
  }

  // 얼리콜 보너스(골드) = min(maxBonus, floor(남은초 × goldPerRemainingSecond)).
  // 남은초 = 진행 중 웨이브들의 남은 스폰 시간(마지막 이벤트 time - elapsed, 0 하한) 최댓값,
  // 필드에 적이 남아 있으면 최소 1초로 근사(단순 근사 — 수치는 전부 JSON).
  private earlyCallBonus(aliveCount: number): number {
    const cfg = wavesData.earlyCall;
    let remain = 0;
    for (const w of this.active) {
      if (w.schedule.length === 0) continue;
      const last = w.schedule[w.schedule.length - 1].time;
      remain = Math.max(remain, Math.max(0, last - w.elapsed));
    }
    if (aliveCount > 0) remain = Math.max(remain, 1);
    return Math.min(cfg.maxBonus, Math.floor(remain * cfg.goldPerRemainingSecond));
  }

  /**
   * 진행 중인 모든 웨이브 큐를 전진시키며 예정된 적을 스폰하고, 시작된 모든 웨이브의 스폰이
   * 끝났고 필드의 적이 0이면 진행 중 웨이브를 일괄 완료 처리한다. getAliveCount는 스폰 이후의
   * 살아있는 적 수를 돌려줘야 한다(스폰이 이 프레임에 일어나므로 콜백으로 지연 평가).
   */
  update(dt: number, getAliveCount: () => number): void {
    if (this.active.length === 0) return;

    for (const w of this.active) {
      w.elapsed += dt;
      const mult = hpMultiplier(w.waveNumber);
      while (w.nextIndex < w.schedule.length && w.schedule[w.nextIndex].time <= w.elapsed) {
        this.cb.spawn(w.schedule[w.nextIndex].kind, mult);
        w.nextIndex += 1;
      }
    }

    const allSpawned = this.active.every((w) => w.nextIndex >= w.schedule.length);
    if (allSpawned && getAliveCount() === 0) this.completeAll();
  }

  /**
   * 치트(N키) — 진행 중 웨이브를 즉시 완료 처리. 진행 중 웨이브가 없으면 먼저 다음 웨이브를
   * 시작한다(연타로 20웨이브 승리까지 도달 가능). 필드의 적 제거(보상 없이)는 game이 담당하고,
   * 여기선 상태·보너스·승리만 처리한다. 남은 웨이브가 없으면 아무 것도 하지 않고 false.
   */
  skip(): boolean {
    if (this.active.length === 0 && !this.startNextWave()) return false;
    for (const w of this.active) w.nextIndex = w.schedule.length; // 남은 스폰 큐 비움.
    this.completeAll();
    return true;
  }

  // 진행 중인 모든 웨이브를 일괄 완료 처리 — 웨이브별 클리어 보너스 지급, 마지막 웨이브 포함 시 승리.
  // 엔드리스 구간(웨이브 > totalWaves) 보상은 rewardScale로 감쇠하고, 엔드리스에선 승리 재판정 없음.
  private completeAll(): void {
    let maxWave = 0;
    for (const w of this.active) {
      let bonus = economyData.waveClearBase + economyData.waveClearPerWave * w.waveNumber;
      if (w.waveNumber > TOTAL_WAVES) bonus = Math.floor(bonus * wavesData.endless.rewardScale);
      this.cb.onWaveClear(w.waveNumber, bonus);
      maxWave = Math.max(maxWave, w.waveNumber);
    }
    this.active = [];
    this.cb.onWaveChange?.();
    if (!this.endless && maxWave >= TOTAL_WAVES) this.cb.onVictory();
  }

  /** 재시작 — 웨이브 진행 상태를 초기화한다(엔드리스 모드도 해제). */
  reset(): void {
    this.active = [];
    this.startedCount = 0;
    this.endless = false;
    this.cb.onWaveChange?.();
  }
}

// 웨이브 번호 → HP 배율. 기본은 hpScalePerWave^(n-1). 엔드리스 구간(n>totalWaves)은
// 웨이브당 endless.hpScaleAccel을 누진해 곱한다(가속 — 후반부일수록 더 가파르게).
function hpMultiplier(n: number): number {
  let mult = Math.pow(wavesData.hpScalePerWave, n - 1);
  if (n > TOTAL_WAVES) mult *= Math.pow(wavesData.endless.hpScaleAccel, n - TOTAL_WAVES);
  return mult;
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

// 웨이브 번호 → 스폰 그룹 배열. 정의된 만큼(현재 1~20)은 waves.json 수동 정의,
// 그 범위를 넘어서면 절차 생성으로 폴백한다(totalWaves=20이라 평소엔 도달하지 않음).
function groupsForWave(n: number): SpawnGroup[] {
  const manual = wavesData.waves as unknown as SpawnGroup[][];
  if (n <= manual.length) return manual[n - 1];
  return proceduralWave(n);
}

// 폴백 절차 생성 — 수동 정의(waves.json)를 넘는 웨이브용. 결정적(랜덤 없이 웨이브 번호로만 계산).
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

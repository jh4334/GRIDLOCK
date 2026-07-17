// 사운드 엔진(M6 주스 패스) — 외부 오디오 파일/라이브러리 없이 Web Audio API로 직접 합성.
// OscillatorNode + GainNode 엔벨로프(짧은 어택·지수 디케이)로 순간 효과음을 만든다.
//
// 브라우저 자동재생 정책상 AudioContext는 첫 사용자 입력(pointerdown/keydown)에서 생성·재개한다.
// 마스터 게인은 낮게(0.15) 두고 M키로 음소거 토글. 발사음은 프레임당 최대 N회로 스로틀한다.
// 주파수·길이·게인은 밸런스가 아니라 청각 상수이므로 코드 상수로 둔다.
//
// D2.6: 사용자 음량(0~1)을 마스터 게인에 곱한다 — 실제 게인 = 음소거? 0 : MASTER_GAIN × volume.
// 절대 게인이 MASTER_GAIN(0.15)을 넘지 않는다. 볼륨/음소거 변경은 subscribe 리스너로 알린다
// (저장·슬라이더 동기화는 상위가 담당). 초기 상태는 생성 시 주입(localStorage 복원값).

const MASTER_GAIN = 0.15; // 전체 볼륨 상한(낮게) — volume 1.0일 때의 절대 게인.
const MAX_FIRES_PER_FRAME = 2; // 스웜+다수 타워 시 발사음 소음 방지.
const MAX_HITS_PER_FRAME = 3; // 캐논 스플래시 다중 명중음 억제.
const COMBO_WINDOW = 2.0; // 연속 처치 콤보 유지 시간(초).
const COMBO_MAX_STEP = 8; // 피치 상승 상한 단계.
const SEMITONE = Math.pow(2, 1 / 12);

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

// 타워 종류별 발사음 기본 주파수(Hz) — 종류마다 살짝 다른 음색.
const FIRE_FREQ: Record<string, number> = {
  arrow: 680,
  cannon: 190,
  frost: 900,
};

interface ToneOpts {
  freq: number;
  freqEnd?: number; // 지정 시 duration 동안 주파수 스윕.
  type?: OscillatorType;
  duration: number; // 초.
  gain: number; // 피크 게인(마스터 게인에 곱해짐).
  delay?: number; // 시작 지연(초) — 아르페지오용.
}

/** 볼륨·음소거 초기 상태(localStorage 복원값). volume은 0~1. */
export interface AudioInit {
  volume?: number;
  muted?: boolean;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private vol = 1; // 사용자 음량 0~1(슬라이더 0~100의 정규화).
  private readonly listeners: Array<() => void> = []; // 볼륨/음소거 변경 구독자(슬라이더·저장).

  private firesThisFrame = 0;
  private hitsThisFrame = 0;

  private comboStep = 0; // 현재 콤보 단계(피치 상승량).
  private lastKillAt = -Infinity; // 마지막 처치 시각(ctx.currentTime 기준).

  constructor(init?: AudioInit) {
    if (init) {
      if (typeof init.volume === 'number') this.vol = clamp01(init.volume);
      if (typeof init.muted === 'boolean') this.muted = init.muted;
    }
    // 첫 사용자 입력에서 컨텍스트 생성/재개(자동재생 정책). resume이 성공하면 리스너 해제.
    const resume = (): void => {
      this.ensureContext();
      if (this.ctx && this.ctx.state === 'running') {
        window.removeEventListener('pointerdown', resume);
        window.removeEventListener('keydown', resume);
      }
    };
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
  }

  private ensureContext(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return; // Web Audio 미지원 환경 — 무음으로 동작.
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.effectiveGain();
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** 프레임당 1회 호출 — 스로틀 카운터를 리셋한다. */
  resetFrame(): void {
    this.firesThisFrame = 0;
    this.hitsThisFrame = 0;
  }

  // ── 볼륨 / 음소거 ──────────────────────────────────────────────
  /** 현재 음량(0~1). */
  get volume(): number {
    return this.vol;
  }
  /** 음소거 여부. */
  get isMuted(): boolean {
    return this.muted;
  }

  /** 음량 설정(0~1로 클램프) — 마스터 게인 = MASTER_GAIN × volume. */
  setVolume(v: number): void {
    this.vol = clamp01(v);
    this.applyGain();
    this.notify();
  }

  /** M키/버튼 음소거 토글. */
  toggleMute(): void {
    this.muted = !this.muted;
    this.applyGain();
    this.notify();
  }

  /** 볼륨/음소거 변경 구독(슬라이더 반영·저장용). */
  subscribe(fn: () => void): void {
    this.listeners.push(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  private effectiveGain(): number {
    return this.muted ? 0 : MASTER_GAIN * this.vol;
  }

  private applyGain(): void {
    if (this.master) this.master.gain.value = this.effectiveGain();
  }

  // ── 효과음 ─────────────────────────────────────────────────────
  /** 발사음 — 타워 종류별로 살짝 다른 짧은 틱. 프레임당 최대 MAX_FIRES회로 스로틀. */
  fire(kind: string): void {
    if (this.firesThisFrame >= MAX_FIRES_PER_FRAME) return;
    this.firesThisFrame++;
    const freq = FIRE_FREQ[kind] ?? 520;
    this.tone({ freq, freqEnd: freq * 0.6, type: 'square', duration: 0.06, gain: 0.28 });
  }

  /** 명중음 — 낮은 "톡". 다중 명중(스플래시)은 프레임당 MAX_HITS회로 스로틀. */
  hit(): void {
    if (this.hitsThisFrame >= MAX_HITS_PER_FRAME) return;
    this.hitsThisFrame++;
    this.tone({ freq: 210, freqEnd: 120, type: 'sine', duration: 0.07, gain: 0.3 });
  }

  /** 캐논 폭발음 — 낮은 붐(화면흔들림과 함께). */
  boom(): void {
    this.tone({ freq: 140, freqEnd: 60, type: 'triangle', duration: 0.22, gain: 0.5 });
  }

  /** 처치음 — 연속 처치(2초 내)가 이어질수록 피치가 단계적으로 상승. */
  kill(): void {
    const now = this.ctx ? this.ctx.currentTime : 0;
    if (now - this.lastKillAt <= COMBO_WINDOW) {
      this.comboStep = Math.min(this.comboStep + 1, COMBO_MAX_STEP);
    } else {
      this.comboStep = 0;
    }
    this.lastKillAt = now;
    // 콤보 단계마다 2반음씩 상승.
    const freq = 440 * Math.pow(SEMITONE, this.comboStep * 2);
    this.tone({ freq, freqEnd: freq * 1.6, type: 'triangle', duration: 0.12, gain: 0.42 });
  }

  /** 웨이브 클리어 팡파레 — 3음 아르페지오(C-E-G). */
  waveClear(): void {
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((f, i) => this.tone({ freq: f, type: 'triangle', duration: 0.18, gain: 0.45, delay: i * 0.12 }));
  }

  /** 승리음 — 상승 아르페지오. */
  win(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.tone({ freq: f, type: 'triangle', duration: 0.2, gain: 0.5, delay: i * 0.14 }));
  }

  /** 패배음 — 하강하는 낮은 톤. */
  lose(): void {
    this.tone({ freq: 320, freqEnd: 90, type: 'sawtooth', duration: 0.6, gain: 0.4 });
  }

  // ── 정복 모드 효과음(D2.6) ─────────────────────────────────────
  /** 건설 완료음 — 짧은 2음 상승 블립(웨이브 클리어보다 가볍게). */
  buildDone(): void {
    this.tone({ freq: 587.33, type: 'triangle', duration: 0.1, gain: 0.34 });
    this.tone({ freq: 880, type: 'triangle', duration: 0.12, gain: 0.34, delay: 0.08 });
  }

  /** 아군 유닛 사망음 — 처치음(kill)보다 낮고 둔탁한 하강 톤. */
  unitDown(): void {
    this.tone({ freq: 300, freqEnd: 90, type: 'sawtooth', duration: 0.2, gain: 0.32 });
  }

  /** 적 공격 웨이브 출발 경보 — 2음 하강 경보음. */
  alarm(): void {
    this.tone({ freq: 660, freqEnd: 620, type: 'square', duration: 0.16, gain: 0.34 });
    this.tone({ freq: 495, freqEnd: 460, type: 'square', duration: 0.2, gain: 0.34, delay: 0.18 });
  }

  // 단일 톤 합성 — 어택(5ms) 후 duration 동안 지수 디케이. 음소거/무컨텍스트면 무시.
  private tone(o: ToneOpts): void {
    if (this.muted) return;
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || ctx.state !== 'running') return;

    const start = ctx.currentTime + (o.delay ?? 0);
    const end = start + o.duration;

    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, start);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), end);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(o.gain, start + 0.005); // 어택.
    g.gain.exponentialRampToValueAtTime(0.0001, end); // 디케이(지수, 0은 불가).

    osc.connect(g).connect(master);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}

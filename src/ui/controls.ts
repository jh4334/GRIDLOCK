// 캔버스 위 컨트롤 바(HTML) — 다음 웨이브 버튼 / 웨이브 프리뷰 / 배속 버튼(x1·x2·x3) / 다시 시작.
// 캔버스 밖 UI는 DOM으로 처리한다(DESIGN.md). 상태는 Game이 소유하고, 이 바는
// 클릭을 콜백으로 알리고 표시(활성/하이라이트/노출)만 갱신한다.

import { WavePreview } from './wavePreview';
import { AudioControls } from './audioControls';
import type { WaveComposition } from '../game/waves';
import type { AudioEngine } from '../core/audio';

export interface ControlsConfig {
  speeds: number[]; // 예: [1, 2, 3]
  onSetSpeed: (speed: number) => void;
  onToTitle: () => void; // 승/패 후(또는 정복 모드에서) 타이틀 화면으로 복귀.
  onNextWave?: () => void; // 디펜스 전용 — 정복 모드에선 버튼을 만들지 않는다.
  onRestart?: () => void; // 디펜스 전용.
  onEndless?: () => void; // 디펜스 전용 — 20웨이브 승리 오버레이의 "엔드리스 계속"(D4.3).
  rootId?: string; // 컨트롤 바 컨테이너 id(기본 'controls'). 정복은 별도 컨테이너 사용.
  showNextWave?: boolean; // 다음 웨이브 버튼 생성 여부(기본 true).
  audio?: AudioEngine; // 있으면 바 우측에 음량 슬라이더 + 음소거 토글을 부착(D2.6).
}

export class Controls {
  private readonly root: HTMLElement;
  private readonly nextBtn: HTMLButtonElement | null = null;
  private readonly wavePreview: WavePreview | null = null;
  private readonly speedBtns = new Map<number, HTMLButtonElement>();
  private readonly endlessBtn: HTMLButtonElement;
  private readonly restartBtn: HTMLButtonElement;
  private readonly toTitleBtn: HTMLButtonElement;

  constructor(config: ControlsConfig) {
    const rootId = config.rootId ?? 'controls';
    const root = document.getElementById(rootId);
    if (!root) throw new Error(`#${rootId} 컨테이너를 찾을 수 없습니다.`);
    this.root = root;

    if (config.showNextWave !== false) {
      const nextBtn = document.createElement('button');
      nextBtn.className = 'next-wave-btn';
      nextBtn.textContent = '다음 웨이브';
      nextBtn.addEventListener('click', () => config.onNextWave?.());
      root.appendChild(nextBtn);
      this.nextBtn = nextBtn;

      // 다음 웨이브 버튼 옆에 다음 웨이브 구성(아이콘×수) 프리뷰를 붙인다.
      this.wavePreview = new WavePreview();
      root.appendChild(this.wavePreview.el);
    }

    const speedGroup = document.createElement('div');
    speedGroup.className = 'speed-group';
    for (const s of config.speeds) {
      const btn = document.createElement('button');
      btn.className = 'speed-btn';
      btn.textContent = `x${s}`;
      btn.addEventListener('click', () => config.onSetSpeed(s));
      speedGroup.appendChild(btn);
      this.speedBtns.set(s, btn);
    }
    root.appendChild(speedGroup);

    // 엔드리스 계속(D4.3) — 승리 오버레이에서만 노출(20웨이브 승리 시). 클릭 시 월드 유지·21웨이브 진행.
    this.endlessBtn = document.createElement('button');
    this.endlessBtn.className = 'endless-btn';
    this.endlessBtn.textContent = '엔드리스 계속';
    this.endlessBtn.addEventListener('click', () => config.onEndless?.());
    this.endlessBtn.style.display = 'none';
    root.appendChild(this.endlessBtn);

    this.restartBtn = document.createElement('button');
    this.restartBtn.className = 'restart-btn';
    this.restartBtn.textContent = '다시 시작';
    this.restartBtn.addEventListener('click', () => config.onRestart?.());
    this.restartBtn.style.display = 'none';
    root.appendChild(this.restartBtn);

    this.toTitleBtn = document.createElement('button');
    this.toTitleBtn.className = 'to-title-btn';
    this.toTitleBtn.textContent = '타이틀로';
    this.toTitleBtn.addEventListener('click', () => config.onToTitle());
    this.toTitleBtn.style.display = 'none';
    root.appendChild(this.toTitleBtn);

    // 음량/음소거 위젯(D2.6) — 엔진 상태를 스스로 반영·조작한다(엔진 subscribe로 동기화).
    if (config.audio) new AudioControls(root, config.audio);
  }

  /** 다음 웨이브 버튼 활성/비활성(대기 중에만 활성). 정복 모드엔 버튼이 없어 무시. */
  setNextWaveEnabled(enabled: boolean): void {
    if (this.nextBtn) this.nextBtn.disabled = !enabled;
  }

  /** 다음 웨이브 구성 프리뷰 갱신(시작/완료/리셋 시점에만 호출). 정복 모드엔 프리뷰가 없어 무시. */
  setWavePreview(comp: WaveComposition[]): void {
    this.wavePreview?.set(comp);
  }

  /** 진행 중 웨이브 유무를 버튼 data 속성에 반영(중첩 웨이브 상태 관찰용 — E2E/디버그). */
  setWaveInProgress(inProgress: boolean): void {
    if (this.nextBtn) this.nextBtn.dataset.inprogress = String(inProgress);
  }

  /** 현재 배속 버튼만 하이라이트. */
  setActiveSpeed(speed: number): void {
    for (const [s, btn] of this.speedBtns) btn.classList.toggle('active', s === speed);
  }

  /** 승리/패배 시 다시 시작 + 타이틀로 버튼 노출(디펜스). 숨길 땐 엔드리스 버튼도 함께 숨긴다. */
  showRestart(show: boolean): void {
    this.restartBtn.style.display = show ? '' : 'none';
    this.toTitleBtn.style.display = show ? '' : 'none';
    if (!show) this.endlessBtn.style.display = 'none';
  }

  /** "엔드리스 계속" 버튼 노출 — 20웨이브 승리(won) 오버레이에서만 true(D4.3). */
  setEndlessVisible(show: boolean): void {
    this.endlessBtn.style.display = show ? '' : 'none';
  }

  /** 타이틀로 버튼만 표시 — 정복 모드는 다시 시작 없이 항상 노출한다. */
  setToTitleVisible(show: boolean): void {
    this.toTitleBtn.style.display = show ? '' : 'none';
  }

  /** 컨트롤 바 전체 표시/숨김 — menu 상태에선 숨긴다. */
  setBarVisible(show: boolean): void {
    this.root.style.display = show ? '' : 'none';
  }
}

// 캔버스 위 컨트롤 바(HTML) — 다음 웨이브 버튼 / 배속 버튼(x1·x2·x3) / 다시 시작 버튼.
// 캔버스 밖 UI는 DOM으로 처리한다(DESIGN.md). 상태는 Game이 소유하고, 이 바는
// 클릭을 콜백으로 알리고 표시(활성/하이라이트/노출)만 갱신한다.

export interface ControlsConfig {
  speeds: number[]; // 예: [1, 2, 3]
  onNextWave: () => void;
  onSetSpeed: (speed: number) => void;
  onRestart: () => void;
  onToTitle: () => void; // 승/패 후 타이틀 화면으로 복귀.
}

export class Controls {
  private readonly root: HTMLElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly speedBtns = new Map<number, HTMLButtonElement>();
  private readonly restartBtn: HTMLButtonElement;
  private readonly toTitleBtn: HTMLButtonElement;

  constructor(config: ControlsConfig) {
    const root = document.getElementById('controls');
    if (!root) throw new Error('#controls 컨테이너를 찾을 수 없습니다.');
    this.root = root;

    this.nextBtn = document.createElement('button');
    this.nextBtn.className = 'next-wave-btn';
    this.nextBtn.textContent = '다음 웨이브';
    this.nextBtn.addEventListener('click', () => config.onNextWave());
    root.appendChild(this.nextBtn);

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

    this.restartBtn = document.createElement('button');
    this.restartBtn.className = 'restart-btn';
    this.restartBtn.textContent = '다시 시작';
    this.restartBtn.addEventListener('click', () => config.onRestart());
    this.restartBtn.style.display = 'none';
    root.appendChild(this.restartBtn);

    this.toTitleBtn = document.createElement('button');
    this.toTitleBtn.className = 'to-title-btn';
    this.toTitleBtn.textContent = '타이틀로';
    this.toTitleBtn.addEventListener('click', () => config.onToTitle());
    this.toTitleBtn.style.display = 'none';
    root.appendChild(this.toTitleBtn);
  }

  /** 다음 웨이브 버튼 활성/비활성(대기 중에만 활성). */
  setNextWaveEnabled(enabled: boolean): void {
    this.nextBtn.disabled = !enabled;
  }

  /** 현재 배속 버튼만 하이라이트. */
  setActiveSpeed(speed: number): void {
    for (const [s, btn] of this.speedBtns) btn.classList.toggle('active', s === speed);
  }

  /** 승리/패배 시 다시 시작 + 타이틀로 버튼 노출. */
  showRestart(show: boolean): void {
    this.restartBtn.style.display = show ? '' : 'none';
    this.toTitleBtn.style.display = show ? '' : 'none';
  }

  /** 컨트롤 바 전체 표시/숨김 — menu 상태에선 숨긴다. */
  setBarVisible(show: boolean): void {
    this.root.style.display = show ? '' : 'none';
  }
}

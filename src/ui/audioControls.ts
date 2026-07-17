// 음량 슬라이더 + 음소거 토글 위젯(D2.6) — 컨트롤 바에 부착한다. 캔버스 밖 UI는 DOM으로 처리(DESIGN.md).
// 슬라이더(0~100)는 엔진 음량(0~1)으로 환산해 전달하고, 엔진 변경(슬라이더·버튼·M키)은
// subscribe로 되받아 DOM을 갱신한다 — 여러 바의 위젯이 같은 엔진 상태로 항상 동기화된다.

import type { AudioEngine } from '../core/audio';

export class AudioControls {
  private readonly slider: HTMLInputElement;
  private readonly muteBtn: HTMLButtonElement;

  constructor(root: HTMLElement, private readonly engine: AudioEngine) {
    const wrap = document.createElement('div');
    wrap.className = 'audio-controls';

    this.muteBtn = document.createElement('button');
    this.muteBtn.className = 'mute-btn';
    this.muteBtn.type = 'button';
    this.muteBtn.title = '음소거 토글 (M)';
    this.muteBtn.addEventListener('click', () => engine.toggleMute());

    this.slider = document.createElement('input');
    this.slider.type = 'range';
    this.slider.className = 'volume-slider';
    this.slider.min = '0';
    this.slider.max = '100';
    this.slider.step = '1';
    this.slider.title = '음량';
    this.slider.addEventListener('input', () => engine.setVolume(Number(this.slider.value) / 100));

    wrap.appendChild(this.muteBtn);
    wrap.appendChild(this.slider);
    root.appendChild(wrap);

    engine.subscribe(() => this.sync());
    this.sync();
  }

  // 엔진 상태 → DOM 반영(슬라이더 값·음소거 표시). 입력 이벤트를 유발하지 않는 단방향 갱신.
  private sync(): void {
    this.slider.value = String(Math.round(this.engine.volume * 100));
    const muted = this.engine.isMuted;
    this.muteBtn.textContent = muted ? 'MUTE' : 'SOUND';
    this.muteBtn.classList.toggle('muted', muted);
    this.muteBtn.dataset.muted = String(muted);
  }
}

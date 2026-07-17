// requestAnimationFrame 기반 게임 루프.
// dt는 초 단위이며 탭 비활성화 등으로 프레임이 크게 밀려도 상한(50ms)으로 잘라
// 물리/이동이 한 번에 튀는 것을 방지한다.

const MAX_DT_MS = 50;

export interface LoopCallbacks {
  update: (dt: number) => void;
  render: () => void;
}

export class GameLoop {
  private lastTime = 0;
  private rafId = 0;
  private running = false;

  constructor(private callbacks: LoopCallbacks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    const rawDtMs = now - this.lastTime;
    this.lastTime = now;
    const dt = Math.min(rawDtMs, MAX_DT_MS) / 1000;

    this.callbacks.update(dt);
    this.callbacks.render();

    this.rafId = requestAnimationFrame(this.frame);
  };
}

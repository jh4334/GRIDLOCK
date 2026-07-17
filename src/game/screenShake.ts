// 화면흔들림(M6 주스 패스) — 캐논 폭발 시 캔버스 전체를 짧게 흔든다.
// update(dt)가 타이머·오프셋을 계산하고, render는 offsetX/offsetY를 ctx.translate로 적용만 한다
// (CLAUDE.md의 update/render 분리 규칙). 실시간 dt 기준 1회/프레임 갱신 — 배속과 무관하게
// 짧게 흔들리고 멎는다. 지속·진폭은 밸런스가 아니라 시각 상수.

const SHAKE_DURATION = 0.2; // 흔들림 지속(초).
const SHAKE_AMPLITUDE = 4; // 최대 진폭(px). 남은 시간에 비례해 감쇠.

export class ScreenShake {
  private timer = 0;
  private offX = 0;
  private offY = 0;

  /** 흔들림 시작 — 타이머만 세팅(오프셋은 update가 계산). */
  trigger(): void {
    this.timer = SHAKE_DURATION;
  }

  // 감쇠 — 남은 비율에 비례한 진폭으로 매 프레임 오프셋을 무작위 갱신. 만료 시 0.
  update(dt: number): void {
    if (this.timer <= 0) {
      this.offX = 0;
      this.offY = 0;
      return;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0;
      this.offX = 0;
      this.offY = 0;
      return;
    }
    const amp = SHAKE_AMPLITUDE * (this.timer / SHAKE_DURATION);
    this.offX = (Math.random() * 2 - 1) * amp;
    this.offY = (Math.random() * 2 - 1) * amp;
  }

  /** 재시작 — 흔들림 상태 초기화. */
  reset(): void {
    this.timer = 0;
    this.offX = 0;
    this.offY = 0;
  }

  get x(): number {
    return this.offX;
  }
  get y(): number {
    return this.offY;
  }
  /** 현재 흔들림 오프셋이 있는가(render translate 여부 판단). */
  get active(): boolean {
    return this.offX !== 0 || this.offY !== 0;
  }
}

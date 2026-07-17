// FPS 측정기 — 0.5초마다 평균 FPS를 갱신해 표시 값이 너무 빨리 흔들리지 않게 한다.

const SAMPLE_INTERVAL = 0.5;

export class FpsCounter {
  private frames = 0;
  private elapsed = 0;
  private fps = 0;

  update(dt: number): void {
    this.frames += 1;
    this.elapsed += dt;
    if (this.elapsed >= SAMPLE_INTERVAL) {
      this.fps = this.frames / this.elapsed;
      this.frames = 0;
      this.elapsed = 0;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.font = '14px monospace';
    ctx.fillStyle = '#7fff7f';
    ctx.textBaseline = 'top';
    ctx.fillText(`FPS: ${this.fps.toFixed(0)}`, 8, 8);
    ctx.restore();
  }
}

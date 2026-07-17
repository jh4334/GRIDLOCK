// 기지 피격 비네트 — 적이 기지에 도달(라이프 감소)하는 순간, 화면 가장자리에 붉은 비네트를
// FADE_TIME초 동안 잠깐 띄웠다 사라지게 한다. 가산('lighter')이 아니라 일반 알파로 그려 "피해"
// 느낌을 준다.
//
// 연출 효과이므로 실시간 dt 기준으로 감쇠한다(배속과 무관 — screenShake와 동일 방침). trigger가
// 타이머만 세팅하고, update가 감쇠, render는 읽기 전용(CLAUDE.md update/render 분리). 지속·색·
// 최대 알파는 밸런스가 아닌 시각 상수.

import { withAlpha } from './palette';

const FADE_TIME = 0.3; // 페이드 지속(초).
const MAX_ALPHA = 0.5; // 가장자리 최대 불투명도.
const EDGE = '#ff2a2a'; // 비네트 색(붉은 경보).
const INNER = 0.55; // 투명 구간 반경 비율(대각선 절반 기준) — 안쪽은 비우고 가장자리만 물들인다.

export class Vignette {
  private timer = 0;

  /** 피격 순간 트리거 — 타이머만 세팅(감쇠·그리기는 update/render). */
  trigger(): void {
    this.timer = FADE_TIME;
  }

  update(dt: number): void {
    if (this.timer > 0) this.timer = Math.max(0, this.timer - dt);
  }

  get active(): boolean {
    return this.timer > 0;
  }

  /** 재시작 — 비네트 상태 초기화. */
  reset(): void {
    this.timer = 0;
  }

  // 중심 투명 → 가장자리 붉은 방사 그라데이션을 화면 전체에 덮는다. 읽기 전용.
  render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.timer <= 0) return;
    const cx = w / 2;
    const cy = h / 2;
    const outer = Math.hypot(w, h) / 2; // 코너까지 덮도록 대각선 절반.
    const g = ctx.createRadialGradient(cx, cy, outer * INNER, cx, cy, outer);
    g.addColorStop(0, withAlpha(EDGE, 0));
    g.addColorStop(1, withAlpha(EDGE, 1));
    ctx.save();
    ctx.globalAlpha = (this.timer / FADE_TIME) * MAX_ALPHA;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

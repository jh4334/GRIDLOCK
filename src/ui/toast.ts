// 설치 불가 사유 토스트(D2.1) — 캔버스 하단 중앙에 1줄, 1.5초 페이드아웃.
// interaction의 거부 플래시와 같은 패턴: update가 타이머를 감소시키고 render는 읽기만 한다.
// 문구는 밸런스가 아닌 UI 카피이므로 코드 상수로 둔다(CLAUDE.md 예외).

// 설치 실패 사유 문구(코드 상수).
export const MSG_GOLD = '골드가 부족합니다';
export const MSG_BLOCKADE = '길을 완전히 막을 수 없습니다';
export const MSG_OCCUPIED = '설치할 수 없는 칸입니다';

// 시각 상수(밸런스 아님).
const TOAST_TIME = 1.5; // 표시 지속(초).
const FADE_TIME = 0.5; // 마지막 0.5초 동안 서서히 사라짐.
const MARGIN_BOTTOM = 44; // 캔버스 하단에서의 여백(px).
const FONT = 'bold 20px system-ui, sans-serif';
const COLOR_TEXT = '#ffd24a';
const COLOR_SHADOW = 'rgba(0, 0, 0, 0.75)';

export class Toast {
  private message = '';
  private timer = 0;

  /** 사유 문구를 띄운다(재호출 시 타이머 리셋 — 최신 사유가 우선). */
  show(message: string): void {
    this.message = message;
    this.timer = TOAST_TIME;
  }

  /** 타이머 감소(실시간 기준). 상태 변경은 여기서만. */
  update(dt: number): void {
    if (this.timer <= 0) return;
    this.timer -= dt;
    if (this.timer <= 0) this.message = '';
  }

  /** 하단 중앙에 페이드아웃 문구를 그린다(읽기 전용). */
  render(ctx: CanvasRenderingContext2D): void {
    if (this.timer <= 0) return;
    const alpha = Math.min(1, this.timer / FADE_TIME); // 마지막 FADE_TIME초 동안만 페이드.
    const x = ctx.canvas.width / 2;
    const y = ctx.canvas.height - MARGIN_BOTTOM;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLOR_SHADOW;
    ctx.fillText(this.message, x + 1, y + 1); // 가독성용 그림자.
    ctx.fillStyle = COLOR_TEXT;
    ctx.fillText(this.message, x, y);
    ctx.restore();
  }

  /** 재시작·타이틀 복귀 시 초기화. */
  reset(): void {
    this.message = '';
    this.timer = 0;
  }
}

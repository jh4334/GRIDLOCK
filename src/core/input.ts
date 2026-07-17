// 마우스 입력 추적 — 캔버스 기준 픽셀 좌표로 보정해 노출한다.
//
// 캔버스가 CSS로 확대/축소되어도(rect.width ≠ canvas.width) 실제 내부 픽셀
// 좌표로 환산해야 그리드 칸 계산이 어긋나지 않는다.

export class MouseInput {
  // 캔버스 내부 픽셀 좌표. 캔버스 밖이면 inside=false.
  private mx = 0;
  private my = 0;
  private inside = false;

  private readonly onMove = (e: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    // CSS 표시 크기 대비 내부 해상도 비율 보정.
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    this.mx = (e.clientX - rect.left) * scaleX;
    this.my = (e.clientY - rect.top) * scaleY;
    this.inside = true;
  };

  private readonly onLeave = (): void => {
    this.inside = false;
  };

  constructor(private canvas: HTMLCanvasElement) {
    canvas.addEventListener('mousemove', this.onMove);
    canvas.addEventListener('mouseleave', this.onLeave);
  }

  /** 이벤트 리스너 해제 (현재 미사용, 정리용). */
  dispose(): void {
    this.canvas.removeEventListener('mousemove', this.onMove);
    this.canvas.removeEventListener('mouseleave', this.onLeave);
  }

  get x(): number {
    return this.mx;
  }

  get y(): number {
    return this.my;
  }

  get isInside(): boolean {
    return this.inside;
  }
}

// 키보드 입력 — 키별 keydown 핸들러를 등록한다. 키 자동 반복(e.repeat)은
// 무시해 D 토글 같은 동작이 누르고 있는 동안 연타되지 않게 한다.
export class Keyboard {
  private handlers = new Map<string, () => void>();

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    const fn = this.handlers.get(e.key.toLowerCase());
    if (fn) fn();
  };

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
  }

  /** key는 대소문자 무관('d', 'D' 동일). 같은 키 재등록 시 덮어쓴다. */
  on(key: string, handler: () => void): void {
    this.handlers.set(key.toLowerCase(), handler);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
  }
}

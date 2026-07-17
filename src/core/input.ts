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

  // 클릭 콜백(설치/선택용). 좌표는 mousemove와 동일한 보정을 거쳐 넘긴다.
  private clickHandler: ((x: number, y: number) => void) | null = null;

  private readonly onClickEvent = (e: MouseEvent): void => {
    if (!this.clickHandler) return;
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    this.clickHandler(x, y);
  };

  constructor(private canvas: HTMLCanvasElement) {
    canvas.addEventListener('mousemove', this.onMove);
    canvas.addEventListener('mouseleave', this.onLeave);
    canvas.addEventListener('click', this.onClickEvent);
  }

  /** 캔버스 클릭 핸들러 등록. 좌표는 캔버스 내부 픽셀 좌표로 보정된 값. */
  onClick(handler: (x: number, y: number) => void): void {
    this.clickHandler = handler;
  }

  /** 이벤트 리스너 해제 (현재 미사용, 정리용). */
  dispose(): void {
    this.canvas.removeEventListener('mousemove', this.onMove);
    this.canvas.removeEventListener('mouseleave', this.onLeave);
    this.canvas.removeEventListener('click', this.onClickEvent);
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
    if (fn) {
      e.preventDefault(); // 게임 조작 키의 기본 동작(예: Space 페이지 스크롤) 차단.
      fn();
    }
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

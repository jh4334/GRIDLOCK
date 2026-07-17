// 마우스 입력 추적 — 캔버스 기준 픽셀 좌표로 보정해 노출한다.
//
// 캔버스가 CSS로 확대/축소되어도(rect.width ≠ canvas.width) 실제 내부 픽셀
// 좌표로 환산해야 그리드 칸 계산이 어긋나지 않는다.

// 드래그 선택 박스(캔버스 내부 픽셀 좌표). 정규화 없이 시작·현재점을 그대로 담는다.
export interface DragBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// 드래그 콜백 묶음(다중 선택용, M11). 좌표는 모두 캔버스 내부 픽셀 좌표.
export interface DragHandlers {
  onStart(x: number, y: number): void;
  onMove(box: DragBox): void;
  onEnd(box: DragBox): void;
}

// 클릭과 드래그를 가르는 이동 임계값(px). 이보다 덜 움직이면 클릭으로 판정(구조 상수).
const DRAG_THRESHOLD = 4;

export class MouseInput {
  // 캔버스 내부 픽셀 좌표. 캔버스 밖이면 inside=false.
  private mx = 0;
  private my = 0;
  private inside = false;

  // 좌클릭 눌림/드래그 상태(mousedown→mousemove→mouseup으로 클릭 vs 드래그 판정).
  private pressed = false;
  private dragging = false;
  private startX = 0;
  private startY = 0;

  private readonly onMove = (e: MouseEvent): void => {
    const { x, y } = this.toCanvas(e);
    this.mx = x;
    this.my = y;
    this.inside = true;
    if (!this.pressed) return;
    // 임계값을 넘으면 드래그로 승격 → onStart 1회, 이후 onMove.
    if (!this.dragging && Math.hypot(x - this.startX, y - this.startY) > DRAG_THRESHOLD) {
      this.dragging = true;
      this.drag?.onStart(this.startX, this.startY);
    }
    if (this.dragging) this.drag?.onMove(this.box(x, y));
  };

  private readonly onLeave = (): void => {
    this.inside = false;
  };

  // 클릭 콜백(설치/선택용). 드래그가 아니었던 좌클릭 해제 시 호출한다.
  private clickHandler: ((x: number, y: number) => void) | null = null;
  // 우클릭 콜백(집결지·이동 명령용). contextmenu 기본 메뉴는 항상 차단한다.
  private rightClickHandler: ((x: number, y: number) => void) | null = null;
  // 드래그 콜백(다중 선택용).
  private drag: DragHandlers | null = null;

  // 캔버스 내부 픽셀 좌표로 보정(CSS 확대/축소 반영).
  private toCanvas(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  private box(x: number, y: number): DragBox {
    return { x0: this.startX, y0: this.startY, x1: x, y1: y };
  }

  // 좌클릭 누름 — 시작점을 기록하고 클릭/드래그 판정을 시작한다.
  private readonly onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return; // 좌클릭만.
    const { x, y } = this.toCanvas(e);
    this.pressed = true;
    this.dragging = false;
    this.startX = x;
    this.startY = y;
  };

  // 좌클릭 해제 — 드래그였으면 onEnd, 아니면 클릭 핸들러 호출. 창 어디서 놓든 처리한다.
  private readonly onMouseUp = (e: MouseEvent): void => {
    if (e.button !== 0 || !this.pressed) return;
    this.pressed = false;
    const { x, y } = this.toCanvas(e);
    if (this.dragging) {
      this.dragging = false;
      this.drag?.onEnd(this.box(x, y));
    } else {
      this.clickHandler?.(x, y);
    }
  };

  // 우클릭 — 브라우저 컨텍스트 메뉴를 막고 좌표를 핸들러로 넘긴다.
  private readonly onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    if (!this.rightClickHandler) return;
    const { x, y } = this.toCanvas(e);
    this.rightClickHandler(x, y);
  };

  constructor(private canvas: HTMLCanvasElement) {
    canvas.addEventListener('mousemove', this.onMove);
    canvas.addEventListener('mouseleave', this.onLeave);
    canvas.addEventListener('mousedown', this.onMouseDown);
    // mouseup은 window에 걸어 캔버스 밖에서 놓아도 드래그가 마무리되게 한다.
    window.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  /** 캔버스 클릭 핸들러 등록. 좌표는 캔버스 내부 픽셀 좌표로 보정된 값. */
  onClick(handler: (x: number, y: number) => void): void {
    this.clickHandler = handler;
  }

  /** 캔버스 우클릭 핸들러 등록(집결지·이동 명령). 보정된 캔버스 내부 좌표를 넘긴다. */
  onRightClick(handler: (x: number, y: number) => void): void {
    this.rightClickHandler = handler;
  }

  /** 드래그 선택 콜백 등록(다중 선택). 좌표는 캔버스 내부 픽셀 좌표. */
  onDrag(handlers: DragHandlers): void {
    this.drag = handlers;
  }

  /** 이벤트 리스너 해제 (현재 미사용, 정리용). */
  dispose(): void {
    this.canvas.removeEventListener('mousemove', this.onMove);
    this.canvas.removeEventListener('mouseleave', this.onLeave);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
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

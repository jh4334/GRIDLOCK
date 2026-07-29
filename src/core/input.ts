// 포인터 입력 추적 — 캔버스 논리 좌표(960×672)로 보정해 노출한다.
//
// 캔버스가 CSS로 확대/축소되어도(rect.width ≠ 논리 폭) 논리 좌표로 환산해야
// 그리드 칸 계산이 어긋나지 않는다. 백스토어는 DPR 배로 커질 수 있으므로(D9.2)
// 환산 기준은 canvas.width가 아니라 VIEW_W/VIEW_H다.
//
// D8.2: mouse* → Pointer Events 마이그레이션. 터치·펜이 브라우저의 마우스 에뮬레이션을
// 거치지 않고 1급 입력으로 들어온다(에뮬레이션 지연·유실 없음). 마우스 동작은 그대로다 —
// pointerdown/up의 button===0 검사가 기존 좌클릭 판정과 동일하고, 우클릭은 contextmenu로
// 계속 받는다. 멀티터치는 첫 포인터만 추적하고(pointerId 고정) 나머지는 무시한다.

import { VIEW_W, VIEW_H } from '../render/viewport';

// 마지막 입력 장치 종류. D8.3(터치 배치 UX)이 분기 근거로 쓸 예정 — 여기서는 노출만 한다.
export type PointerKind = 'mouse' | 'touch' | 'pen';

// 드래그 선택 박스(캔버스 내부 픽셀 좌표). 정규화 없이 시작·현재점을 그대로 담는다.
export interface DragBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// 드래그 콜백 묶음(다중 선택용, M11). 좌표는 모두 캔버스 내부 픽셀 좌표.
// onCancel은 pointercancel(터치가 시스템 제스처·전화 등으로 가로채짐)에서 호출된다 —
// onEnd(확정)와 달리 선택을 만들지 않고 진행 중이던 드래그를 되돌리는 용도.
export interface DragHandlers {
  onStart(x: number, y: number): void;
  onMove(box: DragBox): void;
  onEnd(box: DragBox): void;
  onCancel?(): void;
}

// 클릭과 드래그를 가르는 이동 임계값(px). 이보다 덜 움직이면 클릭으로 판정(구조 상수).
const DRAG_THRESHOLD = 4;

export class MouseInput {
  // 캔버스 내부 픽셀 좌표. 캔버스 밖이면 inside=false.
  private mx = 0;
  private my = 0;
  private inside = false;

  // 주 버튼 눌림/드래그 상태(pointerdown→pointermove→pointerup으로 클릭 vs 드래그 판정).
  private pressed = false;
  private dragging = false;
  private startX = 0;
  private startY = 0;
  // 눌림을 소유한 포인터 id. 누르는 동안 다른 포인터(두 번째 손가락)의 이벤트는 무시한다.
  private activeId: number | null = null;
  // 마지막 입력 장치(읽기 전용 노출). 분기는 D8.3에서.
  private lastKind: PointerKind = 'mouse';

  private readonly onPointerMove = (e: PointerEvent): void => {
    this.lastKind = kindOf(e);
    if (this.pressed && e.pointerId !== this.activeId) return; // 드래그 중인 포인터만 반영.
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

  // 캔버스 밖으로 나감 — 호버 해제. 터치는 암묵적 포인터 캡처 때문에 손을 뗀 뒤에 온다.
  private readonly onLeave = (): void => {
    this.inside = false;
  };

  // 클릭 콜백(설치/선택용). 드래그가 아니었던 좌클릭 해제 시 호출한다.
  private clickHandler: ((x: number, y: number) => void) | null = null;
  // 우클릭 콜백(집결지·이동 명령용). contextmenu 기본 메뉴는 항상 차단한다.
  private rightClickHandler: ((x: number, y: number) => void) | null = null;
  // 드래그 콜백(다중 선택용).
  private drag: DragHandlers | null = null;

  // 캔버스 논리 좌표로 보정(CSS 확대/축소 반영).
  private toCanvas(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    // D9.2: 기준은 백스토어(canvas.width, DPR 배)가 아니라 논리 크기다 — 백스토어로 나누면
    // DPR 2에서 좌표가 2배로 튀어 칸 계산이 어긋난다.
    const scaleX = VIEW_W / rect.width;
    const scaleY = VIEW_H / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  private box(x: number, y: number): DragBox {
    return { x0: this.startX, y0: this.startY, x1: x, y1: y };
  }

  // 주 버튼 누름(마우스 좌클릭 / 터치 접촉 / 펜 접촉) — 시작점을 기록하고 클릭·드래그 판정 시작.
  private readonly onPointerDown = (e: PointerEvent): void => {
    this.lastKind = kindOf(e);
    if (e.button !== 0) return; // 마우스 좌클릭만(터치·펜 접촉도 button===0).
    if (this.pressed) return; // 이미 다른 포인터가 누르는 중 — 멀티터치 무시.
    const { x, y } = this.toCanvas(e);
    // 터치는 move 없이 down이 먼저 오므로 호버 좌표를 여기서도 갱신한다(마우스는 값이 동일).
    this.mx = x;
    this.my = y;
    this.inside = true;
    this.pressed = true;
    this.dragging = false;
    this.activeId = e.pointerId;
    this.startX = x;
    this.startY = y;
  };

  // 주 버튼 해제 — 드래그였으면 onEnd, 아니면 클릭 핸들러 호출. 창 어디서 놓든 처리한다.
  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.button !== 0 || !this.pressed || e.pointerId !== this.activeId) return;
    this.pressed = false;
    this.activeId = null;
    const { x, y } = this.toCanvas(e);
    if (this.dragging) {
      this.dragging = false;
      this.drag?.onEnd(this.box(x, y));
    } else {
      this.clickHandler?.(x, y);
    }
  };

  // 포인터 취소(시스템 제스처·전화 수신 등으로 입력을 빼앗김) — 클릭도 확정도 하지 않고
  // 눌림·드래그 상태만 안전하게 되돌린다. 안 그러면 다음 pointerdown이 막힌 채로 남는다.
  private readonly onPointerCancel = (e: PointerEvent): void => {
    if (!this.pressed || e.pointerId !== this.activeId) return;
    this.pressed = false;
    this.activeId = null;
    this.inside = false;
    if (this.dragging) {
      this.dragging = false;
      this.drag?.onCancel?.();
    }
  };

  // 우클릭 — 브라우저 컨텍스트 메뉴를 막고 좌표를 핸들러로 넘긴다.
  // D8.3: 터치 롱프레스도 contextmenu를 발화시키므로(우클릭 핸들러가 설치 모드 취소·이동 명령을
  // 의도치 않게 실행) 마지막 입력이 터치면 메뉴만 막고 핸들러는 호출하지 않는다.
  private readonly onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    if (this.lastKind === 'touch') return;
    if (!this.rightClickHandler) return;
    const { x, y } = this.toCanvas(e);
    this.rightClickHandler(x, y);
  };

  constructor(private canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    // pointerup/cancel은 window에 걸어 캔버스 밖에서 놓거나 취소돼도 드래그가 마무리되게 한다.
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);
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
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onLeave);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
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

  /** 마지막 입력 장치 종류. 초기값은 'mouse'(입력 전). D8.3 터치 UX 분기용으로 노출만 한다. */
  get pointerType(): PointerKind {
    return this.lastKind;
  }
}

// PointerEvent.pointerType은 문자열이라 미지의 값(빈 문자열 등)이 올 수 있다 — 마우스로 수렴시켜
// 데스크톱 기본 동작을 보장한다.
function kindOf(e: PointerEvent): PointerKind {
  return e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse';
}

// 키보드 입력 — 키별 keydown 핸들러를 등록한다. 키 자동 반복(e.repeat)은
// 무시해 D 토글 같은 동작이 누르고 있는 동안 연타되지 않게 한다.
export class Keyboard {
  // 핸들러는 원본 KeyboardEvent를 받아 수정자(Ctrl 등)를 판별할 수 있다. 인자를 무시하는
  // 기존 `() => void` 핸들러도 그대로 호환된다(더 적은 인자 함수는 대입 가능).
  private handlers = new Map<string, (e: KeyboardEvent) => void>();

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    const fn = this.handlers.get(e.key.toLowerCase());
    if (fn) {
      e.preventDefault(); // 게임 조작 키의 기본 동작(예: Space 페이지 스크롤) 차단.
      fn(e);
    }
  };

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
  }

  /** key는 대소문자 무관('d', 'D' 동일). 같은 키 재등록 시 덮어쓴다. */
  on(key: string, handler: (e: KeyboardEvent) => void): void {
    this.handlers.set(key.toLowerCase(), handler);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
  }
}

// 정복 모드 선택 — 일꾼 단일/드래그 선택, HQ 선택. 우클릭 명령 처리는 코디네이터가
// 이 선택 상태를 읽어 수행한다(일꾼 이동/채집/건설). M11 UnitSelection과 같은 패턴이지만
// 대상 엔티티(Worker/HQ)가 달라 정복 전용으로 둔다.
//
// 선택은 상호 배타: 일꾼 무리 또는 HQ 하나. render는 읽기 전용(선택 링 + 드래그 박스).

import { pixelToCell } from '../game/grid';
import type { DragBox } from '../core/input';
import type { Worker } from './worker';
import type { HQ } from './hq';

const CLICK_RADIUS = 16;
const RING_COLOR = 'rgba(224, 179, 87, 0.95)';
const DRAG_FILL = 'rgba(224, 179, 87, 0.12)';
const DRAG_STROKE = 'rgba(224, 179, 87, 0.9)';
const RING_GAP = 4;

export type ClickResult = 'worker' | 'hq' | 'none';

export class ConquestSelection {
  private workers: Worker[] = [];
  private hq: HQ | null = null;
  private dragBox: DragBox | null = null;

  get selectedWorkers(): Worker[] {
    return this.workers;
  }
  get selectedHQ(): HQ | null {
    return this.hq;
  }
  get hasWorkers(): boolean {
    return this.workers.length > 0;
  }

  /** 죽었거나 목록에서 사라진 일꾼을 선택에서 제거. */
  prune(alive: Worker[]): void {
    if (this.workers.length === 0) return;
    const set = new Set(alive);
    this.workers = this.workers.filter((w) => !w.dead && set.has(w));
  }

  clear(): void {
    this.workers = [];
    this.hq = null;
  }

  reset(): void {
    this.clear();
    this.dragBox = null;
  }

  /** 좌클릭 — 일꾼 우선, 없으면 HQ, 그것도 아니면 해제. 무엇을 선택했는지 반환. */
  clickSelect(px: number, py: number, workers: Worker[], hq: HQ): ClickResult {
    let best: Worker | null = null;
    let bestD = Infinity;
    for (const w of workers) {
      if (w.dead) continue;
      const threshold = Math.max(CLICK_RADIUS, w.radius);
      const dx = w.x - px;
      const dy = w.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 <= threshold * threshold && d2 < bestD) {
        bestD = d2;
        best = w;
      }
    }
    if (best) {
      this.workers = [best];
      this.hq = null;
      return 'worker';
    }
    const { cx, cy } = pixelToCell(px, py);
    if (hq.occupies(cx, cy)) {
      this.workers = [];
      this.hq = hq;
      return 'hq';
    }
    this.clear();
    return 'none';
  }

  // ── 드래그 박스 다중 선택(일꾼) ──────────────────────────────
  beginDrag(x: number, y: number): void {
    this.dragBox = { x0: x, y0: y, x1: x, y1: y };
  }
  updateDrag(box: DragBox): void {
    this.dragBox = box;
  }
  cancelDrag(): void {
    this.dragBox = null;
  }

  /** 드래그 종료 — 박스 안 일꾼 전원 선택. 선택 수 반환. */
  endDrag(box: DragBox, workers: Worker[]): number {
    const minX = Math.min(box.x0, box.x1);
    const maxX = Math.max(box.x0, box.x1);
    const minY = Math.min(box.y0, box.y1);
    const maxY = Math.max(box.y0, box.y1);
    this.workers = workers.filter((w) => !w.dead && w.x >= minX && w.x <= maxX && w.y >= minY && w.y <= maxY);
    if (this.workers.length > 0) this.hq = null;
    this.dragBox = null;
    return this.workers.length;
  }

  // ── render(읽기 전용) ────────────────────────────────────────
  renderRings(ctx: CanvasRenderingContext2D): void {
    if (this.workers.length === 0) return;
    ctx.save();
    ctx.strokeStyle = RING_COLOR;
    ctx.lineWidth = 2;
    for (const w of this.workers) {
      if (w.dead) continue;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.radius + RING_GAP, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  renderDragBox(ctx: CanvasRenderingContext2D): void {
    const b = this.dragBox;
    if (!b) return;
    const x = Math.min(b.x0, b.x1);
    const y = Math.min(b.y0, b.y1);
    const w = Math.abs(b.x1 - b.x0);
    const h = Math.abs(b.y1 - b.y0);
    ctx.save();
    ctx.fillStyle = DRAG_FILL;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = DRAG_STROKE;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
    ctx.restore();
  }
}

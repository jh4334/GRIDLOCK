// 정복 모드 선택 — 전투 유닛 / 일꾼 단일·드래그 선택, HQ 선택. 우클릭 명령 처리는 코디네이터가
// 이 선택 상태를 읽어 수행한다(유닛 이동·공격 / 일꾼 이동·채집·건설). 선택은 상호 배타:
// 전투 유닛 무리 · 일꾼 무리 · HQ 하나 중 하나. render는 읽기 전용(선택 링 + 드래그 박스).

import { pixelToCell } from '../game/grid';
import type { DragBox } from '../core/input';
import type { Worker } from './worker';
import type { HQ } from './hq';
import type { CombatUnit } from './combatUnit';

const CLICK_RADIUS = 16;
const RING_COLOR = 'rgba(224, 179, 87, 0.95)';
const UNIT_RING_COLOR = 'rgba(127, 208, 255, 0.95)';
const DRAG_FILL = 'rgba(224, 179, 87, 0.12)';
const DRAG_STROKE = 'rgba(224, 179, 87, 0.9)';
const RING_GAP = 4;

export type ClickResult = 'unit' | 'worker' | 'hq' | 'none';

export class ConquestSelection {
  private units: CombatUnit[] = [];
  private workers: Worker[] = [];
  private hq: HQ | null = null;
  private dragBox: DragBox | null = null;

  get selectedUnits(): CombatUnit[] {
    return this.units;
  }
  get selectedWorkers(): Worker[] {
    return this.workers;
  }
  get selectedHQ(): HQ | null {
    return this.hq;
  }
  get hasUnits(): boolean {
    return this.units.length > 0;
  }
  get hasWorkers(): boolean {
    return this.workers.length > 0;
  }

  /** 죽었거나 목록에서 사라진 선택 대상을 정리. */
  prune(units: CombatUnit[], workers: Worker[]): void {
    if (this.units.length > 0) {
      const set = new Set(units);
      this.units = this.units.filter((u) => !u.dead && set.has(u));
    }
    if (this.workers.length > 0) {
      const set = new Set(workers);
      this.workers = this.workers.filter((w) => !w.dead && set.has(w));
    }
  }

  /** 부대 선택 — 전투 유닛·일꾼을 동시에 선택(HQ 해제). 죽은 대상은 제외. */
  selectGroup(units: CombatUnit[], workers: Worker[]): void {
    this.clear();
    this.units = units.filter((u) => !u.dead);
    this.workers = workers.filter((w) => !w.dead);
  }

  clear(): void {
    this.units = [];
    this.workers = [];
    this.hq = null;
  }
  reset(): void {
    this.clear();
    this.dragBox = null;
  }

  /** 좌클릭 — 전투 유닛 우선, 없으면 일꾼, 없으면 HQ, 그것도 아니면 해제. */
  clickSelect(px: number, py: number, units: CombatUnit[], workers: Worker[], hq: HQ): ClickResult {
    const unit = nearestNear(px, py, units, (u) => u.radius);
    if (unit) {
      this.clear();
      this.units = [unit];
      return 'unit';
    }
    const worker = nearestNear(px, py, workers, (w) => w.radius);
    if (worker) {
      this.clear();
      this.workers = [worker];
      return 'worker';
    }
    const { cx, cy } = pixelToCell(px, py);
    if (hq.occupies(cx, cy)) {
      this.clear();
      this.hq = hq;
      return 'hq';
    }
    this.clear();
    return 'none';
  }

  // ── 드래그 박스 다중 선택 ────────────────────────────────────
  beginDrag(x: number, y: number): void {
    this.dragBox = { x0: x, y0: y, x1: x, y1: y };
  }
  updateDrag(box: DragBox): void {
    this.dragBox = box;
  }
  cancelDrag(): void {
    this.dragBox = null;
  }

  /** 드래그 종료 — 박스 안 전투 유닛 우선(있으면), 없으면 일꾼 전원 선택. 선택 수 반환. */
  endDrag(box: DragBox, units: CombatUnit[], workers: Worker[]): number {
    const minX = Math.min(box.x0, box.x1);
    const maxX = Math.max(box.x0, box.x1);
    const minY = Math.min(box.y0, box.y1);
    const maxY = Math.max(box.y0, box.y1);
    const inBox = (x: number, y: number): boolean => x >= minX && x <= maxX && y >= minY && y <= maxY;
    this.dragBox = null;

    const us = units.filter((u) => !u.dead && inBox(u.x, u.y));
    if (us.length > 0) {
      this.clear();
      this.units = us;
      return us.length;
    }
    const ws = workers.filter((w) => !w.dead && inBox(w.x, w.y));
    this.clear();
    this.workers = ws;
    return ws.length;
  }

  // ── render(읽기 전용) ────────────────────────────────────────
  renderRings(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.lineWidth = 2;
    ctx.strokeStyle = UNIT_RING_COLOR;
    for (const u of this.units) {
      if (u.dead) continue;
      ctx.beginPath();
      ctx.arc(u.x, u.y, u.radius + RING_GAP, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = RING_COLOR;
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

// 클릭 지점 최근접(반경 내) 대상. 반경은 max(CLICK_RADIUS, 엔티티 반경).
function nearestNear<T extends { x: number; y: number; dead: boolean }>(
  px: number,
  py: number,
  list: T[],
  radiusOf: (t: T) => number,
): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const t of list) {
    if (t.dead) continue;
    const threshold = Math.max(CLICK_RADIUS, radiusOf(t));
    const d2 = (t.x - px) ** 2 + (t.y - py) ** 2;
    if (d2 <= threshold * threshold && d2 < bestD) {
      bestD = d2;
      best = t;
    }
  }
  return best;
}

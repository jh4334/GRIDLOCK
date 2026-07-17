// 병사 선택·이동 명령(M11) — 좌클릭 단일 선택, 드래그 박스 다중 선택, 우클릭 A* 이동 명령.
//
// 상태(선택된 병사 목록 + 진행 중 드래그 박스)를 이 클래스가 소유하고, Game이 조율한다.
// 병사 목록은 Game/Interaction이 소유하므로 getBarracks 게터로 최신값을 조회한다.
// update/render 분리 규칙: 선택·명령은 명령형 메서드에서만 상태를 바꾸고, render는 읽기 전용.
//
// 산개 배치: 도착 칸 중심에서 동심 링으로 슬롯을 만든다 — 1기면 중심, 이후 링(≈16px 간격)을
// 바깥으로 확장. 각 병사는 도착 칸까지 A* 경로로 이동하고, 마지막에 자기 슬롯으로 흩어진다.

import { pixelToCell, cellCenter } from './grid';
import type { Grid } from './grid';
import { findPath } from '../systems/astar';
import type { Barracks, Soldier } from '../entities/unit';
import type { DragBox } from '../core/input';

// 선택·산개 기하 상수(밸런스 아님 — 경로/선택 관련 코드 상수는 CLAUDE.md 예외 허용).
const CLICK_SELECT_RADIUS = 16; // 단일 클릭 시 이 반경(px) 안의 가장 가까운 병사를 선택.
const SLOT_SPACING = 16; // 산개 슬롯 간격(px). 링 반지름 = 링번호 × 이 값.
const RING_RADIUS_GAP = 4; // 선택 링을 병사 반지름보다 이만큼 크게 그린다.

// 시각 상수.
const RING_COLOR = 'rgba(120, 230, 140, 0.95)'; // 선택 링(아군 초록).
const DRAG_FILL = 'rgba(120, 230, 140, 0.12)';
const DRAG_STROKE = 'rgba(120, 230, 140, 0.9)';

export class UnitSelection {
  private selected: Soldier[] = [];
  private dragBox: DragBox | null = null; // 진행 중 드래그 박스(렌더용). 없으면 null.

  constructor(
    private grid: Grid,
    private getBarracks: () => Barracks[],
  ) {}

  // 현재 배럭 로스터의 모든 병사(선택 후보). 배럭·병사 수가 적어 매 조회 저렴.
  private soldiers(): Soldier[] {
    const out: Soldier[] = [];
    for (const b of this.getBarracks()) for (const s of b.soldiers) out.push(s);
    return out;
  }

  /** 살아있는 선택 병사가 있는가(죽은 병사 정리 후 판정). */
  get hasSelection(): boolean {
    this.prune();
    return this.selected.length > 0;
  }

  /** 죽었거나 사라진 병사를 선택에서 제거(리스폰으로 교체된 병사는 참조가 달라 자동 배제). */
  prune(): void {
    if (this.selected.length === 0) return;
    this.selected = this.selected.filter((s) => !s.dead);
  }

  /** 선택 해제(빈 곳 클릭/타워 선택 시). */
  clear(): void {
    this.selected.length = 0;
  }

  /** 재시작 — 선택·드래그 상태 초기화. */
  reset(): void {
    this.selected.length = 0;
    this.dragBox = null;
  }

  /**
   * 단일 클릭 선택 — 클릭 지점 반경 내 가장 가까운 병사 1기를 선택. 성공하면 true.
   * 반경 밖이면(빈 곳) false를 돌려주고 선택은 바꾸지 않는다(호출부가 해제/타워선택 판단).
   */
  trySelectAt(px: number, py: number): boolean {
    let best: Soldier | null = null;
    let bestD = Infinity;
    for (const s of this.soldiers()) {
      if (s.dead) continue;
      const threshold = Math.max(CLICK_SELECT_RADIUS, s.radius);
      const dx = s.x - px;
      const dy = s.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 <= threshold * threshold && d2 < bestD) {
        bestD = d2;
        best = s;
      }
    }
    if (!best) return false;
    this.selected = [best];
    return true;
  }

  // ── 드래그 박스 다중 선택 ────────────────────────────────────
  beginDrag(x: number, y: number): void {
    this.dragBox = { x0: x, y0: y, x1: x, y1: y };
  }

  updateDrag(box: DragBox): void {
    this.dragBox = box;
  }

  /** 드래그 종료 — 박스 안의 병사를 모두 선택하고 박스를 지운다. 선택된 수를 돌려준다. */
  endDrag(box: DragBox): number {
    const minX = Math.min(box.x0, box.x1);
    const maxX = Math.max(box.x0, box.x1);
    const minY = Math.min(box.y0, box.y1);
    const maxY = Math.max(box.y0, box.y1);
    this.selected = this.soldiers().filter(
      (s) => !s.dead && s.x >= minX && s.x <= maxX && s.y >= minY && s.y <= maxY,
    );
    this.dragBox = null;
    return this.selected.length;
  }

  /** 드래그 취소(선택 변경 없이 박스만 제거). */
  cancelDrag(): void {
    this.dragBox = null;
  }

  // ── 이동 명령(A* + 산개) ─────────────────────────────────────
  /**
   * 우클릭 이동 명령 — 도착 칸 주변에 산개 슬롯을 배정하고, 각 병사에게 A* 경로를 지정한다.
   * 도착 칸이 벽/범위 밖이면 명령을 무시한다. 도달 불가한 병사는 건너뛴다.
   */
  commandMove(px: number, py: number): void {
    this.prune();
    if (this.selected.length === 0) return;
    const dest = pixelToCell(px, py);
    if (!this.grid.isWalkable(dest.cx, dest.cy)) return; // 벽/범위 밖이면 명령 무시.

    const slots = spreadSlots(cellCenter(dest.cx, dest.cy), this.selected.length);
    for (let i = 0; i < this.selected.length; i++) {
      const s = this.selected[i];
      const from = pixelToCell(s.x, s.y);
      const path = findPath(this.grid, from, dest);
      if (path === null) continue; // 도달 불가 → 이 병사는 명령 무시.
      s.rallyOverride = slots[i]; // 개별 도착점(산개 슬롯).
      s.path = path.map((c) => cellCenter(c.cx, c.cy)); // 칸 중심 웨이포인트.
      s.target = null; // 교전 중이었어도 이동을 우선해 출발.
    }
  }

  // ── render(읽기 전용) ────────────────────────────────────────
  /** 선택된 병사 발밑 선택 링(병사 렌더 아래에 깔리도록 Game.render가 먼저 호출). */
  renderRings(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.strokeStyle = RING_COLOR;
    ctx.lineWidth = 2;
    for (const s of this.selected) {
      if (s.dead) continue;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius + RING_RADIUS_GAP, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 진행 중 드래그 박스(반투명 채움 + 테두리). 없으면 아무것도 안 그린다. */
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

/**
 * 도착 칸 중심 기준 산개 슬롯 — 1기면 중심, 이후 동심 링을 바깥으로 채운다.
 * 각 링은 반지름 = 링번호 × SLOT_SPACING, 수용량 ≈ 2π×링번호(간격 SLOT_SPACING 유지).
 * 예) 1기=중심 / 2~7기=중심+안쪽 링(최대 6) / 그 이상=바깥 링으로 확장. 슬롯은 서로 겹치지 않는다.
 */
function spreadSlots(center: { x: number; y: number }, n: number): { x: number; y: number }[] {
  const slots: { x: number; y: number }[] = [];
  if (n <= 0) return slots;
  slots.push({ x: center.x, y: center.y }); // 첫 슬롯은 중심.
  let remaining = n - 1;
  let ring = 1;
  while (remaining > 0) {
    const radius = ring * SLOT_SPACING;
    const capacity = Math.max(1, Math.floor(2 * Math.PI * ring)); // 이 링에 들어갈 최대 수.
    const count = Math.min(remaining, capacity);
    for (let i = 0; i < count; i++) {
      const ang = -Math.PI / 2 + (i * (Math.PI * 2)) / count; // 위쪽부터 균등 분산.
      slots.push({ x: center.x + Math.cos(ang) * radius, y: center.y + Math.sin(ang) * radius });
    }
    remaining -= count;
    ring++;
  }
  return slots;
}

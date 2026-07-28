// D8.5 정복 건설 배치 — 대상 칸 판정(마우스 즉시 / 터치 2탭 확정)과 배치 고스트 렌더를 소유한다.
// 터치 2탭 대기 칸 상태는 디펜스와 같은 TouchPlacement(game/touchPlace)를 재사용한다.
// conquestGame이 300줄 상한이라 배치 미리보기 관심사를 이 파일로 분리했다(interaction→touchPlace 선례).
//
// 상태 변경은 tap/clear/updateHover에서만, render는 읽기 전용(update/render 분리 규칙).

import { TILE, cellToPixel, pixelToCell } from '../game/grid';
import { TouchPlacement } from '../game/touchPlace';
import type { MouseInput } from '../core/input';
import type { ConquestWorld } from './conquestWorld';
import type { BuildKind } from './building';

// 시각 상수(밸런스 아님).
const GHOST_OK = 'rgba(90, 220, 120, 0.35)';
const GHOST_BAD = 'rgba(230, 70, 70, 0.35)';
const PENDING_STROKE = 'rgba(255, 255, 255, 0.9)'; // 터치 대기 칸 테두리(재탭하면 확정).

export class ConquestPlacement {
  private readonly touch = new TouchPlacement();
  private hoverCell: { cx: number; cy: number } | null = null; // updateHover가 계산, render는 읽기만.

  /**
   * 배치 대상 칸 판정. 마우스는 그 칸을 즉시 확정하고, 터치는 첫 탭/다른 칸 탭이면
   * 대기 칸만 옮기고(null 반환) 같은 칸 재탭에서만 확정 칸을 돌려준다.
   */
  tap(px: number, py: number, touch: boolean): { cx: number; cy: number } | null {
    const { cx, cy } = pixelToCell(px, py);
    if (!touch) {
      this.touch.clear(); // 마우스 클릭이 끼어들면(하이브리드 기기) 남은 대기 칸은 무효.
      return { cx, cy };
    }
    return this.touch.tap(cx, cy) === 'confirm' ? { cx, cy } : null;
  }

  /** 건설 모드 해제·전환·리셋 시 대기 칸·호버 폐기. */
  clear(): void {
    this.touch.clear();
    this.hoverCell = null;
  }

  /** update — 터치는 손을 뗀 뒤에도 대기 칸을 고스트로 유지, 마우스는 기존 호버 칸 그대로. */
  updateHover(input: MouseInput, world: ConquestWorld, placing: boolean): void {
    if (!placing || world.phase !== 'playing') {
      this.hoverCell = null;
      return;
    }
    const pending = input.pointerType === 'touch' ? this.touch.cell : null;
    const c = pending ?? (input.isInside ? pixelToCell(input.x, input.y) : null);
    this.hoverCell = c && world.grid.inBounds(c.cx, c.cy) ? { cx: c.cx, cy: c.cy } : null;
  }

  /** 배치 고스트(가능=초록·불가=빨강). 터치 대기 칸이면 테두리를 덧그려 재탭 확정을 알린다. */
  render(ctx: CanvasRenderingContext2D, world: ConquestWorld, kind: BuildKind): void {
    const cell = this.hoverCell;
    if (!cell) return;
    const { cx, cy } = cell;
    const spec = world.buildSpec(kind);
    const ok = world.canBuildAt(cx, cy) && world.crystal >= spec.cost && world.workers.length > 0;
    const { x, y } = cellToPixel(cx, cy);
    ctx.fillStyle = ok ? GHOST_OK : GHOST_BAD;
    ctx.fillRect(x, y, TILE, TILE);
    if (!this.touch.cell) return;
    ctx.save();
    ctx.strokeStyle = PENDING_STROKE;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
    ctx.restore();
  }
}

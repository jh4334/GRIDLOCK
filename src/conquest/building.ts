// 정복 건물 — 배럭/포탑/보급고. 착공 시 벽으로 칸을 막고, 일꾼 1기가 붙어 건설한다.
// 건설 중에는 회색 반투명 + 진행 바, 완성되면 실색. 완성 시 부수효과(배럭=병사 운용
// 인스턴스 생성, 보급고=인구 증가)는 코디네이터가 advance의 완성 신호를 보고 처리한다.
//
// 수치(비용·건설 시간·인구 보너스)는 conquest.json에서 코디네이터가 읽어 주입한다.
// update/render 분리: advance(dt)만 진행도를 바꾸고 render는 읽기 전용.

import { cellToPixel, TILE } from '../game/grid';
import { towerSpec } from '../entities/tower';
import type { Barracks } from '../entities/unit';

export type BuildKind = 'barracks' | 'turret' | 'depot';

// 종류별 색(시각 상수). 배럭·포탑은 기존 타워 스펙 색을 재사용한다.
const COLOR: Record<BuildKind, string> = {
  barracks: towerSpec('barracks').color,
  turret: towerSpec('arrow').color,
  depot: '#c9a24b',
};
const COLOR_OUTLINE = '#0d0f14';
const COLOR_CONSTRUCT = '#6a6a72';
const PROGRESS_BG = '#000';
const PROGRESS_FG = '#7bd67b';
const INSET = 4;
const BAR_H = 4;

export class Building {
  readonly kind: BuildKind;
  readonly cx: number;
  readonly cy: number;
  private readonly buildTime: number;
  private progress = 0; // 0..buildTime. 일꾼이 건설 중일 때만 증가.
  private done = false;

  // 배럭 전용 — 완성 후 코디네이터가 채워 넣는 병사 운용 인스턴스(렌더는 별도).
  barracks: Barracks | null = null;

  constructor(kind: BuildKind, cx: number, cy: number, buildTime: number) {
    this.kind = kind;
    this.cx = cx;
    this.cy = cy;
    this.buildTime = buildTime;
  }

  get complete(): boolean {
    return this.done;
  }
  get progressRatio(): number {
    return Math.min(1, this.progress / this.buildTime);
  }

  /** 일꾼이 건설 중일 때 호출 — 진행도를 올리고, 이번에 막 완성되면 true. */
  advance(dt: number): boolean {
    if (this.done) return false;
    this.progress += dt;
    if (this.progress >= this.buildTime) {
      this.done = true;
      return true;
    }
    return false;
  }

  render(ctx: CanvasRenderingContext2D, selected: boolean): void {
    const { x, y } = cellToPixel(this.cx, this.cy);
    const size = TILE - INSET * 2;
    ctx.save();
    if (!this.done) {
      // 건설 중 — 회색 반투명 + 진행 바.
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = COLOR_CONSTRUCT;
      ctx.fillRect(x + INSET, y + INSET, size, size);
      ctx.globalAlpha = 1;
      const bw = size;
      const by = y + TILE - INSET - BAR_H - 2;
      ctx.fillStyle = PROGRESS_BG;
      ctx.fillRect(x + INSET - 1, by - 1, bw + 2, BAR_H + 2);
      ctx.fillStyle = PROGRESS_FG;
      ctx.fillRect(x + INSET, by, bw * this.progressRatio, BAR_H);
    } else {
      ctx.fillStyle = COLOR[this.kind];
      ctx.fillRect(x + INSET, y + INSET, size, size);
      ctx.strokeStyle = COLOR_OUTLINE;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + INSET, y + INSET, size, size);
    }
    if (selected) {
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1.5, y + 1.5, TILE - 3, TILE - 3);
    }
    ctx.restore();
  }
}

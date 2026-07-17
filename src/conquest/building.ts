// 정복 건물 — 배럭/포탑/보급고. 착공 시 벽으로 칸을 막고, 일꾼 1기가 붙어 건설한다.
// 진영(side) 태그와 HP를 가진다: 파괴되면(hp<=0) 벽이 풀리고 부수효과가 사라진다.
//   - 배럭: 완성 시 전투 유닛 unitCount기를 유지(리스폰 큐 소유). 파괴 시 리스폰 중단.
//   - 포탑: 사거리 내 적 진영 유닛을 사격(발사 쿨다운 소유). combat이 갱신.
//   - 보급고: 완성 시 인구 상한 증가(플레이어). 파괴 시 감소.
//
// 수치(비용·건설 시간·HP)는 conquest.json에서 코디네이터가 읽어 주입한다.
// update/render 분리: advance(dt)만 진행도를 바꾸고 render는 읽기 전용.

import { cellToPixel, cellCenter, TILE } from '../game/grid';
import { towerSpec } from '../entities/tower';
import type { Side } from './hq';

export type BuildKind = 'barracks' | 'turret' | 'depot';

// 종류별 색(시각 상수). 배럭·포탑은 기존 타워 스펙 색을 재사용한다.
const COLOR: Record<BuildKind, string> = {
  barracks: towerSpec('barracks').color,
  turret: towerSpec('arrow').color,
  depot: '#c9a24b',
};
const SIDE_BORDER: Record<Side, string> = { player: '#3a78d0', enemy: '#c0433a' };
const COLOR_CONSTRUCT = '#6a6a72';
const PROGRESS_BG = '#000';
const PROGRESS_FG = '#7bd67b';
const INSET = 4;
const BAR_H = 4;
const HP_BAR_H = 4;
const HP_BAR_GAP = 7;

// 구조물 반경(px) — 유닛이 인접에서 공격을 시작하는 접촉 기준(시각/기하 상수).
export const STRUCTURE_RADIUS = TILE * 0.5;

export class Building {
  readonly side: Side;
  readonly kind: BuildKind;
  readonly cx: number;
  readonly cy: number;
  readonly maxHp: number;
  hp: number;
  destroyed = false;
  readonly structure = true;

  private readonly buildTime: number;
  private progress = 0; // 0..buildTime. 일꾼이 건설 중일 때만 증가.
  private done = false;

  // 배럭 전용 — 리스폰 대기 타이머(각 원소 = 남은 초)와 집결지(픽셀).
  readonly respawnQueue: number[] = [];
  rallyX = 0;
  rallyY = 0;

  // 포탑 전용 — 발사 쿨다운(초). combat이 감소·갱신.
  cooldown = 0;

  constructor(side: Side, kind: BuildKind, cx: number, cy: number, buildTime: number, hp: number) {
    this.side = side;
    this.kind = kind;
    this.cx = cx;
    this.cy = cy;
    this.buildTime = buildTime;
    this.maxHp = hp;
    this.hp = hp;
    const c = cellCenter(cx, cy);
    this.rallyX = c.x;
    this.rallyY = c.y;
  }

  get complete(): boolean {
    return this.done;
  }
  get progressRatio(): number {
    return Math.min(1, this.progress / this.buildTime);
  }
  get isBarracks(): boolean {
    return this.kind === 'barracks';
  }
  get isTurret(): boolean {
    return this.kind === 'turret';
  }

  // Combatant 계약(공격 대상) — 완성된 건물만 타겟이 된다.
  get x(): number {
    return cellCenter(this.cx, this.cy).x;
  }
  get y(): number {
    return cellCenter(this.cx, this.cy).y;
  }
  get radius(): number {
    return STRUCTURE_RADIUS;
  }
  get dead(): boolean {
    return this.destroyed || this.hp <= 0;
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

  /** 배럭 집결지(기지 반대편·통행 칸)를 설정. 완성 시 코디네이터가 호출. */
  setRally(x: number, y: number): void {
    this.rallyX = x;
    this.rallyY = y;
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
      const by = y + TILE - INSET - BAR_H - 2;
      ctx.fillStyle = PROGRESS_BG;
      ctx.fillRect(x + INSET - 1, by - 1, size + 2, BAR_H + 2);
      ctx.fillStyle = PROGRESS_FG;
      ctx.fillRect(x + INSET, by, size * this.progressRatio, BAR_H);
    } else {
      ctx.fillStyle = COLOR[this.kind];
      ctx.fillRect(x + INSET, y + INSET, size, size);
      ctx.strokeStyle = SIDE_BORDER[this.side]; // 진영 구분 테두리.
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x + INSET, y + INSET, size, size);
      if (this.hp < this.maxHp) this.renderHpBar(ctx, x, y); // 손상 시에만 HP바.
    }
    if (selected) {
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1.5, y + 1.5, TILE - 3, TILE - 3);
    }
    ctx.restore();
  }

  private renderHpBar(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const ratio = Math.max(0, this.hp / this.maxHp);
    const barW = TILE - INSET * 2;
    const bx = x + INSET;
    const by = y - HP_BAR_GAP - HP_BAR_H;
    ctx.fillStyle = '#000';
    ctx.fillRect(bx - 1, by - 1, barW + 2, HP_BAR_H + 2);
    ctx.fillStyle = this.side === 'player' ? '#7fd0ff' : '#ff9a8a';
    ctx.fillRect(bx, by, barW * ratio, HP_BAR_H);
  }
}

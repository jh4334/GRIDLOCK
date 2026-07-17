// 정복 건물 — 배럭/포탑/보급고. 착공 시 벽으로 칸을 막고, 일꾼 1기가 붙어 건설한다.
// 진영(side) 태그와 HP를 가진다: 파괴되면(hp<=0) 벽이 풀리고 부수효과가 사라진다.
//   - 배럭: 완성 시 전투 유닛 unitCount기를 유지(리스폰 큐 소유). 파괴 시 리스폰 중단.
//   - 포탑: 사거리 내 적 진영 유닛을 사격(발사 쿨다운 소유). combat이 갱신.
//   - 보급고: 완성 시 인구 상한 증가(플레이어). 파괴 시 감소.
//
// 수치(비용·건설 시간·HP)는 conquest.json에서 코디네이터가 읽어 주입한다.
// update/render 분리: advance(dt)만 진행도를 바꾸고 render는 읽기 전용.

import { cellToPixel, cellCenter, TILE } from '../game/grid';
import { drawBuilding, drawConstruction, drawBuildingSelect } from '../render/buildingSprites';
import { drawHpBar } from '../render/hpbar';
import { ALLY_CYAN, FOE_RED } from '../render/palette';
import type { Side } from './hq';

export type BuildKind = 'barracks' | 'turret' | 'depot' | 'factory';

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
  get isFactory(): boolean {
    return this.kind === 'factory';
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
    if (!this.done) {
      // 건설 중 — 홀로그램 와이어프레임(청사진) + 진행 바.
      drawConstruction(ctx, this.kind, x, y, this.progressRatio);
    } else {
      drawBuilding(ctx, this.kind, this.side, x, y);
      if (this.hp < this.maxHp) {
        // 손상 시에만 HP바.
        drawHpBar(ctx, x + 4, y - HP_BAR_GAP - HP_BAR_H, TILE - 8, HP_BAR_H, this.hp / this.maxHp, this.side === 'player' ? ALLY_CYAN : FOE_RED);
      }
    }
    if (selected) drawBuildingSelect(ctx, x, y);
  }
}

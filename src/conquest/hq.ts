// 본진(HQ) — 한 칸을 차지하는 큰 건물(벽). 내 본진은 일꾼을 생산하고, 적 본진은
// 지금은 렌더만 한다(파괴 목표는 M12 후반부). 수치는 conquest.json에서 로딩.
//
// 일꾼 생산: 큐(남은 시간 배열, 최대 queueMax). update가 큐 선두를 진행시키고 완료 시
// onProduce 콜백으로 일꾼을 스폰한다(코디네이터가 인구·위치를 처리). render는 읽기 전용.

import { cellToPixel, cellCenter, TILE } from '../game/grid';
import { drawReactor } from '../render/tileSprites';
import { drawHpBar } from '../render/hpbar';

export type Side = 'player' | 'enemy';

const COLOR_HP = '#39d5ff';
const COLOR_HP_ENEMY = '#ff4d6a';
const HP_BAR_H = 5;
const HP_BAR_GAP = 8;

export class HQ {
  readonly side: Side;
  readonly cx: number;
  readonly cy: number;
  readonly maxHp: number;
  hp: number;
  readonly structure = true; // Combatant 계약 — HQ는 고정 구조물.

  // 생산 큐 — 각 원소 = 남은 생산 시간(초). 선두부터 진행.
  private queue: number[] = [];
  private readonly buildTime: number;
  private readonly queueMax: number;

  constructor(side: Side, cx: number, cy: number, hp: number, buildTime: number, queueMax: number) {
    this.side = side;
    this.cx = cx;
    this.cy = cy;
    this.maxHp = hp;
    this.hp = hp;
    this.buildTime = buildTime;
    this.queueMax = queueMax;
  }

  occupies(cx: number, cy: number): boolean {
    return cx === this.cx && cy === this.cy;
  }

  // Combatant 계약 — HQ는 공격 대상이 될 수 있다(중심 좌표·반경·파괴 판정).
  get x(): number {
    return cellCenter(this.cx, this.cy).x;
  }
  get y(): number {
    return cellCenter(this.cx, this.cy).y;
  }
  get radius(): number {
    return TILE * 0.42;
  }
  get dead(): boolean {
    return this.hp <= 0;
  }

  get queueCount(): number {
    return this.queue.length;
  }
  get canQueue(): boolean {
    return this.queue.length < this.queueMax;
  }

  /** 일꾼 1기 생산 예약(큐 여유가 있을 때만). 성공하면 true. */
  enqueue(): boolean {
    if (!this.canQueue) return false;
    this.queue.push(this.buildTime);
    return true;
  }

  /** 큐 선두 진행. 완료된 만큼 onProduce 호출(스폰은 코디네이터가). */
  update(dt: number, onProduce: () => void): void {
    if (this.queue.length === 0) return;
    this.queue[0] -= dt;
    while (this.queue.length > 0 && this.queue[0] <= 0) {
      this.queue.shift();
      onProduce();
    }
  }

  /** 생산 완료 일꾼이 튀어나올 스폰 지점(HQ 칸 중심). */
  spawnPoint(): { x: number; y: number } {
    return cellCenter(this.cx, this.cy);
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { x, y } = cellToPixel(this.cx, this.cy);
    // 코어 리액터 — 아군 시안 / 적 레드(tileSprites, 시간 기반 펄스·회전 링).
    const center = cellCenter(this.cx, this.cy);
    drawReactor(ctx, center.x, center.y, this.side === 'player' ? 'cyan' : 'red');

    // HP바(모서리 둥근 세련된 바).
    const ratio = this.hp / this.maxHp;
    const barW = TILE - 4;
    drawHpBar(ctx, x + 2, y - HP_BAR_GAP - HP_BAR_H, barW, HP_BAR_H, ratio, this.side === 'player' ? COLOR_HP : COLOR_HP_ENEMY);
  }

  /** 선택 시 강조 테두리(읽기 전용). */
  renderSelected(ctx: CanvasRenderingContext2D): void {
    const { x, y } = cellToPixel(this.cx, this.cy);
    ctx.save();
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
    ctx.restore();
  }
}

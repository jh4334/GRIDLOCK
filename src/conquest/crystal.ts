// 크리스탈 채집지 — 한 칸을 차지하는 통행·건설 불가 자원 노드.
// 매장량(amount)이 0이 되면 고갈. 일꾼이 amount에서 채집량만큼 덜어 간다.
// render는 읽기 전용(다이아몬드형 + 잔량 비율에 따른 밝기).

import { cellCenter } from '../game/grid';
import { drawCrystal } from '../render/tileSprites';

export class Crystal {
  readonly cx: number;
  readonly cy: number;
  readonly maxAmount: number;
  amount: number;

  constructor(cx: number, cy: number, amount: number) {
    this.cx = cx;
    this.cy = cy;
    this.amount = amount;
    this.maxAmount = amount;
  }

  get depleted(): boolean {
    return this.amount <= 0;
  }

  /** 최대 want만큼 채집해 실제 덜어낸 양을 돌려준다(잔량보다 크면 잔량만큼). */
  extract(want: number): number {
    const got = Math.min(want, this.amount);
    this.amount -= got;
    return got;
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (this.depleted) return;
    const { x, y } = cellCenter(this.cx, this.cy);
    // 민트 발광 다이아 — 잔량 비율로 밝기, 시간 기반 빛 펄스(tileSprites).
    drawCrystal(ctx, x, y, this.amount / this.maxAmount);
  }
}

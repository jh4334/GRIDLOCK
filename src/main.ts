import { GameLoop } from './core/loop';
import { MouseInput } from './core/input';
import { FpsCounter } from './debug/fps';
import { Grid, TILE, cellToPixel, pixelToCell } from './game/grid';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D context를 얻을 수 없습니다.');

const fps = new FpsCounter();
const input = new MouseInput(canvas);
const grid = new Grid();

// update에서 계산한 호버 칸. 그리드 밖이면 null. render는 이 값을 읽기만 한다.
let hoverCell: { cx: number; cy: number } | null = null;

const COLOR_HOVER = 'rgba(255, 255, 255, 0.18)';

function update(dt: number): void {
  fps.update(dt);

  if (input.isInside) {
    const { cx, cy } = pixelToCell(input.x, input.y);
    hoverCell = grid.inBounds(cx, cy) ? { cx, cy } : null;
  } else {
    hoverCell = null;
  }
}

function renderHover(c: CanvasRenderingContext2D): void {
  if (!hoverCell) return;
  const { x, y } = cellToPixel(hoverCell.cx, hoverCell.cy);
  c.fillStyle = COLOR_HOVER;
  c.fillRect(x, y, TILE, TILE);
}

function render(): void {
  ctx!.clearRect(0, 0, canvas.width, canvas.height);
  // 그리드(정적) → 호버 하이라이트 → FPS 순서.
  grid.render(ctx!);
  renderHover(ctx!);
  fps.render(ctx!);
}

const loop = new GameLoop({ update, render });
loop.start();

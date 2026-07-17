import { GameLoop } from './core/loop';
import { FpsCounter } from './debug/fps';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D context를 얻을 수 없습니다.');

const fps = new FpsCounter();

function update(dt: number): void {
  fps.update(dt);
}

function render(): void {
  ctx!.clearRect(0, 0, canvas.width, canvas.height);
  fps.render(ctx!);
}

const loop = new GameLoop({ update, render });
loop.start();

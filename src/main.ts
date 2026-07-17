import { GameLoop } from './core/loop';
import { MouseInput, Keyboard } from './core/input';
import { FpsCounter } from './debug/fps';
import { renderFlowField } from './debug/flowField';
import { DebugSpawner } from './debug/spawnKeys';
import { Grid, TILE, cellToPixel, pixelToCell } from './game/grid';
import { Economy } from './game/economy';
import { computeFlowField } from './systems/pathfinding';
import { Enemy, createEnemy } from './entities/enemy';
import { Hud } from './ui/hud';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D context를 얻을 수 없습니다.');

const fps = new FpsCounter();
const input = new MouseInput(canvas);
const keyboard = new Keyboard();
const grid = new Grid();
const economy = new Economy();
const hud = new Hud();

// 플로우필드는 맵(타워 배치)이 바뀔 때만 재계산한다. M2는 빈 평지라 1회 계산.
// (타워 설치/판매 시 재계산은 M3에서 추가 — DESIGN.md 함정 리스트 5번.)
let flowField = computeFlowField(grid);

// 적 배열. 죽거나 기지 도달한 엔티티는 프레임 끝에 filter로 일괄 제거.
let enemies: Enemy[] = [];

const spawner = new DebugSpawner(keyboard, (kind) => {
  enemies.push(createEnemy(kind, flowField));
});

// update에서 계산한 호버 칸. 그리드 밖이면 null. render는 이 값을 읽기만 한다.
let hoverCell: { cx: number; cy: number } | null = null;

// 플로우필드 디버그 오버레이 토글(D키). render는 이 플래그만 읽는다.
let showFlowDebug = false;
keyboard.on('d', () => {
  showFlowDebug = !showFlowDebug;
});

const COLOR_HOVER = 'rgba(255, 255, 255, 0.18)';

function update(dt: number): void {
  fps.update(dt);
  spawner.update(dt);

  if (input.isInside) {
    const { cx, cy } = pixelToCell(input.x, input.y);
    hoverCell = grid.inBounds(cx, cy) ? { cx, cy } : null;
  } else {
    hoverCell = null;
  }

  for (const e of enemies) e.update(dt, flowField);

  // 기지 도달 적 → 라이프 1 감소.
  for (const e of enemies) {
    if (e.reachedBase) economy.loseLife(1);
  }

  // 죽었거나 기지 도달한 엔티티 일괄 제거.
  enemies = enemies.filter((e) => !e.dead && !e.reachedBase);
}

function renderHover(c: CanvasRenderingContext2D): void {
  if (!hoverCell) return;
  const { x, y } = cellToPixel(hoverCell.cx, hoverCell.cy);
  c.fillStyle = COLOR_HOVER;
  c.fillRect(x, y, TILE, TILE);
}

function render(): void {
  ctx!.clearRect(0, 0, canvas.width, canvas.height);
  // 그리드(정적) → 플로우필드 디버그 → 호버 → 적 → HUD → FPS 순서.
  grid.render(ctx!);
  if (showFlowDebug) renderFlowField(ctx!, flowField);
  renderHover(ctx!);
  for (const e of enemies) e.render(ctx!);
  hud.render(ctx!, economy);
  fps.render(ctx!);
}

const loop = new GameLoop({ update, render });
loop.start();

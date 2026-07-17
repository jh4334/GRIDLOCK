// 유닛 스프라이트 — 병사/전투유닛(진영색 코어 + 방향 쉐브론), 일꾼(앰버 코어 + 수집 클로).
// 로드 시 1회 프리렌더, 매 프레임 drawImage(facing 회전)만. key: 'unit/trooper/<team>', 'unit/worker'.
// PNG 교체는 setSprite로 같은 key. 진영: 'ally'=시안/블루, 'foe'=레드/오렌지.

import { createSpriteCanvas, defineSprite, getSprite } from './sprites';
import { withAlpha, MINT } from './palette';

export type Team = 'ally' | 'foe';

const TEAM: Record<Team, { body: string; core: string; chevron: string }> = {
  ally: { body: '#4d8dff', core: '#cfe8ff', chevron: '#aef0ff' },
  foe: { body: '#ff6a4d', core: '#ffd7c8', chevron: '#ffc2a8' },
};

const BASE_R = 11; // 프리렌더 기준 반경(그릴 때 실제 radius로 스케일).
const PAD = 5;
const SIZE = (BASE_R + PAD) * 2;

for (const team of Object.keys(TEAM) as Team[]) defineSprite(`unit/trooper/${team}`, () => buildTrooper(team));
for (const team of Object.keys(TEAM) as Team[]) defineSprite(`unit/artillery/${team}`, () => buildArtillery(team));
defineSprite('unit/worker', () => buildWorker());

function buildTrooper(team: Team): HTMLCanvasElement {
  const { canvas, ctx } = createSpriteCanvas(SIZE, SIZE);
  const c = SIZE / 2;
  const { body, core, chevron } = TEAM[team];

  // 외곽 글로우.
  const g = ctx.createRadialGradient(c, c, 1, c, c, BASE_R + PAD);
  g.addColorStop(0, withAlpha(body, 0.45));
  g.addColorStop(1, withAlpha(body, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, BASE_R + PAD, 0, Math.PI * 2);
  ctx.fill();

  // 몸통.
  ctx.fillStyle = body;
  ctx.strokeStyle = withAlpha('#0a1424', 0.8);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(c, c, BASE_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 발광 코어.
  const cg = ctx.createRadialGradient(c, c, 0, c, c, BASE_R * 0.7);
  cg.addColorStop(0, core);
  cg.addColorStop(1, withAlpha(body, 0));
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.arc(c, c, BASE_R * 0.65, 0, Math.PI * 2);
  ctx.fill();

  // 방향 쉐브론(앞쪽 +x, 꺾인 화살표).
  ctx.strokeStyle = chevron;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(c - 1, c - BASE_R * 0.55);
  ctx.lineTo(c + BASE_R * 0.7, c);
  ctx.lineTo(c - 1, c + BASE_R * 0.55);
  ctx.stroke();
  return canvas;
}

// 포격 전차 벡터 폴백 — 병사와 구분되게 각진 차체 + 앞으로 뻗은 긴 포신 + 이중 쉐브론(원거리 표식).
function buildArtillery(team: Team): HTMLCanvasElement {
  const { canvas, ctx } = createSpriteCanvas(SIZE, SIZE);
  const c = SIZE / 2;
  const { body, core, chevron } = TEAM[team];

  // 외곽 글로우.
  const g = ctx.createRadialGradient(c, c, 1, c, c, BASE_R + PAD);
  g.addColorStop(0, withAlpha(body, 0.45));
  g.addColorStop(1, withAlpha(body, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, BASE_R + PAD, 0, Math.PI * 2);
  ctx.fill();

  // 긴 포신(앞쪽 +x, 차체 밖으로 돌출) — 포격 전차의 실루엣.
  ctx.strokeStyle = core;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(c, c);
  ctx.lineTo(c + BASE_R + PAD - 1, c);
  ctx.stroke();

  // 각진 차체(둥근 사각) — 병사의 원형과 구분.
  ctx.fillStyle = body;
  ctx.strokeStyle = withAlpha('#0a1424', 0.8);
  ctx.lineWidth = 1.5;
  const s = BASE_R * 0.82;
  ctx.beginPath();
  ctx.rect(c - s, c - s, s * 2, s * 2);
  ctx.fill();
  ctx.stroke();

  // 발광 코어.
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(c, c, BASE_R * 0.38, 0, Math.PI * 2);
  ctx.fill();

  // 이중 쉐브론(원거리 변형 표식).
  ctx.strokeStyle = chevron;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';
  for (const off of [-3, 1]) {
    ctx.beginPath();
    ctx.moveTo(c - 3 + off, c - BASE_R * 0.5);
    ctx.lineTo(c + BASE_R * 0.45 + off, c);
    ctx.lineTo(c - 3 + off, c + BASE_R * 0.5);
    ctx.stroke();
  }
  return canvas;
}

function buildWorker(): HTMLCanvasElement {
  const { canvas, ctx } = createSpriteCanvas(SIZE, SIZE);
  const c = SIZE / 2;
  const amber = '#e0b357';
  // 글로우.
  const g = ctx.createRadialGradient(c, c, 1, c, c, BASE_R + PAD);
  g.addColorStop(0, withAlpha(amber, 0.4));
  g.addColorStop(1, withAlpha(amber, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, BASE_R + PAD, 0, Math.PI * 2);
  ctx.fill();
  // 몸통.
  ctx.fillStyle = amber;
  ctx.strokeStyle = withAlpha('#4a3a12', 0.9);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(c, c, BASE_R * 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // 코어.
  ctx.fillStyle = '#fff0cc';
  ctx.beginPath();
  ctx.arc(c, c, BASE_R * 0.4, 0, Math.PI * 2);
  ctx.fill();
  // 수집 클로(앞쪽 +x 두 갈래 집게).
  ctx.strokeStyle = '#8a6a24';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(c + BASE_R * 0.5, c - 4);
  ctx.lineTo(c + BASE_R + 1, c - 6);
  ctx.moveTo(c + BASE_R * 0.5, c + 4);
  ctx.lineTo(c + BASE_R + 1, c + 6);
  ctx.stroke();
  return canvas;
}

// ── 그리기(매 프레임) ────────────────────────────────────────────
/** 병사/전투유닛 — 진영 코어 + 쉐브론(facing 회전). radius로 스케일. */
export function drawTrooper(ctx: CanvasRenderingContext2D, team: Team, x: number, y: number, facing: number, radius: number): void {
  drawScaledRotated(ctx, getSprite(`unit/trooper/${team}`), x, y, facing, radius / BASE_R);
}

/** 포격 전차 — 긴 포신 실루엣(facing 회전). radius로 스케일. */
export function drawArtillery(ctx: CanvasRenderingContext2D, team: Team, x: number, y: number, facing: number, radius: number): void {
  drawScaledRotated(ctx, getSprite(`unit/artillery/${team}`), x, y, facing, radius / BASE_R);
}

/** 일꾼 — 앰버 코어 + 클로(facing 회전) + 운반 표시(민트 점). */
export function drawWorker(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number, radius: number, carrying: boolean): void {
  drawScaledRotated(ctx, getSprite('unit/worker'), x, y, facing, radius / BASE_R);
  if (carrying) {
    ctx.fillStyle = MINT;
    ctx.beginPath();
    ctx.arc(x, y - radius - 3, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawScaledRotated(ctx: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number, a: number, scale: number): void {
  const w = (img as HTMLCanvasElement).width * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.drawImage(img, -w / 2, -w / 2, w, w);
  ctx.restore();
}

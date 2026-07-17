// 적 스프라이트 — 종별 형태(코어 발광 + 쉘 구조). 이동 방향으로 회전한다.
// 로드 시 1회 프리렌더, 매 프레임 drawImage(facing 회전)만. 팔레트는 마젠타/레드/오렌지 통일.
//
// 스프라이트는 오른쪽(+x, angle 0)을 앞으로 그린다. 렌더 시 enemy.facing 으로 회전.
// key: 'enemy/<kind>'. 보스 회전 링은 'enemy/boss-ring'(독립 회전). PNG 교체는 setSprite로.

import { createSpriteCanvas, defineSprite, getSprite, animTime } from './sprites';
import { withAlpha } from './palette';

export type EnemyVisualKind = 'runner' | 'grunt' | 'tanker' | 'swarm' | 'boss';

// 종별 색(주 색 / 밝은 코어) — 마젠타·레드·오렌지 계열, 명도·형태로 구분.
const COLORS: Record<EnemyVisualKind, { body: string; core: string }> = {
  runner: { body: '#ff7a5c', core: '#ffd9c0' }, // 오렌지 삼각 드론.
  grunt: { body: '#ff4d6a', core: '#ffd0d8' }, // 마젠타 육각.
  tanker: { body: '#b83a4e', core: '#ff8a9a' }, // 짙은 레드 중장갑.
  swarm: { body: '#ff9e6a', core: '#ffe4cc' }, // 밝은 오렌지 소형.
  boss: { body: '#ff2e5a', core: '#ffe0e8' }, // 강렬한 레드 대형.
};

// 프리렌더 캔버스 반쪽 크기(적 반경 + 글로우 여백). 종별 radius(enemies.json)에 여유를 둔다.
const SPRITE_HALF: Record<EnemyVisualKind, number> = { runner: 16, grunt: 19, tanker: 24, swarm: 13, boss: 32 };

for (const kind of Object.keys(COLORS) as EnemyVisualKind[]) {
  defineSprite(`enemy/${kind}`, () => buildEnemy(kind));
}
defineSprite('enemy/boss-ring', () => buildBossRing());

function buildEnemy(kind: EnemyVisualKind): HTMLCanvasElement {
  const half = SPRITE_HALF[kind];
  const { canvas, ctx } = createSpriteCanvas(half * 2, half * 2);
  const c = half;
  const { body, core } = COLORS[kind];
  const r = half - 4; // 몸통 반경(글로우 여백 제외).

  // 외곽 글로우.
  const g = ctx.createRadialGradient(c, c, 1, c, c, half);
  g.addColorStop(0, withAlpha(body, 0.5));
  g.addColorStop(1, withAlpha(body, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, half, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = body;
  ctx.strokeStyle = withAlpha('#ffffff', 0.35);
  ctx.lineWidth = 1.5;

  if (kind === 'runner') {
    triangle(ctx, c, c, r);
  } else if (kind === 'grunt') {
    polygon(ctx, c, c, r, 6, 0);
  } else if (kind === 'tanker') {
    // 중장갑 사각 + 트레드(위아래 어두운 띠).
    ctx.fillRect(c - r, c - r * 0.8, r * 2, r * 1.6);
    ctx.strokeRect(c - r, c - r * 0.8, r * 2, r * 1.6);
    ctx.fillStyle = '#5a1c26';
    ctx.fillRect(c - r, c - r * 0.95, r * 2, 4);
    ctx.fillRect(c - r, c + r * 0.6, r * 2, 4);
  } else if (kind === 'swarm') {
    // 소형 마름모.
    polygon(ctx, c, c, r, 4, 0);
  } else {
    // 보스 대형 육각 코어.
    polygon(ctx, c, c, r, 6, Math.PI / 6);
  }
  if (kind !== 'tanker') {
    ctx.fill();
    ctx.stroke();
  }

  // 발광 코어(중심).
  const cg = ctx.createRadialGradient(c, c, 0, c, c, r * 0.55);
  cg.addColorStop(0, core);
  cg.addColorStop(1, withAlpha(body, 0.1));
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.arc(c, c, r * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // 진행 방향 표시 — 앞쪽(+x) 밝은 노치.
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(c + r * 0.55, c, 2, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

function buildBossRing(): HTMLCanvasElement {
  const half = SPRITE_HALF.boss;
  const { canvas, ctx } = createSpriteCanvas(half * 2, half * 2);
  const c = half;
  ctx.strokeStyle = COLORS.boss.body;
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(c, c, half - 3 - i * 5, (i * Math.PI) / 2, (i * Math.PI) / 2 + Math.PI * 1.2);
    ctx.stroke();
  }
  return canvas;
}

// ── 그리기(매 프레임) ────────────────────────────────────────────
/** 적 몸통을 facing 방향으로 회전해 그린다. 보스는 독립 회전 링을 겹친다. */
export function drawEnemy(ctx: CanvasRenderingContext2D, kind: EnemyVisualKind, x: number, y: number, facing: number): void {
  const sprite = getSprite(`enemy/${kind}`);
  const w = (sprite as HTMLCanvasElement).width;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing);
  ctx.drawImage(sprite, -w / 2, -w / 2);
  ctx.restore();
  if (kind === 'boss') {
    const ring = getSprite('enemy/boss-ring');
    const rw = (ring as HTMLCanvasElement).width;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(animTime() * 1.4);
    ctx.drawImage(ring, -rw / 2, -rw / 2);
    ctx.restore();
  }
}

/** 슬로우(감속) 시각 표시 — 하늘색 틴트 오버레이 + 링. (x,y)=중심, r=적 반경. */
export function drawSlowOverlay(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(120, 210, 255, 0.35)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(160, 230, 255, 0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r + 1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function polygon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, sides: number, rot: number): void {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function triangle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(cx + r, cy); // 앞(+x).
  ctx.lineTo(cx - r * 0.7, cy - r * 0.8);
  ctx.lineTo(cx - r * 0.7, cy + r * 0.8);
  ctx.closePath();
}

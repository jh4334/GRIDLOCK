// 타워 스프라이트 — 어두운 베이스 플레이트(팔각) + 종류별 회전 포탑. 베이스·포탑은 로드 시
// 1회 프리렌더하고, 매 프레임은 drawImage(포탑은 aimAngle 회전)만 한다.
//
// 포탑은 오른쪽(+x, angle 0)을 향하도록 그려 두고, 렌더 시 tower.aimAngle 로 회전한다.
// 레벨 마커·선택 링·사거리 원은 가벼운 벡터 오버레이(타워 수가 적어 저렴).
// 이미지 교체: 'tower/<kind>/base', 'tower/<kind>/turret<1|2|3>' key로 setSprite 하면 스왑된다.

import { TILE } from '../game/grid';
import { createSpriteCanvas, defineSprite, getSprite, drawSprite } from './sprites';
import { withAlpha, PLATE_DARK, PLATE_EDGE, ALLY_CYAN, GOLD } from './palette';

export type TowerVisualKind = 'arrow' | 'cannon' | 'frost' | 'sniper' | 'barracks';

// 종류별 네온 틴트(밸런스 아닌 시각 상수 — json 색과 별개로 아트 디렉션 팔레트 적용).
const TINT: Record<TowerVisualKind, string> = {
  arrow: ALLY_CYAN,
  cannon: '#ffb04d', // 앰버/주황 중포.
  frost: '#8fe6ff', // 하늘색 결정.
  sniper: '#b98cff', // 보라 레일건.
  barracks: '#6c86a8', // 강철 벙커.
};

const S = TILE; // 스프라이트 한 변.
const LEVEL_MARK = GOLD;
const RECOIL_PX = 2; // 발사 반동 시 포신 최대 후퇴 거리(px, 시각 상수).

// ── 프리렌더 등록 ────────────────────────────────────────────────
// 포탑은 레벨 1/2/3 각각 별도 key(turret1/2/3)로 둔다 — 벡터 폴백은 세 레벨 동일하지만,
// 실제 스킨(assetLoader)은 barrel1/2/3 포신으로 교체해 업그레이드 시 포신이 바뀐다.
for (const kind of Object.keys(TINT) as TowerVisualKind[]) {
  defineSprite(`tower/${kind}/base`, () => buildBase(TINT[kind], kind === 'barracks'));
  if (kind !== 'barracks') {
    for (let lvl = 1; lvl <= 3; lvl++) defineSprite(`tower/${kind}/turret${lvl}`, () => buildTurret(kind));
  }
}
defineSprite('tower/barracks/deco', () => buildBunkerDeco());

// 어두운 팔각 베이스 + 네온 테두리(배럭은 사각 벙커 느낌으로 모서리 둥근 사각).
function buildBase(tint: string, square: boolean): HTMLCanvasElement {
  const { canvas, ctx } = createSpriteCanvas(S, S);
  const c = S / 2;
  const r = S * 0.4;
  ctx.fillStyle = PLATE_DARK;
  ctx.strokeStyle = withAlpha(tint, 0.85);
  ctx.lineWidth = 2;
  if (square) {
    roundPath(ctx, c - r, c - r, r * 2, r * 2, 5);
  } else {
    octagonPath(ctx, c, c, r);
  }
  ctx.fill();
  ctx.stroke();
  // 안쪽 어두운 링 + 코어 하이라이트.
  ctx.strokeStyle = PLATE_EDGE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(c, c, r * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  const g = ctx.createRadialGradient(c, c, 1, c, c, r * 0.6);
  g.addColorStop(0, withAlpha(tint, 0.35));
  g.addColorStop(1, withAlpha(tint, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, r * 0.6, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

// 포탑(오른쪽 향함). 종류별 배럴 형태를 달리한다.
function buildTurret(kind: TowerVisualKind): HTMLCanvasElement {
  const { canvas, ctx } = createSpriteCanvas(S, S);
  const c = S / 2;
  const tint = TINT[kind];
  ctx.save();
  ctx.translate(c, c);
  // 공통 회전 허브.
  ctx.fillStyle = '#0f141f';
  ctx.strokeStyle = withAlpha(tint, 0.9);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = tint;
  ctx.strokeStyle = withAlpha('#ffffff', 0.5);
  ctx.lineWidth = 1;
  if (kind === 'arrow') {
    // 트윈 배럴 속사포.
    barrel(ctx, 6, -4, 15, 3);
    barrel(ctx, 6, 4, 15, 3);
  } else if (kind === 'cannon') {
    // 단포신 중포(두꺼운 포구).
    barrel(ctx, 4, 0, 16, 7);
    ctx.fillStyle = '#0f141f';
    ctx.fillRect(18, -4, 4, 8); // 포구 그림자.
  } else if (kind === 'frost') {
    // 결정체 방사기(끝이 넓어지는 노즐).
    ctx.beginPath();
    ctx.moveTo(4, -4);
    ctx.lineTo(16, -8);
    ctx.lineTo(19, 0);
    ctx.lineTo(16, 8);
    ctx.lineTo(4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    // 스나이퍼 롱배럴 레일건(얇고 긺).
    barrel(ctx, 6, 0, 22, 2.5);
    ctx.fillStyle = withAlpha(tint, 0.7);
    ctx.fillRect(6, -1, 8, 2);
  }
  ctx.restore();
  return canvas;
}

function barrel(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, w: number): void {
  ctx.fillRect(x, y - w / 2, len, w);
  ctx.strokeRect(x, y - w / 2, len, w);
}

// 배럭 장식 — 문 + 깃발(포탑 대신).
function buildBunkerDeco(): HTMLCanvasElement {
  const { canvas, ctx } = createSpriteCanvas(S, S);
  const c = S / 2;
  // 문(어두운 아치).
  ctx.fillStyle = '#0d1420';
  roundPath(ctx, c - 7, c - 2, 14, 12, 3);
  ctx.fill();
  ctx.strokeStyle = withAlpha('#8fb4e6', 0.7);
  ctx.lineWidth = 1;
  ctx.stroke();
  // 깃대 + 시안 페넌트.
  ctx.strokeStyle = '#9fb4cc';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(c + 9, c - 12);
  ctx.lineTo(c + 9, c + 6);
  ctx.stroke();
  ctx.fillStyle = ALLY_CYAN;
  ctx.beginPath();
  ctx.moveTo(c + 9, c - 12);
  ctx.lineTo(c + 17, c - 9);
  ctx.lineTo(c + 9, c - 6);
  ctx.closePath();
  ctx.fill();
  return canvas;
}

// ── 그리기(매 프레임) ────────────────────────────────────────────
/**
 * 타워 베이스 + 포탑(aimAngle 회전) + 레벨 마커. (x,y)=칸 중심 픽셀.
 * recoil(0~1)은 발사 반동 진행도 — 포신을 조준 반대 방향으로 최대 RECOIL_PX만큼 밀어 그린다.
 */
export function drawTower(
  ctx: CanvasRenderingContext2D,
  kind: TowerVisualKind,
  level: number,
  x: number,
  y: number,
  aimAngle: number,
  recoil = 0,
): void {
  ctx.drawImage(getSprite(`tower/${kind}/base`), x - S / 2, y - S / 2);
  if (kind === 'barracks') {
    ctx.drawImage(getSprite('tower/barracks/deco'), x - S / 2, y - S / 2);
  } else {
    const lvl = Math.max(1, Math.min(3, level)); // 레벨별 포신(barrel1/2/3) 선택.
    // 발사 반동 — 포신을 조준 반대 방향으로 후퇴시켰다가 recoil이 0으로 감쇠하며 복귀한다.
    const back = recoil * RECOIL_PX;
    const ox = -Math.cos(aimAngle) * back;
    const oy = -Math.sin(aimAngle) * back;
    drawSprite(ctx, `tower/${kind}/turret${lvl}`, x + ox, y + oy, aimAngle);
  }
  drawLevelMarkers(ctx, x, y, level);
}

// 레벨 마커 — 레벨당 상단 모서리에 작은 네온 다이아를 추가(1~3).
function drawLevelMarkers(ctx: CanvasRenderingContext2D, x: number, y: number, level: number): void {
  const top = y - S * 0.4 + 2;
  const start = x - ((level - 1) * 6) / 2;
  ctx.fillStyle = LEVEL_MARK;
  for (let i = 0; i < level; i++) {
    const mx = start + i * 6;
    ctx.beginPath();
    ctx.moveTo(mx, top - 2.5);
    ctx.lineTo(mx + 2.5, top);
    ctx.lineTo(mx, top + 2.5);
    ctx.lineTo(mx - 2.5, top);
    ctx.closePath();
    ctx.fill();
  }
}

/** 4레벨 스페셜 분기 표식(D4.2) — 레벨 마커 우상단에 작은 금색 별. (x,y)=칸 중심. */
export function drawSpecialStar(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const sx = x + S * 0.3; // 레벨 마커(상단 중앙) 오른쪽.
  const sy = y - S * 0.34;
  const rOut = 4;
  const rIn = 1.8;
  ctx.save();
  ctx.fillStyle = GOLD;
  ctx.shadowColor = GOLD;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? rOut : rIn;
    const px = sx + Math.cos(a) * r;
    const py = sy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 선택 네온 링(칸 테두리). (x,y)=칸 좌상단. */
export function drawSelectRing(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.strokeStyle = ALLY_CYAN;
  ctx.shadowColor = ALLY_CYAN;
  ctx.shadowBlur = 8;
  ctx.lineWidth = 2;
  roundPath(ctx, x + 2.5, y + 2.5, TILE - 5, TILE - 5, 6);
  ctx.stroke();
  ctx.restore();
}

/** 선택 시 사거리 원(점선 + 은은한 글로우). (x,y)=칸 중심. */
export function drawRangeRing(ctx: CanvasRenderingContext2D, x: number, y: number, range: number): void {
  ctx.save();
  ctx.strokeStyle = withAlpha(ALLY_CYAN, 0.55);
  ctx.shadowColor = withAlpha(ALLY_CYAN, 0.6);
  ctx.shadowBlur = 6;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.arc(x, y, range, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ── 경로 헬퍼 ────────────────────────────────────────────────────
function octagonPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function roundPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

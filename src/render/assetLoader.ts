// 실제 Kenney CC0 스킨 로더 — public/assets/kenney/*.png 를 비동기 로드해, 각 게임 스프라이트
// key 크기·회전 기준에 맞게 오프스크린 캔버스로 전처리한 뒤 setSprite(key, canvas)로 교체한다.
// 로드 전엔 기존 네온 벡터 폴백이 그려지므로 게임은 즉시 실행 가능하고, 로드 실패(404 등)는
// 조용히 벡터 폴백을 유지한다(markAssetsReady를 부르지 않음).
//
// ── 회전 기준 통일 ──────────────────────────────────────────────
// 게임 스프라이트는 전부 동쪽(+x, angle 0)을 앞으로 그리고 렌더에서 facing/aimAngle로 회전한다.
// Kenney 전차/포신은 북(위) 지향이므로 전처리 캔버스에서 +90°(ROT_E) 미리 돌려 동쪽 지향으로 맞춘다.
// ── 포신 피벗 보정 ──────────────────────────────────────────────
// barrel PNG는 마운트(회전축)가 이미지 하단 중앙에 있다. 정사각 캔버스 중앙이 마운트가 되도록
// 하단 중앙을 원점에 배치(bakeBarrel) → drawSprite의 중심 회전이 곧 포탑 회전이 된다.

import { TILE } from '../game/grid';
import { createSpriteCanvas, setSprite, markAssetsReady } from './sprites';
import { ALLY_CYAN, FOE_RED } from './palette';
import { DECAL_KEY, DECAL_SIZE } from './decals';

type Img = HTMLImageElement;
type Canvas = HTMLCanvasElement;

const BASE = 'assets/kenney/'; // document 기준 상대 경로(개발 루트·Pages 하위경로 모두 대응).
const ROT_E = Math.PI / 2; // 북 지향 → 동 지향 보정각(게임 기준각).
const S = TILE; // 칸 한 변(48) — 타워 베이스·건물·타일·본진 캔버스 크기.
const TURRET = 64; // 포탑 캔버스(포신이 칸 밖으로 나와도 잘리지 않도록 여유).

// 사용하는 PNG 목록(확장자 제외) — 반입 에셋과 1:1. 실패 시 전체 폴백 유지.
const FILES = [
  'tankBody_green_outline', 'tankBody_red_outline', 'tankBody_blue_outline', 'tankBody_dark_outline',
  'tankBody_sand_outline', 'tankBody_bigRed_outline', 'tankBody_darkLarge_outline', 'tankBody_huge_outline',
  'tankGreen_barrel1_outline', 'tankGreen_barrel2_outline', 'tankGreen_barrel3_outline',
  'tankRed_barrel1_outline', 'tankRed_barrel2_outline', 'tankRed_barrel3_outline',
  'tankBlue_barrel1_outline', 'tankBlue_barrel2_outline', 'tankBlue_barrel3_outline',
  'tankDark_barrel1_outline', 'tankDark_barrel2_outline', 'tankDark_barrel3_outline',
  'tank_blue', 'tank_red', 'tank_green', 'tank_sand',
  'tileGrass1', 'tileGrass2', 'tileSand1', 'tileSand2', 'tracksDouble', 'tracksSmall',
  'flagRed1', 'flagGreen1', 'flagYellow1', 'gemGreen', 'gemBlue', 'gold_3',
  'laserBlue01', 'laserRed01', 'meteorGrey_tiny1',
  // 동적 도로 경로(디펜스) — 가로/세로 직선 + 코너 4종.
  'tileGrass_roadEast', 'tileGrass_roadNorth',
  'tileGrass_roadCornerUL', 'tileGrass_roadCornerUR', 'tileGrass_roadCornerLL', 'tileGrass_roadCornerLR',
];

function loadImage(name: string): Promise<Img> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(name));
    img.src = BASE + name + '.png';
  });
}

// 최대 변 기준 스케일 계수(가로/세로 비율 유지).
function fit(img: Img, target: number): number {
  return target / Math.max(img.width, img.height);
}

// 이미지를 정사각 캔버스 중앙에 rot 회전·target 크기로 그린다(전차 차체·완성 전차·크리스탈 등).
function bakeCentered(img: Img, size: number, target: number, rot = ROT_E): Canvas {
  const { canvas, ctx } = createSpriteCanvas(size, size);
  const f = fit(img, target);
  ctx.save(); // 변환을 이 함수 안에 가둔다(반환 캔버스 컨텍스트를 다시 그리는 오버레이가 있으므로).
  ctx.translate(size / 2, size / 2);
  ctx.rotate(rot);
  ctx.drawImage(img, (-img.width * f) / 2, (-img.height * f) / 2, img.width * f, img.height * f);
  ctx.restore();
  return canvas;
}

// 포신 — 하단 중앙(마운트)을 캔버스 중앙에 두고 동쪽으로 뻗게 그린다(중심 회전 = 포탑 회전).
function bakeBarrel(img: Img, size: number, f: number): Canvas {
  const { canvas, ctx } = createSpriteCanvas(size, size);
  ctx.translate(size / 2, size / 2);
  ctx.rotate(ROT_E);
  ctx.drawImage(img, (-img.width * f) / 2, -img.height * f, img.width * f, img.height * f);
  return canvas;
}

// 차체+포신 합성(탱커·보스·정복 포탑) — 둘 다 같은 f로, 포신 마운트를 차체 중앙에 맞춘다.
function bakeComposite(body: Img, barrel: Img, size: number, target: number, rot = ROT_E): Canvas {
  const { canvas, ctx } = createSpriteCanvas(size, size);
  const f = fit(body, target);
  ctx.translate(size / 2, size / 2);
  ctx.rotate(rot);
  ctx.drawImage(body, (-body.width * f) / 2, (-body.height * f) / 2, body.width * f, body.height * f);
  ctx.drawImage(barrel, (-barrel.width * f) / 2, -barrel.height * f, barrel.width * f, barrel.height * f);
  return canvas;
}

// 차체(동쪽) + 우상단 깃발 오버레이(본진·배럭). 깃발은 회전 없이 진영 표식으로만.
function bakeFlagOn(body: Img, flag: Img, size: number, bodyTarget: number): Canvas {
  const c = bakeCentered(body, size, bodyTarget);
  const ctx = c.getContext('2d')!;
  const ff = (size * 0.5) / Math.max(flag.width, flag.height);
  ctx.drawImage(flag, size - flag.width * ff, -2, flag.width * ff, flag.height * ff);
  return c;
}

// 궤적(동서로 눕힘) + 레드 깃발 = 스폰 표식.
function bakePortal(tracks: Img, flag: Img, size: number): Canvas {
  const c = bakeCentered(tracks, size, size); // 궤적을 칸에 꽉 차게(동서 방향).
  const ctx = c.getContext('2d')!;
  const ff = (size * 0.62) / Math.max(flag.width, flag.height);
  ctx.drawImage(flag, (size - flag.width * ff) / 2, (size - flag.height * ff) / 2 - 2, flag.width * ff, flag.height * ff);
  return c;
}

// 사막 타일 바탕 + 골드 더미 + 진영 테두리 = 보급고.
function bakeDepot(tile: Img, gold: Img, size: number, edge: string): Canvas {
  const { canvas, ctx } = createSpriteCanvas(size, size);
  ctx.drawImage(tile, 0, 0, size, size);
  const fg = (size * 0.6) / Math.max(gold.width, gold.height);
  ctx.drawImage(gold, (size - gold.width * fg) / 2, (size - gold.height * fg) / 2, gold.width * fg, gold.height * fg);
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2;
  ctx.strokeRect(2.5, 2.5, size - 5, size - 5);
  return canvas;
}

// 투사체 실탄 — len(비행축)×thick 캔버스, 동쪽 지향. vertical=원본이 세로(레이저레드)면 90° 눕힘.
function bakeBolt(img: Img, len: number, thick: number, vertical: boolean): Canvas {
  const { canvas, ctx } = createSpriteCanvas(len, thick);
  if (vertical) {
    ctx.translate(len / 2, thick / 2);
    ctx.rotate(ROT_E);
    ctx.drawImage(img, -thick / 2, -len / 2, thick, len);
  } else {
    ctx.drawImage(img, 0, 0, len, thick);
  }
  return canvas;
}

// 바닥 타일 — 어둑한 틴트를 입혀 "황혼 전장" 톤으로 낮춘다.
// 원색 그대로는 너무 쨍해서 HUD 텍스트·네온 UI 가독성이 떨어진다.
const TILE_DIM = 'rgba(13, 17, 23, 0.42)';

function bakeTile(img: Img, size: number): Canvas {
  const { canvas, ctx } = createSpriteCanvas(size, size);
  ctx.drawImage(img, 0, 0, size, size);
  ctx.fillStyle = TILE_DIM;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

function emptyCanvas(): Canvas {
  return createSpriteCanvas(1, 1).canvas; // 회전 링 등 벡터 연출 제거용(투명 1px).
}

// 잔해 데칼 스탬프 — tracksSmall을 DECAL_SIZE에 맞춰 그린 뒤, 불투명 픽셀에만 어두운 색을
// 덧입혀(source-atop) "굽는다". 매 프레임 재틴트 없이 이 캔버스를 그대로 drawImage한다(D2.5).
function bakeDecal(img: Img): Canvas {
  const { canvas, ctx } = createSpriteCanvas(DECAL_SIZE, DECAL_SIZE);
  const f = fit(img, DECAL_SIZE);
  const w = img.width * f;
  const h = img.height * f;
  ctx.drawImage(img, (DECAL_SIZE - w) / 2, (DECAL_SIZE - h) / 2, w, h);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(6, 8, 12, 0.72)';
  ctx.fillRect(0, 0, DECAL_SIZE, DECAL_SIZE);
  return canvas;
}

// 타워 종류별: 차체(베이스) + 포신(레벨 1/2/3). 포신 f는 차체 f와 동일하게 맞춘다.
const TOWERS: Array<[string, string, string]> = [
  ['arrow', 'tankBody_green_outline', 'tankGreen_barrel'],
  ['cannon', 'tankBody_red_outline', 'tankRed_barrel'],
  ['frost', 'tankBody_blue_outline', 'tankBlue_barrel'],
  ['sniper', 'tankBody_dark_outline', 'tankDark_barrel'],
];

// 투사체 색상 → 실탄 스프라이트(색상 key는 towers.json/conquest.json의 projectileColor와 일치).
function buildProjectiles(I: Record<string, Img>): void {
  setSprite('fx/proj/#e9f5a0', bakeBolt(I['laserBlue01'], 24, 9, false)); // 애로우·정복 아군 포탑.
  setSprite('fx/proj/#e18cff', bakeBolt(I['laserBlue01'], 30, 8, false)); // 스나이퍼(장거리 레이저).
  setSprite('fx/proj/#f0a45a', bakeBolt(I['meteorGrey_tiny1'], 16, 16, false)); // 캐논 포탄.
  setSprite('fx/proj/#bfe8f7', bakeBolt(I['gemBlue'], 15, 15, false)); // 프로스트 결정탄.
  setSprite('fx/proj/#ffcf9a', bakeBolt(I['laserRed01'], 24, 9, true)); // 정복 적 포탑.
  setSprite('fx/proj/#b7f7a0', bakeBolt(I['meteorGrey_tiny1'], 18, 18, false)); // 정복 아군 포격 전차 포탄.
  setSprite('fx/proj/#ff9a6a', bakeBolt(I['meteorGrey_tiny1'], 18, 18, false)); // 정복 적 포격 전차 포탄.
}

// 로드된 이미지들로 전 스프라이트 key를 교체한다.
function applySkin(I: Record<string, Img>): void {
  // 타워 — 차체 베이스 + 레벨별 포신.
  for (const [kind, bodyN, barN] of TOWERS) {
    const body = I[bodyN];
    setSprite(`tower/${kind}/base`, bakeCentered(body, S, 40));
    const f = fit(body, 40);
    for (let lvl = 1; lvl <= 3; lvl++) setSprite(`tower/${kind}/turret${lvl}`, bakeBarrel(I[`${barN}${lvl}_outline`], TURRET, f));
  }
  setSprite('tower/barracks/base', bakeCentered(I['tankBody_sand_outline'], S, 40));
  setSprite('tower/barracks/deco', bakeCentered(I['flagYellow1'], S, 38, 0));

  // 적 — 완성 전차/합성 전차(이동 방향 회전).
  setSprite('enemy/runner', bakeCentered(I['tank_sand'], 32, 30));
  setSprite('enemy/grunt', bakeCentered(I['tank_red'], 38, 36));
  setSprite('enemy/swarm', bakeCentered(I['tank_red'], 26, 24));
  setSprite('enemy/tanker', bakeComposite(I['tankBody_darkLarge_outline'], I['tankDark_barrel1_outline'], 48, 42));
  setSprite('enemy/boss', bakeComposite(I['tankBody_huge_outline'], I['tankDark_barrel3_outline'], 64, 56));

  // 유닛 — 아군/적 전투유닛·일꾼(방향 회전, radius로 스케일됨).
  setSprite('unit/trooper/ally', bakeCentered(I['tank_blue'], 32, 30));
  setSprite('unit/trooper/foe', bakeCentered(I['tank_red'], 32, 30));
  setSprite('unit/worker', bakeCentered(I['tank_green'], 32, 30));

  // 포격 전차 — 전차 차체 + 긴 barrel3 합성(병사와 구분되는 긴 포신 실루엣).
  setSprite('unit/artillery/ally', bakeComposite(I['tankBody_blue_outline'], I['tankBlue_barrel3_outline'], 40, 30));
  setSprite('unit/artillery/foe', bakeComposite(I['tankBody_red_outline'], I['tankRed_barrel3_outline'], 40, 30));

  // 정복 건물 — 포탑(진영색 차체+포신)·배럭(사막 차체+깃발)·보급고(사막 타일+골드).
  setSprite('building/turret/player', bakeComposite(I['tankBody_blue_outline'], I['tankBlue_barrel1_outline'], S, 40, ROT_E));
  setSprite('building/turret/enemy', bakeComposite(I['tankBody_red_outline'], I['tankRed_barrel1_outline'], S, 40, -ROT_E));
  setSprite('building/barracks/player', bakeFlagOn(I['tankBody_sand_outline'], I['flagGreen1'], S, 40));
  setSprite('building/barracks/enemy', bakeFlagOn(I['tankBody_sand_outline'], I['flagRed1'], S, 40));
  setSprite('building/depot/player', bakeDepot(I['tileSand1'], I['gold_3'], S, ALLY_CYAN));
  setSprite('building/depot/enemy', bakeDepot(I['tileSand1'], I['gold_3'], S, FOE_RED));
  // 차량 공장 — 어두운 대형 차체 + 진영 깃발(배럭보다 무거운 실루엣으로 구분).
  setSprite('building/factory/player', bakeFlagOn(I['tankBody_darkLarge_outline'], I['flagGreen1'], S, 42));
  setSprite('building/factory/enemy', bakeFlagOn(I['tankBody_darkLarge_outline'], I['flagRed1'], S, 42));

  // 본진(리액터 key 재사용) — 아군 = 초록 깃발+블루 차체, 적 = 레드 깃발+빅레드 차체. 회전 링 제거.
  setSprite('tile/reactor/cyan', bakeFlagOn(I['tankBody_blue_outline'], I['flagGreen1'], S, 42));
  setSprite('tile/reactor/red', bakeFlagOn(I['tankBody_bigRed_outline'], I['flagRed1'], S, 42));
  setSprite('tile/reactor-ring/cyan', emptyCanvas());
  setSprite('tile/reactor-ring/red', emptyCanvas());

  // 스폰 포털 = 궤적+레드 깃발, 크리스탈 = 초록 젬(펄스 글로우는 tileSprites가 유지).
  setSprite('tile/portal', bakePortal(I['tracksDouble'], I['flagRed1'], S));
  setSprite('tile/portal-ring', emptyCanvas());
  setSprite('tile/crystal', bakeCentered(I['gemGreen'], 44, 34, 0));

  // 바닥 타일(초원·사막, tile1/2 변주).
  setSprite('tile/floor/grass1', bakeTile(I['tileGrass1'], S));
  setSprite('tile/floor/grass2', bakeTile(I['tileGrass2'], S));
  setSprite('tile/floor/sand1', bakeTile(I['tileSand1'], S));
  setSprite('tile/floor/sand2', bakeTile(I['tileSand2'], S));

  // 동적 도로 경로 타일 — 바닥 타일과 동일하게 48px + TILE_DIM 틴트로 구움.
  setSprite('tile/road/h', bakeTile(I['tileGrass_roadEast'], S));
  setSprite('tile/road/v', bakeTile(I['tileGrass_roadNorth'], S));
  setSprite('tile/road/ul', bakeTile(I['tileGrass_roadCornerUL'], S));
  setSprite('tile/road/ur', bakeTile(I['tileGrass_roadCornerUR'], S));
  setSprite('tile/road/ll', bakeTile(I['tileGrass_roadCornerLL'], S));
  setSprite('tile/road/lr', bakeTile(I['tileGrass_roadCornerLR'], S));

  // 적 사망 잔해 데칼 — 어둡게 구운 궤적 스탬프로 벡터 폴백(어두운 원)을 교체.
  setSprite(DECAL_KEY, bakeDecal(I['tracksSmall']));

  buildProjectiles(I);
}

/** 스킨 로드 진입점 — 모든 PNG 로드 후 setSprite로 교체하고 준비 신호를 켠다. 실패 시 폴백 유지. */
export async function loadKenneyAssets(): Promise<void> {
  try {
    const imgs = await Promise.all(FILES.map(loadImage));
    const I: Record<string, Img> = {};
    FILES.forEach((name, i) => (I[name] = imgs[i]));
    applySkin(I);
    markAssetsReady(); // 바닥 정적 레이어 재빌드 + 포털/리액터 스프라이트 경로 활성화.
  } catch (e) {
    console.warn('[assetLoader] Kenney 스킨 로드 실패 — 네온 벡터 폴백 유지', e);
  }
}

// GRIDLOCK 전체 맵 데모 (D7.2) — 디펜스 5개 맵(평원·협곡·쌍둥이 강·폐허 미궁·십자로)을 각각
// 타이틀에서 골라 진입하고, 맵마다 다음 세 가지를 검증한다:
//   1) 맵 선택이 localStorage(gridlock.save.map)에 저장되고 그 맵으로 디펜스가 시작된다.
//   2) 보드 캡처(maps-{id}.png) — 지형 + 우회 도로가 함께 보인다.
//   3) 도로 우회 검증: window.__gridlockTerrain.road(현재 스폰→기지 도로 칸)를 읽어
//      ① 비어있지 않고 스폰(0,7)→기지(19,7)로 이어지며 ② 어떤 도로 칸도 rock/water 위에 놓이지
//      않음(= 도로가 지형을 정확히 우회)을 maps.json 지형과 대조해 확정한다.
//   4) 웨이브 1 시작 가능: 다음 웨이브 버튼이 활성이고, 누르면 진행 상태(data-inprogress)로 전이한다.
//
// 버튼 좌표는 title.ts의 mapButtons 배치(캔버스 960×672, 한 줄 3개 접기)를 그대로 복제해 계산한다.
// 실패 시 어느 맵/단계에서 깨졌는지 stderr 한 줄 + 비-0 종료(runner 감지).

import { chromium } from 'playwright-core';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173/';
const PW_CHROMIUM = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';

const GAME_W = 960, GAME_H = 672, TILE = 48;
const BASE = [19, 7];
const DEFAULT_SPAWNS = [[0, 7]]; // spawns 미정의 맵의 기본 단일 스폰(D7.3, maps.ts와 일치).

// title.ts 레이아웃 상수(맵 버튼) — 코드와 반드시 일치.
const BTN_W = 240, BTN_H = 64, BTN_GAP = 40;
const MBTN_W = 100, MBTN_H = 32, MBTN_GAP = 6, MAPS_PER_ROW = 3;
const DEFENSE_BTN = [GAME_W / 2 - (BTN_W + BTN_GAP / 2) + BTN_W / 2, GAME_H * 0.6]; // 디펜스 버튼 중앙.

// i번째 맵 버튼의 중앙 좌표(캔버스 논리 좌표). title.ts mapButtons와 동일 공식.
function mapButtonCenter(i, total) {
  const defenseX = (GAME_W - (BTN_W * 2 + BTN_GAP)) / 2; // titleButtons.defense.x
  const centerX = defenseX + BTN_W / 2;
  const topY = GAME_H * 0.6 - BTN_H / 2 + BTN_H + 22;
  const row = Math.floor(i / MAPS_PER_ROW), col = i % MAPS_PER_ROW;
  const rowCount = Math.min(MAPS_PER_ROW, total - row * MAPS_PER_ROW);
  const rowW = MBTN_W * rowCount + MBTN_GAP * (rowCount - 1);
  const x = centerX - rowW / 2 + col * (MBTN_W + MBTN_GAP);
  const y = topY + row * (MBTN_H + MBTN_GAP);
  return [x + MBTN_W / 2, y + MBTN_H / 2];
}

let stage = 'init';
function check(cond, msg) { if (!cond) throw new Error(msg); }

async function canvasMapper(page) {
  const box = await page.locator('#game-canvas').boundingBox();
  const s = box.width / GAME_W;
  const pt = (x, y) => [box.x + x * s, box.y + y * s];
  return { box, s, pt };
}

const vis = (page, sel) => page.locator(sel).locator('visible=true').first();

async function waitUntil(page, predicate, timeout = 15000, interval = 200) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await predicate()) return true;
    if (Date.now() >= deadline) return false;
    await page.waitForTimeout(interval);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const maps = JSON.parse(await readFile(join(HERE, '../../src/data/maps.json'), 'utf8')).maps;
  const ids = Object.keys(maps);
  check(ids.length >= 5, `맵이 5개 미만(${ids.length}) — 신규 3맵 추가 실패`);

  const browser = await chromium.launch({ executablePath: PW_CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  try {
    for (let i = 0; i < ids.length; i++) await runMap(page, ids[i], i, ids.length, maps[ids[i]]);
    // D7.3 협공 봉쇄 검사 — 한쪽 스폰만 막는 배치가 거부되는지(협공 맵이 있을 때만).
    const pincerIdx = ids.indexOf('pincer');
    check(pincerIdx >= 0, '협공(pincer) 맵이 maps.json에 없음 — D7.3 신규 맵 추가 실패');
    await pincerBlockade(page, pincerIdx, ids.length);
    stage = 'page-errors';
    check(errors.length === 0, `페이지 런타임 오류 ${errors.length}건: ${errors.join(' | ')}`);
  } finally {
    await browser.close();
  }
}

async function runMap(page, id, index, total, def) {
  stage = `${id}:title`;
  await page.goto(BASE_URL);
  await page.waitForTimeout(1100); // 에셋 로드 대기.
  const { box, s, pt } = await canvasMapper(page);

  // 맵 버튼 클릭 → localStorage 저장 확인.
  stage = `${id}:select`;
  await page.mouse.click(...pt(...mapButtonCenter(index, total)));
  await page.waitForTimeout(120);
  const saved = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('gridlock.save') ?? '{}').map ?? null; } catch { return null; }
  });
  check(saved === id, `맵 선택 저장 실패(기대 ${id}, 실제 ${saved})`);

  // 디펜스 진입 → 인게임 UI + 해당 맵 지형 적용.
  stage = `${id}:enter`;
  await page.mouse.click(...pt(...DEFENSE_BTN));
  await page.waitForTimeout(500);
  check(await vis(page, '.tower-btn').isVisible(), `${id}: 디펜스 진입 후 빌드 메뉴가 안 뜸`);

  // 보드 캡처(지형 + 우회 도로).
  stage = `${id}:capture`;
  await page.screenshot({
    path: join(OUT, `maps-${id}.png`),
    clip: { x: box.x, y: box.y, width: Math.round(GAME_W * s), height: Math.round(14 * TILE * s) },
  });

  // 도로 우회 검증 — 텔레메트리에서 현재 도로 칸을 읽는다(update 몇 프레임 후 발행됨).
  stage = `${id}:road`;
  const gotRoad = await waitUntil(page, async () => {
    const r = await page.evaluate(() => window.__gridlockTerrain?.road ?? null);
    return Array.isArray(r) && r.length > 0;
  }, 5000);
  check(gotRoad, `${id}: 도로 경로 텔레메트리가 비어 있음(경로 없음/봉쇄)`);
  const road = await page.evaluate(() => window.__gridlockTerrain.road);
  const rk = (x, y) => `${x},${y}`;
  const blocked = new Set([...def.terrain.rock, ...def.terrain.water].map(([x, y]) => rk(x, y)));
  const roadSet = new Set(road.map(([x, y]) => rk(x, y)));
  // D7.3: 복수 스폰(협공)이면 모든 스폰이 도로 시작점으로 존재해야 한다(spawns 미정의면 기본 단일).
  const spawns = def.spawns ?? DEFAULT_SPAWNS;
  for (const [sx, sy] of spawns) {
    check(roadSet.has(rk(sx, sy)), `${id}: 도로가 스폰(${sx},${sy})에서 시작하지 않음`);
  }
  check(roadSet.has(rk(...BASE)), `${id}: 도로가 기지(19,7)에 도달하지 않음`);
  const onTerrain = road.filter(([x, y]) => blocked.has(rk(x, y)));
  check(onTerrain.length === 0, `${id}: 도로 ${onTerrain.length}칸이 지형(rock/water) 위에 놓임 → 우회 실패`);

  // 웨이브 1 시작 가능 — 다음 웨이브 버튼 활성 → 클릭 → 진행 상태 전이.
  stage = `${id}:wave`;
  const nextBtn = vis(page, '.next-wave-btn');
  check(await nextBtn.isEnabled(), `${id}: 웨이브 시작 전 다음 웨이브 버튼이 비활성`);
  await nextBtn.click();
  const started = await waitUntil(page, async () => (await nextBtn.getAttribute('data-inprogress')) === 'true', 6000);
  check(started, `${id}: 다음 웨이브를 눌러도 웨이브가 시작되지 않음`);

  process.stdout.write(`[maps-all] ${id}: spawns=${spawns.length}, road=${road.length}칸, 지형우회 OK, 웨이브1 시작 OK\n`);
}

// 협공(pincer) 전용 봉쇄 검사(D7.3) — 상단 스폰(0,2)만 완전히 막는 배치가 거부되는지 확인한다.
// 하단 스폰(0,11)은 여전히 도달 가능하지만, isPathClear는 "모든 스폰" 도달성을 요구하므로 거부되어야 한다.
async function pincerBlockade(page, index, total) {
  stage = 'pincer:blockade-enter';
  await page.goto(BASE_URL);
  await page.waitForTimeout(1100);
  const { pt } = await canvasMapper(page);
  const cell = (cx, cy) => pt(cx * TILE + TILE / 2, cy * TILE + TILE / 2);

  await page.mouse.click(...pt(...mapButtonCenter(index, total)));
  await page.waitForTimeout(120);
  await page.mouse.click(...pt(...DEFENSE_BTN));
  await page.waitForTimeout(500);
  check(await vis(page, '.tower-btn').isVisible(), 'pincer: 디펜스 진입 후 빌드 메뉴가 안 뜸');

  const selectArrow = () => vis(page, '.tower-btn:has-text("애로우")').click();
  const placeAt = async (cx, cy) => { await page.mouse.click(...cell(cx, cy)); await page.waitForTimeout(150); };

  // 상단 스폰(0,2)의 세 출구는 (0,1)·(0,3)·(1,2). 앞의 둘을 막고 마지막 (1,2) 설치를 시도하면
  // 상단 스폰이 완전 봉쇄되므로(하단 스폰은 멀쩡해도) 거부되어야 한다.
  stage = 'pincer:blockade-build';
  await selectArrow();
  await placeAt(0, 1);
  await placeAt(0, 3);
  await placeAt(1, 2); // 거부 대상.
  await page.screenshot({ path: join(OUT, 'maps-pincer-blockade.png') });

  // 판정: 우클릭으로 설치 모드 취소 후 (1,2) 클릭 → 타워가 없어 정보 패널이 안 떠야 한다(거부됨).
  stage = 'pincer:blockade-verify';
  await page.mouse.click(...cell(1, 2), { button: 'right' });
  await page.waitForTimeout(100);
  await page.mouse.click(...cell(1, 2));
  await page.waitForTimeout(150);
  check(!(await vis(page, '.tower-panel').isVisible().catch(() => false)), 'pincer: 한쪽 스폰 봉쇄 칸(1,2)에 타워가 설치됨(거부 실패)');

  // 양성 대조: 실제 설치된 (0,1)을 클릭하면 패널이 떠야 선택 판정이 유효.
  await page.mouse.click(...cell(0, 1));
  await page.waitForTimeout(150);
  check(await vis(page, '.tower-panel').isVisible(), 'pincer: 설치된 타워(0,1) 선택 시 패널 미표시(판정 신뢰 불가)');
  process.stdout.write('[maps-all] pincer: 한쪽 스폰만 막는 배치 거부 OK\n');
}

main().catch((err) => {
  process.stderr.write(`[maps-all] FAIL @ ${stage}: ${err.message}\n`);
  process.exit(1);
});

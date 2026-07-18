// GRIDLOCK 랜덤 맵 데모 (D7.5) — 시드 절차 생성의 재현성·도달성·진입 표기를 검증한다.
//
// 페이지에 노출된 생성기(window.__gridlockGen)를 page.evaluate로 직접 호출해 캔버스 밖에서
// 결정적 로직만 떼어 검증한다(vite 빌드 산출물·tsx 없이 가장 단순한 경로):
//   1) 재현성: 같은 시드 2회 생성 → terrain deep-equal.
//   2) 도달성: 연속 시드 10개 생성 → 각 결과의 모든 스폰이 기지(19,7)로 BFS 도달(테스트 측 독립 BFS).
//   3) 오늘의 맵 진입: 타이틀 '오늘의 맵' 버튼 → 디펜스 진입 → HUD에 시드(#YYYYMMDD) 표기 캡처.
//
// 실패 시 어느 단계에서 깨졌는지 stderr 한 줄 + 비-0 종료(runner 감지).

import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173/';
const PW_CHROMIUM = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';

const GAME_W = 960, GAME_H = 672;
const COLS = 20, ROWS = 14, BASE = [19, 7];

// title.ts 레이아웃 상수(맵 버튼) — 코드와 반드시 일치. 8맵(고정 6 + 랜덤·오늘의 맵) 기준.
const BTN_W = 240, BTN_H = 64, BTN_GAP = 40;
const MBTN_W = 100, MBTN_H = 32, MBTN_GAP = 6, MAPS_PER_ROW = 3;
const TOTAL_MAPS = 8; // 고정 6 + 랜덤 + 오늘의 맵.
const RANDOM_IDX = 6, DAILY_IDX = 7;
const DEFENSE_BTN = [GAME_W / 2 - (BTN_W + BTN_GAP / 2) + BTN_W / 2, GAME_H * 0.6];

// i번째 맵 버튼의 중앙(캔버스 논리 좌표) — title.ts mapButtons 공식 복제.
function mapButtonCenter(i, total) {
  const defenseX = (GAME_W - (BTN_W * 2 + BTN_GAP)) / 2;
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
  return { box, pt: (x, y) => [box.x + x * s, box.y + y * s] };
}
const vis = (page, sel) => page.locator(sel).locator('visible=true').first();

// 테스트 측 독립 BFS — 반환된 지형(rock/water=벽)에서 기지→모든 스폰 도달성 확인.
function allReachable(terrain, spawns) {
  const wall = new Uint8Array(COLS * ROWS);
  for (const [x, y] of terrain.rock) wall[y * COLS + x] = 1;
  for (const [x, y] of terrain.water) wall[y * COLS + x] = 1;
  const dist = new Int32Array(COLS * ROWS).fill(-1);
  const bi = BASE[1] * COLS + BASE[0];
  if (wall[bi]) return false;
  const q = [bi]; dist[bi] = 0; let head = 0;
  const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  while (head < q.length) {
    const cur = q[head++], cx = cur % COLS, cy = (cur - cx) / COLS;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      const ni = ny * COLS + nx;
      if (wall[ni] || dist[ni] !== -1) continue;
      dist[ni] = dist[cur] + 1; q.push(ni);
    }
  }
  return spawns.every((s) => dist[s.cy * COLS + s.cx] >= 0);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: PW_CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  try {
    stage = 'load';
    await page.goto(BASE_URL);
    await page.waitForTimeout(1100);
    const genReady = await page.evaluate(() => typeof window.__gridlockGen === 'function');
    check(genReady, '생성기(window.__gridlockGen)가 노출되지 않음');

    // 1) 재현성 — 같은 시드 2회 생성 terrain deep-equal.
    stage = 'reproducibility';
    const SEED = 20260718;
    const [a, b] = await page.evaluate((seed) => {
      const g1 = window.__gridlockGen(seed), g2 = window.__gridlockGen(seed);
      return [JSON.stringify(g1.terrain), JSON.stringify(g2.terrain)];
    }, SEED);
    check(a === b, `같은 시드(${SEED}) 2회 생성 결과가 다름 → 재현성 실패`);
    process.stdout.write(`[randgen] 재현성 OK — 시드 ${SEED} 2회 terrain 동일\n`);

    // 2) 도달성 — 연속 시드 10개 전부 모든 스폰이 기지 도달.
    stage = 'reachability';
    const results = await page.evaluate(() => {
      const out = [];
      for (let seed = 1000; seed < 1010; seed++) out.push(window.__gridlockGen(seed));
      return out;
    });
    check(results.length === 10, `연속 시드 생성 개수 불일치(${results.length})`);
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      check(allReachable(r.terrain, r.spawns), `시드 ${1000 + i}: 스폰→기지 도달성 실패`);
    }
    process.stdout.write('[randgen] 도달성 OK — 연속 10시드 전부 모든 스폰 도달\n');

    // 3) 오늘의 맵 진입 — 버튼 선택 → 저장 확인 → 디펜스 진입 → 시드 표기 캡처.
    stage = 'daily-enter';
    const { box, pt } = await canvasMapper(page);
    await page.mouse.click(...pt(...mapButtonCenter(DAILY_IDX, TOTAL_MAPS)));
    await page.waitForTimeout(120);
    const savedMap = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('gridlock.save') ?? '{}').map ?? null; } catch { return null; }
    });
    check(savedMap === 'daily', `오늘의 맵 선택 저장 실패(기대 daily, 실제 ${savedMap})`);

    await page.mouse.click(...pt(...DEFENSE_BTN));
    await page.waitForTimeout(500);
    check(await vis(page, '.tower-btn').isVisible(), '오늘의 맵: 디펜스 진입 후 빌드 메뉴가 안 뜸');
    // 진입한 맵도 도달 가능해야 도로가 깔린다 — 도로 텔레메트리로 확인.
    const road = await page.evaluate(() => window.__gridlockTerrain?.road ?? []);
    check(Array.isArray(road) && road.length > 0, '오늘의 맵: 도로 경로가 비어 있음(도달 불가/봉쇄)');
    await page.screenshot({ path: join(OUT, 'randgen-daily.png'), clip: { x: box.x, y: box.y, width: Math.round(box.width), height: Math.round(box.height) } });
    process.stdout.write(`[randgen] 오늘의 맵 진입 OK — 도로 ${road.length}칸, 시드 HUD 표기 캡처\n`);

    // 랜덤 맵도 진입 가능 확인(새 시드 생성 경로).
    stage = 'random-enter';
    await page.goto(BASE_URL);
    await page.waitForTimeout(800);
    const m2 = await canvasMapper(page);
    await page.mouse.click(...m2.pt(...mapButtonCenter(RANDOM_IDX, TOTAL_MAPS)));
    await page.waitForTimeout(120);
    const savedRandom = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('gridlock.save') ?? '{}').map ?? null; } catch { return null; }
    });
    check(savedRandom === 'random', `랜덤 맵 선택 저장 실패(기대 random, 실제 ${savedRandom})`);
    await page.mouse.click(...m2.pt(...DEFENSE_BTN));
    await page.waitForTimeout(500);
    check(await vis(page, '.tower-btn').isVisible(), '랜덤 맵: 디펜스 진입 후 빌드 메뉴가 안 뜸');
    process.stdout.write('[randgen] 랜덤 맵 진입 OK\n');

    stage = 'page-errors';
    check(errors.length === 0, `페이지 런타임 오류 ${errors.length}건: ${errors.join(' | ')}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  process.stderr.write(`[randgen] FAIL @ ${stage}: ${err.message}\n`);
  process.exit(1);
});

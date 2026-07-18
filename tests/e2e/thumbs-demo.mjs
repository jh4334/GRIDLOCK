// GRIDLOCK 썸네일 카드 데모 (D7.6) — 타이틀 맵 선택이 버튼 나열에서 썸네일 카드 그리드로
// 개편됐음을 검증한다:
//   1) 타이틀 카드 그리드 전체 캡처(디펜스 4열×2행 + 정복 3카드).
//   2) 카드 클릭 → 선택 하이라이트 이동(다른 카드로 옮겨가며 localStorage에 저장) 캡처.
//   3) 선택 카드로 진입 → 해당 맵이 실제 로드됨을 지형(물 칸 설치 거부)으로 확인.
//   4) 정복 카드도 같은 컴포넌트로 선택·저장됨을 확인.
//
// 좌표는 titleCoords.mjs(= titleButtons/mapCards 레이아웃)에서 계산한다.
// 실패 시 어느 단계에서 깨졌는지 stderr 한 줄 + 비-0 종료(runner가 감지).

import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEFENSE_BTN, defenseCardCenter, conquestCardCenter, GAME_W, TILE } from './titleCoords.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173/';
const PW_CHROMIUM = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';

// 디펜스 카드 순서: classic0·canyon1·twinriver2·ruins3·crossroads4·pincer5·random6·daily7.
const CARD_CROSSROADS = 4;
const CARD_TWINRIVER = 2;
// 정복 카드 순서: standard0·ridge1·quadrant2.
const CARD_RIDGE = 1;

let stage = 'init';
function check(cond, msg) { if (!cond) throw new Error(msg); }

async function canvasMapper(page) {
  const box = await page.locator('#game-canvas').boundingBox();
  const s = box.width / GAME_W;
  const pt = (x, y) => [box.x + x * s, box.y + y * s];
  const cell = (cx, cy) => pt(cx * TILE + TILE / 2, cy * TILE + TILE / 2);
  return { box, s, pt, cell };
}
const vis = (page, sel) => page.locator(sel).locator('visible=true').first();
const savedMap = (page) => page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('gridlock.save') ?? '{}'); } catch { return {}; }
});

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: PW_CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  try {
    // ── 1) 타이틀 카드 그리드 전체 캡처 ──
    stage = 'title';
    await page.goto(BASE_URL);
    await page.waitForTimeout(1100); // 에셋 로드 대기.
    const { box, pt, cell } = await canvasMapper(page);
    check(!(await page.locator('.next-wave-btn').isVisible()), '타이틀에서 디펜스 UI가 보임(타이틀 상태 아님)');
    await page.screenshot({ path: join(OUT, 'thumbs-demo-01-title.png') });

    // ── 2) 카드 클릭 → 선택 하이라이트 이동 ──
    // 먼저 십자로 카드를 고르고(저장 확인) → 쌍둥이 강 카드로 옮겨(하이라이트 이동) 저장 확인.
    stage = 'select-crossroads';
    await page.mouse.click(...pt(...defenseCardCenter(CARD_CROSSROADS)));
    await page.waitForTimeout(120);
    check((await savedMap(page)).map === 'crossroads', `십자로 카드 선택이 저장되지 않음(실제 ${(await savedMap(page)).map})`);

    stage = 'select-twinriver';
    await page.mouse.click(...pt(...defenseCardCenter(CARD_TWINRIVER)));
    await page.waitForTimeout(120);
    check((await savedMap(page)).map === 'twinriver', `쌍둥이 강으로 선택 이동이 저장되지 않음(실제 ${(await savedMap(page)).map})`);
    await page.screenshot({ path: join(OUT, 'thumbs-demo-02-selected.png') }); // 하이라이트가 쌍둥이 강으로 이동.

    // ── 3) 선택 카드로 진입 → 해당 맵 로드 확인 ──
    stage = 'enter-selected';
    await page.mouse.click(...pt(...DEFENSE_BTN));
    await page.waitForTimeout(600);
    check(await vis(page, '.tower-btn').isVisible(), '진입 후 빌드 메뉴가 보이지 않음');

    // 쌍둥이 강 물 칸(10,5)에 설치 시도 → 거부되면 그 맵 지형이 로드된 것(다른 맵엔 그 물이 없다).
    stage = 'verify-map';
    await vis(page, '.tower-btn:has-text("애로우")').click();
    await page.mouse.click(...cell(10, 5));
    await page.waitForTimeout(150);
    await page.keyboard.press('Escape');
    await page.mouse.click(...cell(10, 5));
    await page.waitForTimeout(150);
    check(
      !(await vis(page, '.tower-panel').isVisible().catch(() => false)),
      '쌍둥이 강 물 칸(10,5) 설치가 거부되지 않음 → 선택한 맵이 로드되지 않음',
    );
    // 도로가 깔렸는지(맵이 정상 로드·도달성 통과)도 확인.
    const road = await page.evaluate(() => window.__gridlockTerrain?.road ?? []);
    check(Array.isArray(road) && road.length > 0, '진입한 맵의 도로가 비어 있음(맵 미로드/봉쇄)');
    await page.screenshot({
      path: join(OUT, 'thumbs-demo-03-loaded.png'),
      clip: { x: box.x, y: box.y, width: Math.round(box.width), height: Math.round(14 * TILE * (box.width / GAME_W)) },
    });
    process.stdout.write(`[thumbs] 카드 선택→진입→맵 로드 OK — 쌍둥이 강 물칸 설치 거부, 도로 ${road.length}칸\n`);

    // ── 4) 정복 카드도 같은 컴포넌트로 선택·저장 ──
    stage = 'conquest-card';
    await page.goto(BASE_URL);
    await page.waitForTimeout(1100);
    const m2 = await canvasMapper(page);
    await page.mouse.click(...m2.pt(...conquestCardCenter(CARD_RIDGE, 3)));
    await page.waitForTimeout(120);
    check((await savedMap(page)).conquestMap === 'ridge', `정복 능선 카드 선택이 저장되지 않음(실제 ${(await savedMap(page)).conquestMap})`);
    process.stdout.write('[thumbs] 정복 카드 선택·저장 OK — 능선\n');

    stage = 'page-errors';
    check(errors.length === 0, `페이지 런타임 오류 ${errors.length}건: ${errors.join(' | ')}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  process.stderr.write(`[thumbs-demo] FAIL @ ${stage}: ${err.message}\n`);
  process.exit(1);
});

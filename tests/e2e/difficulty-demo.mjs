// GRIDLOCK 난이도 데모 (D3.3) — 타이틀에서 정복 난이도를 고르면 그 설정으로 정복이 시작됨을 보인다.
//
// 헤드리스에서 캔버스 HUD 텍스트(카운트다운 숫자)는 직접 못 읽으므로, 다음 두 축으로 검증한다:
//   1) 관찰 가능한 상태: 난이도 버튼 클릭이 localStorage(gridlock.difficulty)에 저장되고,
//      정복 진입 후 인게임 UI(일꾼 생산/빌드 메뉴)가 보인다.
//   2) HUD 캡처 비교: 쉬움 진입 직후·어려움 진입 직후의 좌상단 HUD를 각각 캡처한다. 쉬움은
//      "적 공격까지 160초" 근처, 어려움은 "95초" 근처 — 두 캡처의 카운트다운 숫자가 눈에 띄게 다르다.
//
// 실패 시 어느 단계에서 깨졌는지 stderr 한 줄 + 비-0 종료(runner가 감지).

import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CONQUEST_BTN, DIFF_EASY, DIFF_HARD, GAME_W } from './titleCoords.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173/';
const PW_CHROMIUM = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';

let stage = 'init';

function check(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: PW_CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  try {
    await runDifficulty(page, DIFF_EASY, 'easy', '08-difficulty-easy.png');
    await runDifficulty(page, DIFF_HARD, 'hard', '09-difficulty-hard.png');
    stage = 'page-errors';
    check(errors.length === 0, `페이지 런타임 오류 ${errors.length}건: ${errors.join(' | ')}`);
  } finally {
    await browser.close();
  }
}

async function canvasMapper(page) {
  const box = await page.locator('#game-canvas').boundingBox();
  const s = box.width / GAME_W; // CSS 확대/축소 보정 스케일.
  const pt = (x, y) => [box.x + x * s, box.y + y * s];
  return { box, s, pt };
}

const vis = (page, sel) => page.locator(sel).locator('visible=true').first();

// 한 난이도에 대해: 타이틀 재로드 → 난이도 선택(저장 확인) → 정복 진입(UI 확인) → HUD 캡처.
async function runDifficulty(page, diffBtn, expectId, shot) {
  stage = `${expectId}-title`;
  await page.goto(BASE_URL);
  await page.waitForTimeout(1100); // 에셋 로드 대기(assetsReady).
  const { box, s, pt } = await canvasMapper(page);

  // 난이도 버튼 클릭 → localStorage에 저장되었는지 확인(관찰 가능한 상태 판정).
  stage = `${expectId}-select`;
  await page.mouse.click(...pt(...diffBtn));
  await page.waitForTimeout(150);
  // v2 스키마(D5.2): 개별 키가 아니라 통합 gridlock.save 객체의 difficulty 필드를 본다.
  const saved = await page.evaluate(() => {
    try { return (JSON.parse(localStorage.getItem('gridlock.save') ?? '{}').difficulty) ?? null; }
    catch { return null; }
  });
  check(saved === expectId, `난이도 선택이 저장되지 않음(기대 ${expectId}, 실제 ${saved})`);

  // 정복 진입 → 인게임 UI 노출 확인.
  stage = `${expectId}-enter`;
  await page.mouse.click(...pt(...CONQUEST_BTN));
  await page.waitForTimeout(500);
  check(await vis(page, 'button:has-text("일꾼 생산")').isVisible().catch(() => false)
    || await vis(page, '.tower-btn').isVisible().catch(() => false),
    '정복 진입 후 인게임 UI(일꾼 생산/빌드 메뉴)가 보이지 않음');

  // 좌상단 HUD("적 공격까지 N초 [난이도]") 캡처 — 진입 직후라 카운트다운이 초기값 근처.
  stage = `${expectId}-capture`;
  await page.screenshot({
    path: join(OUT, shot),
    clip: { x: box.x, y: box.y, width: Math.round(360 * s), height: Math.round(60 * s) },
  });
}

main().catch((err) => {
  process.stderr.write(`[difficulty-demo] FAIL @ ${stage}: ${err.message}\n`);
  process.exit(1);
});

// GRIDLOCK 정복 맵 확장 데모 (D7.4) — 정복 3맵(표준/능선/사분면)의 진입·승패 성립을 검증한다.
//
// 시간 절약을 위해 승패 재현은 나눠서 확인한다(DEVELOP.md D7.4):
//   1) 표준(standard): 진입 캡처 + 승리 매크로 1회 재현(경제→배럭 다수→A키 공격 이동으로 적 본진 파괴).
//      매크로 안정성을 위해 난이도는 '쉬움'으로 고정한다(맵 승리 성립 확인이 목적, 밸런스는 D7.7).
//   2) 능선(ridge): 진입 캡처 + 무개입 방치로 패배 도달(적 웨이브가 통로를 넘어 본진 함락).
//   3) 사분면(quadrant): 진입 캡처 + 일꾼 채집으로 크리스탈 증가(보급고 버튼 재활성) 확인.
//
// 승/패 구분은 캔버스 오버레이 색을 픽셀로 읽어 판정한다(승=초록 '정복 성공!', 패=붉은 '본진 함락').
// 실패 시 어느 단계에서 깨졌는지 stderr 한 줄 + 비-0 종료(runner가 감지).

import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CONQUEST_BTN, GAME_W, TILE } from './titleCoords.mjs';

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
    await winStage(page); // 표준: 진입 + 승리 매크로.
    await defeatStage(page); // 능선: 진입 + 방치 패배.
    await harvestStage(page); // 사분면: 진입 + 채집.
    stage = 'page-errors';
    check(errors.length === 0, `페이지 런타임 오류 ${errors.length}건: ${errors.join(' | ')}`);
  } finally {
    await browser.close();
  }
}

// ── 헬퍼 ──────────────────────────────────────────────────────────
async function canvasMapper(page) {
  const box = await page.locator('#game-canvas').boundingBox();
  const s = box.width / GAME_W;
  const pt = (x, y) => [box.x + x * s, box.y + y * s];
  const cell = (cx, cy) => pt(cx * TILE + TILE / 2, cy * TILE + TILE / 2);
  return { box, s, pt, cell };
}
const vis = (page, sel) => page.locator(sel).locator('visible=true').first();

async function waitUntil(page, predicate, timeout = 90000, interval = 400) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await predicate()) return true;
    if (Date.now() >= deadline) return false;
    await page.waitForTimeout(interval);
  }
}

// 지정 맵·난이도로 저장 상태를 세팅하고 정복에 진입한다(깨끗한 판을 보장).
async function enterConquest(page, conquestMap, difficulty) {
  await page.goto(BASE_URL);
  await page.waitForTimeout(300);
  await page.evaluate(
    ({ conquestMap, difficulty }) => {
      localStorage.setItem(
        'gridlock.save',
        JSON.stringify({ v: 2, best: null, endlessBest: 0, audio: null, difficulty, map: 'classic', conquestMap }),
      );
    },
    { conquestMap, difficulty },
  );
  await page.goto(BASE_URL);
  await page.waitForTimeout(1200);
  const m = await canvasMapper(page);
  await page.mouse.click(...m.pt(...CONQUEST_BTN));
  await page.waitForTimeout(500);
  return m;
}

// 승패 오버레이 중앙 텍스트 밴드의 평균 RGB(초록>붉은이면 승리).
async function overlayColor(page) {
  return page.evaluate(() => {
    const cv = document.querySelector('#game-canvas');
    const ctx = cv.getContext('2d');
    const y = Math.round(cv.height / 2 - 20);
    const d = ctx.getImageData(cv.width / 2 - 140, y - 20, 280, 40).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    return { r: r / n, g: g / n, b: b / n };
  });
}

// ── 1) 표준: 진입 + 승리 매크로 ───────────────────────────────────
async function winStage(page) {
  stage = 'standard-enter';
  const { cell } = await enterConquest(page, 'standard', 'easy');
  check(
    await vis(page, '.tower-btn').isVisible().catch(() => false),
    '표준 진입 후 빌드 메뉴가 보이지 않음',
  );
  await page.screenshot({ path: join(OUT, '10-conquest-standard.png') });

  // 경제 시동: HQ(2,11) 선택 → 일꾼 2기 예약 → x3 → 스폰 대기 → 본진 크리스탈 채집.
  stage = 'standard-economy';
  await page.mouse.click(...cell(2, 11));
  await page.waitForTimeout(150);
  const workerBtn = () => vis(page, 'button:has-text("일꾼 생산")');
  for (let i = 0; i < 2; i++) { await workerBtn().click().catch(() => {}); await page.waitForTimeout(120); }
  await vis(page, '.speed-btn:has-text("x3")').click();
  await page.waitForTimeout(3500);

  const dragSelect = async (a, b) => {
    const [x0, y0] = cell(...a);
    const [x1, y1] = cell(...b);
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 6 });
    await page.mouse.move(x1, y1, { steps: 6 });
    await page.mouse.up();
  };
  await dragSelect([0, 8], [6, 13]);
  await page.mouse.click(...cell(4, 9), { button: 'right' });
  await page.waitForTimeout(6000);

  // 배럭 다수 건설 + 전군 A키 공격 이동으로 적 본진(17,2)을 파괴한다. 폴링으로 승리 오버레이 대기.
  stage = 'standard-assault';
  const build = async (cx, cy) => {
    const b = vis(page, '.tower-btn:has-text("배럭")');
    if (!(await b.isEnabled().catch(() => false))) return false;
    await b.click();
    await page.waitForTimeout(80);
    await page.mouse.click(...cell(cx, cy));
    await page.waitForTimeout(120);
    await page.mouse.click(...cell(cx, cy), { button: 'right' }); // 배치 모드 해제.
    await page.waitForTimeout(80);
    return true;
  };
  const barSpots = [[5, 11], [3, 11], [6, 10], [5, 12], [2, 9]];
  let spot = 0;
  let won = false;
  const deadline = Date.now() + 150000;
  while (Date.now() < deadline) {
    if (spot < barSpots.length && (await build(...barSpots[spot]))) spot++;
    await dragSelect([0, 0], [12, 13]); // 좌측 2/3를 크게 드래그해 아군 병력을 전부 선택.
    await page.keyboard.press('a');
    await page.mouse.click(...cell(17, 2)); // 적 본진으로 공격 이동.
    await page.waitForTimeout(4000);
    if (await vis(page, '.restart-btn').isVisible().catch(() => false)) {
      const c = await overlayColor(page);
      won = c.g > c.r + 8;
      break;
    }
  }
  await page.screenshot({ path: join(OUT, '11-conquest-standard-win.png') });
  check(won, '표준 승리 매크로가 적 본진을 파괴하지 못함(승리 오버레이 미도달)');
}

// ── 2) 능선: 진입 + 방치 패배 ─────────────────────────────────────
async function defeatStage(page) {
  stage = 'ridge-enter';
  await enterConquest(page, 'ridge', 'normal');
  check(
    await vis(page, '.tower-btn').isVisible().catch(() => false),
    '능선 진입 후 빌드 메뉴가 보이지 않음',
  );
  await page.screenshot({ path: join(OUT, '12-conquest-ridge.png') });

  // 무개입 방치 — 적 웨이브가 중앙 능선 통로를 넘어 본진을 함락(치트 없음). x3에서 ~50초 실측.
  stage = 'ridge-idle';
  await vis(page, '.speed-btn:has-text("x3")').click();
  const defeated = await waitUntil(
    page,
    async () => await vis(page, '.restart-btn').isVisible().catch(() => false),
    90000,
  );
  check(defeated, '능선 방치 90초 내 본진이 함락되지 않음(패배 미도달)');
  const c = await overlayColor(page);
  check(c.r > c.g + 8, `능선 종료가 패배가 아님(색 r=${c.r.toFixed(0)} g=${c.g.toFixed(0)})`);
  await page.screenshot({ path: join(OUT, '13-conquest-ridge-defeat.png') });
}

// ── 3) 사분면: 진입 + 채집 ────────────────────────────────────────
async function harvestStage(page) {
  stage = 'quadrant-enter';
  const { cell } = await enterConquest(page, 'quadrant', 'normal');
  check(
    await vis(page, '.tower-btn').isVisible().catch(() => false),
    '사분면 진입 후 빌드 메뉴가 보이지 않음',
  );
  await page.screenshot({ path: join(OUT, '14-conquest-quadrant.png') });

  // HQ(2,11) 선택 → 일꾼 2기 생산 → 크리스탈 50(<75)으로 보급고 비활성 → 채집으로 재활성 = 증가 근거.
  stage = 'quadrant-harvest';
  await page.mouse.click(...cell(2, 11));
  await page.waitForTimeout(150);
  const workerBtn = () => vis(page, 'button:has-text("일꾼 생산")');
  for (let i = 0; i < 2; i++) { await workerBtn().click().catch(() => {}); await page.waitForTimeout(150); }
  const depotBtn = () => vis(page, '.tower-btn:has-text("보급고")');
  const broke = await waitUntil(page, async () => await depotBtn().isDisabled().catch(() => false), 5000);
  check(broke, '일꾼 2기 생산 후 보급고 버튼이 비활성이 되지 않음(자원 소비 안 됨)');

  await vis(page, '.speed-btn:has-text("x3")').click();
  await page.waitForTimeout(3500);
  // HQ 주변을 드래그 선택 → 사분면 플레이어 홈 크리스탈(3,11)로 채집 명령.
  const [x0, y0] = cell(0, 9);
  const [x1, y1] = cell(5, 13);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 6 });
  await page.mouse.move(x1, y1, { steps: 6 });
  await page.mouse.up();
  await page.mouse.click(...cell(3, 11), { button: 'right' });

  const recovered = await waitUntil(page, async () => await depotBtn().isEnabled().catch(() => false), 20000);
  check(recovered, '사분면 채집 후 보급고 버튼이 재활성화되지 않음(크리스탈 증가 없음)');
  await page.screenshot({ path: join(OUT, '15-conquest-quadrant-harvest.png') });
}

main().catch((err) => {
  process.stderr.write(`[conquest-maps-demo] FAIL @ ${stage}: ${err.message}\n`);
  process.exit(1);
});

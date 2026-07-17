// GRIDLOCK 두 번째 맵 데모 (D4.4) — 타이틀에서 협곡 맵을 고르면 그 지형으로 디펜스가 시작되고,
// 미리 배치된 바위(건설·통행 불가)가 S자 우회 도로를 강제함을 보인다.
//
// 헤드리스에서 캔버스 픽셀은 직접 못 읽으므로 두 축으로 검증한다:
//   1) 관찰 가능한 상태: 맵 버튼 클릭이 localStorage(gridlock.map='canyon')에 저장되고,
//      정복이 아닌 디펜스 인게임 UI(빌드 메뉴)가 노출된다.
//   2) 기능 판정: 바위 칸(7,7)에 타워 설치를 시도하면 거부되어(타워 없음) 정보 패널이 안 뜨고,
//      바로 옆 빈 칸(2,11) 설치는 성공해 패널이 뜬다 → 거부가 바위 때문임을 대조로 확정.
//   캡처: 협곡 진입 직후 전체 보드(바위 능선 + 우회 도로) → map-demo.png,
//         바위 칸 설치 거부 순간(사유 토스트) → map-demo-reject.png.
//
// 실패 시 어느 단계에서 깨졌는지 stderr 한 줄 + 비-0 종료(runner가 감지).

import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173/';
const PW_CHROMIUM = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';

const GAME_W = 960; // 캔버스 게임 해상도(index.html과 일치). 좌표 환산 기준.
const TILE = 48;

// 타이틀 좌표(캔버스 논리 좌표) — title.ts의 titleButtons/mapButtons 배치와 일치.
const DEFENSE_BTN = [340, 403]; // 디펜스 모드 버튼 중앙.
const MAP_CANYON = [399, 474]; // 맵 2버튼 중 우(협곡).

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
    await runCanyon(page);
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
  const cell = (cx, cy) => pt(cx * TILE + TILE / 2, cy * TILE + TILE / 2);
  return { box, s, pt, cell };
}

const vis = (page, sel) => page.locator(sel).locator('visible=true').first();

async function runCanyon(page) {
  stage = 'title';
  await page.goto(BASE_URL);
  await page.waitForTimeout(1100); // 에셋 로드 대기(assetsReady) — 그 전엔 벡터 폴백만 그려짐.
  const { box, s, pt, cell } = await canvasMapper(page);

  // 협곡 맵 선택 → localStorage 저장 확인(관찰 가능한 상태 판정).
  stage = 'select-canyon';
  await page.mouse.click(...pt(...MAP_CANYON));
  await page.waitForTimeout(150);
  const saved = await page.evaluate(() => localStorage.getItem('gridlock.map'));
  check(saved === 'canyon', `맵 선택이 저장되지 않음(기대 canyon, 실제 ${saved})`);

  // 디펜스 진입 → 협곡 지형 적용 + 인게임 UI 노출.
  stage = 'enter-defense';
  await page.mouse.click(...pt(...DEFENSE_BTN));
  await page.waitForTimeout(600);
  check(await vis(page, '.tower-btn').isVisible(), '디펜스 진입 후 빌드 메뉴가 보이지 않음');

  // 전체 보드 캡처 — 바위 능선(두 세로 줄기) + 우회(S자) 도로가 보여야 한다.
  stage = 'capture-board';
  await page.screenshot({
    path: join(OUT, 'map-demo.png'),
    clip: { x: box.x, y: box.y, width: Math.round(GAME_W * s), height: Math.round(14 * TILE * s) },
  });

  // ── 바위 칸 설치 거부 ──
  // 협곡 바위 능선 A는 (7,0)~(7,8). (7,7)은 바위라 설치가 거부되어야 한다(isCellPlaceable=false).
  stage = 'rock-reject';
  const selectArrow = () => vis(page, '.tower-btn:has-text("애로우")').click();
  const placeAt = async (cx, cy) => { await page.mouse.click(...cell(cx, cy)); await page.waitForTimeout(150); };

  await selectArrow();
  await placeAt(7, 7); // 바위 칸 — 거부(점유 사유 토스트).
  await page.screenshot({ path: join(OUT, 'map-demo-reject.png') });

  // 거부 확정: 설치 모드를 끄고 (7,7)을 클릭 — 타워가 없으니 정보 패널이 뜨지 않아야 한다.
  await page.keyboard.press('Escape');
  await page.mouse.click(...cell(7, 7));
  await page.waitForTimeout(150);
  check(!(await vis(page, '.tower-panel').isVisible().catch(() => false)), '바위 칸(7,7)에 타워가 설치됨(거부 실패)');

  // 대조: 빈 칸(2,11)에는 설치가 성공해 패널이 떠야 거부 판정이 유효하다.
  stage = 'empty-accept';
  await selectArrow();
  await placeAt(2, 11);
  await page.keyboard.press('Escape');
  await page.mouse.click(...cell(2, 11));
  await page.waitForTimeout(150);
  check(await vis(page, '.tower-panel').isVisible(), '빈 칸(2,11) 설치·선택 시 패널이 안 뜸(설치 자체가 실패)');
}

main().catch((err) => {
  process.stderr.write(`[map-demo] FAIL @ ${stage}: ${err.message}\n`);
  process.exit(1);
});

// GRIDLOCK 맵 지형 데모 (D4.4 → D7.1) — 타이틀에서 협곡 맵을 고르면 그 지형으로 디펜스가
// 시작되고, 세 지형(rock·water·rough)이 시각·기능적으로 구분됨을 보인다.
//
// 헤드리스에서 캔버스 픽셀은 직접 못 읽으므로 세 축으로 검증한다:
//   1) 관찰 가능한 상태: 맵 버튼 클릭이 localStorage(gridlock.save.map='canyon')에 저장되고,
//      디펜스 인게임 UI(빌드 메뉴)가 노출된다.
//   2) 지형 기능 판정(설치 가부 대조):
//      - rock (7,7): 설치 거부(장애물) — 패널 안 뜸.
//      - water(3,0): 설치 거부(물)     — 패널 안 뜸.
//      - rough(2,2): 설치 성공(전략 지형) — 패널 뜸. rock/water와 대조로 rough가 건설 가능 지형임을 확정.
//   3) rough 감속 실측: 웨이브를 시작하고 window.__gridlockTerrain(읽기 전용 텔레메트리)에서
//      rough 칸 위에서 감속 중인 적 수(roughSlowed)와 이속 배율(factor)을 읽는다. 협곡은 col7이
//      rock(0~8)+rough(9~13)이라 모든 경로가 rough 통로를 지나므로, 적이 rough 위에서 감속함을
//      roughSlowed≥1 로 실측한다(factor=roughSpeedFactor=0.7 을 함께 기록).
//   캡처: 협곡 진입 직후 전체 보드(세 지형 + 우회 도로) → map-demo.png,
//         물/바위 칸 설치 거부 순간 → map-demo-reject.png,
//         rough 감속 실측 중(적이 rough 통로 통과) → map-demo-rough.png.
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
const MAP_CANYON = [340, 473]; // 맵 버튼 중 협곡(index 1, 5맵 3열 접기 레이아웃 — title.ts mapButtons와 일치).

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

// 조건이 참이 될 때까지 폴링(기본 20초). 시간 초과면 false.
async function waitUntil(page, predicate, timeout = 20000, interval = 200) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await predicate()) return true;
    if (Date.now() >= deadline) return false;
    await page.waitForTimeout(interval);
  }
}

async function runCanyon(page) {
  stage = 'title';
  await page.goto(BASE_URL);
  await page.waitForTimeout(1100); // 에셋 로드 대기(assetsReady) — 그 전엔 벡터 폴백만 그려짐.
  const { box, s, pt, cell } = await canvasMapper(page);

  // 협곡 맵 선택 → localStorage 저장 확인(관찰 가능한 상태 판정).
  stage = 'select-canyon';
  await page.mouse.click(...pt(...MAP_CANYON));
  await page.waitForTimeout(150);
  // v2 스키마(D5.2): 통합 gridlock.save 객체의 map 필드를 본다.
  const saved = await page.evaluate(() => {
    try { return (JSON.parse(localStorage.getItem('gridlock.save') ?? '{}').map) ?? null; }
    catch { return null; }
  });
  check(saved === 'canyon', `맵 선택이 저장되지 않음(기대 canyon, 실제 ${saved})`);

  // 디펜스 진입 → 협곡 지형 적용 + 인게임 UI 노출.
  stage = 'enter-defense';
  await page.mouse.click(...pt(...DEFENSE_BTN));
  await page.waitForTimeout(600);
  check(await vis(page, '.tower-btn').isVisible(), '디펜스 진입 후 빌드 메뉴가 보이지 않음');

  // 전체 보드 캡처 — 세 지형(바위 능선·물·거친땅) + 우회 도로가 보여야 한다.
  stage = 'capture-board';
  await page.screenshot({
    path: join(OUT, 'map-demo.png'),
    clip: { x: box.x, y: box.y, width: Math.round(GAME_W * s), height: Math.round(14 * TILE * s) },
  });

  // ── 지형 기능 판정(설치 가부 대조) ──
  const selectArrow = () => vis(page, '.tower-btn:has-text("애로우")').click();
  const placeAt = async (cx, cy) => { await page.mouse.click(...cell(cx, cy)); await page.waitForTimeout(150); };
  const hasPanel = () => vis(page, '.tower-panel').isVisible().catch(() => false);
  // 설치 후 Escape로 모드 종료 → 해당 칸 클릭 시 패널이 뜨면 설치 성공, 안 뜨면 거부.
  const placedAt = async (cx, cy) => {
    await page.keyboard.press('Escape');
    await page.mouse.click(...cell(cx, cy));
    await page.waitForTimeout(150);
    return hasPanel();
  };

  // rock 칸(7,7): 거부(장애물). placeAt 직후 사유 토스트가 스크린샷에 담긴다.
  stage = 'rock-reject';
  await selectArrow();
  await placeAt(7, 7);
  await page.screenshot({ path: join(OUT, 'map-demo-reject.png') });
  check(!(await placedAt(7, 7)), '바위 칸(7,7)에 타워가 설치됨(거부 실패)');

  // water 칸(3,0): 거부(물) — rock과 동일 취급이어야 한다.
  stage = 'water-reject';
  await selectArrow();
  await placeAt(3, 0);
  check(!(await placedAt(3, 0)), '물 칸(3,0)에 타워가 설치됨(거부 실패)');

  // rough 칸(2,2): 설치 성공(전략 지형) — rock/water 거부와 대조로 rough가 건설 가능 지형임을 확정.
  stage = 'rough-accept';
  await selectArrow();
  await placeAt(2, 2);
  check(await placedAt(2, 2), '거친땅 칸(2,2)에 설치·선택 시 패널이 안 뜸(rough 건설 불가로 판정됨)');
  await page.keyboard.press('Escape');

  // ── rough 감속 실측 ──
  // 웨이브를 x3로 시작하고, 적이 rough 통로(col7 rows9~13)를 지날 때 감속 텔레메트리를 읽는다.
  stage = 'rough-slow';
  const factor = await page.evaluate(() => window.__gridlockTerrain?.factor ?? null);
  check(factor !== null && factor > 0 && factor < 1, `rough 이속 배율 텔레메트리가 유효하지 않음(${factor})`);

  await vis(page, '.speed-btn:has-text("x3")').click();
  const nextBtn = vis(page, '.next-wave-btn');
  check(await nextBtn.isEnabled(), '웨이브 시작 전 다음 웨이브 버튼이 비활성');
  await nextBtn.click();

  // 어느 프레임엔가 rough 위에서 감속 중인 적이 1기 이상 관측되면 rough 감속이 실동작하는 것.
  const peak = { n: 0 };
  const slowed = await waitUntil(page, async () => {
    const n = await page.evaluate(() => window.__gridlockTerrain?.roughSlowed ?? 0);
    if (n > peak.n) peak.n = n;
    if (n >= 1) return true;
    return false;
  }, 25000);
  await page.screenshot({ path: join(OUT, 'map-demo-rough.png') });
  check(slowed, `웨이브 진행 중 rough 위 감속 적이 관측되지 않음(peak=${peak.n})`);

  // 실측 근거를 stdout에 기록(러너 로그로 남는다): 감속 배율 + 관측된 최대 감속 적 수.
  process.stdout.write(`[map-demo] rough 감속 실측: factor=${factor} (평지 대비 ${Math.round(factor * 100)}% 이속), peak rough-slowed enemies=${peak.n}\n`);
}

main().catch((err) => {
  process.stderr.write(`[map-demo] FAIL @ ${stage}: ${err.message}\n`);
  process.exit(1);
});

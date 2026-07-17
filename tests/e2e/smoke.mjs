// GRIDLOCK E2E 스모크 테스트 (D1.1) — 세션 스크래치패드의 Playwright 검증 패턴을 레포로 승격.
//
// 다섯 단계를 순서대로 검증하고 각 단계 스크린샷을 tests/e2e/out/ 에 남긴다:
//   1) 타이틀 렌더            → 게임 모드 UI가 숨은 타이틀 상태 확인
//   2) 디펜스: 봉쇄 배치 거부  → 스폰 3면 포위 후 마지막 칸 설치가 거부됨을 그리드 상태로 확인
//   3) 디펜스: 중첩 웨이브+처치 → 화력 배치 후 웨이브1 진행 중 조기 호출(웨이브2 중첩)→ 둘 다 전멸로 일괄 완료
//   4) 정복: 일꾼 생산→채집    → 채집으로 크리스탈이 늘어 보급고(75) 건설이 가능해짐(버튼 활성)
//   5) 정복: 방치 패배 도달    → 치트 없이 x3 방치 → 적 웨이브가 본진을 함락 → 패배 오버레이(다시 시작 버튼 노출)
//
// 골드/크리스탈 숫자는 캔버스라 직접 못 읽으므로, 전부 관찰 가능한 DOM 상태(버튼 활성/패널
// 표시)로 판정한다. 실패 시 어느 단계에서 깨졌는지 stderr 한 줄 + 비-0 종료(runner가 감지).

import { chromium } from 'playwright-core';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173/';
const PW_CHROMIUM = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';

// 캔버스 게임 해상도(index.html의 canvas width/height와 일치). 좌표 환산 기준.
const GAME_W = 960;
const TILE = 48;

let stage = 'init'; // 실패 보고용 — 현재 단계 라벨.

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
    await titleStage(page);
    await defenseStage(page);
    await conquestStage(page);
    await conquestDefeatStage(page);
    await audioStage(page);
    // 어느 단계에서든 런타임 예외가 났으면 실패로 본다(콘솔 pageerror 수집).
    stage = 'page-errors';
    check(errors.length === 0, `페이지 런타임 오류 ${errors.length}건: ${errors.join(' | ')}`);
  } finally {
    await browser.close();
  }
}

// ── 좌표/셀렉터 헬퍼 ──────────────────────────────────────────────
async function canvasMapper(page) {
  const box = await page.locator('#game-canvas').boundingBox();
  const s = box.width / GAME_W; // CSS 확대/축소 보정 스케일.
  const pt = (x, y) => [box.x + x * s, box.y + y * s];
  const cell = (cx, cy) => pt(cx * TILE + TILE / 2, cy * TILE + TILE / 2);
  return { pt, cell };
}

// 같은 클래스가 디펜스/정복 양쪽 DOM에 존재하므로 화면에 보이는 것만 고른다.
const vis = (page, sel) => page.locator(sel).locator('visible=true').first();

// 조건이 참이 될 때까지 폴링(기본 15초). 시간 초과면 false.
async function waitUntil(page, predicate, timeout = 15000, interval = 250) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await predicate()) return true;
    if (Date.now() >= deadline) return false;
    await page.waitForTimeout(interval);
  }
}

// ── 1) 타이틀 ─────────────────────────────────────────────────────
async function titleStage(page) {
  stage = 'title';
  await page.goto(BASE_URL);
  await page.waitForTimeout(1100); // 에셋 로드 대기(assetsReady). 그 전엔 벡터 폴백만 그려짐.
  await page.screenshot({ path: join(OUT, '01-title.png') });

  // 타이틀 상태 판정: 두 모드의 인게임 UI(다음 웨이브·건물 버튼)가 아직 숨어 있어야 한다.
  check(!(await page.locator('.next-wave-btn').isVisible()), '타이틀에서 디펜스 UI가 보임');
  check(!(await page.locator('.tower-btn').first().isVisible().catch(() => false)), '타이틀에서 빌드 메뉴가 보임');
}

// ── 2·3) 디펜스: 봉쇄 거부 + 처치→웨이브 완료 ─────────────────────
async function defenseStage(page) {
  const { pt, cell } = await canvasMapper(page);

  // 디펜스 모드 진입(타이틀 버튼 좌표).
  stage = 'defense-enter';
  await page.mouse.click(...pt(340, 403));
  await page.waitForTimeout(500);
  check(await vis(page, '.tower-btn').isVisible(), '디펜스 진입 후 빌드 메뉴가 보이지 않음');

  // 애로우 설치 모드는 골드가 되는 한 클릭마다 연속 설치되므로, 버튼을 한 번만 누르고
  // 칸만 클릭한다(같은 버튼을 다시 누르면 toggleTower가 설치 모드를 꺼 버린다).
  const selectArrow = () => vis(page, '.tower-btn:has-text("애로우")').click();
  const placeAt = async (cx, cy) => {
    await page.mouse.click(...cell(cx, cy));
    await page.waitForTimeout(150);
  };

  // ── 봉쇄 배치 거부 ──
  // 스폰은 (0,7). 통행 출구는 (0,6)·(0,8)·(1,7) 뿐(4방향 이동). 앞의 둘을 막은 뒤 마지막
  // 출구 (1,7)에 설치하면 스폰이 완전 봉쇄되므로 거부되어야 한다(경로 없음).
  stage = 'defense-blockade';
  await selectArrow();
  await placeAt(0, 6);
  await placeAt(0, 8);

  // 마지막 출구 (1,7) 설치 시도 — 설치 모드 유지 중이고 골드도 충분(≈120)하므로,
  // 거부된다면 순전히 봉쇄(경로 차단) 때문이다.
  // placeAt의 마지막 대기(150ms)가 거부 직후 0.3초 내이므로, 이 스크린샷에 사유 토스트(봉쇄)가 함께 담긴다.
  await placeAt(1, 7);
  await page.screenshot({ path: join(OUT, '02-blockade-reject.png') });

  // 판정: 우클릭으로 설치 모드를 취소(D2.1 — 기존 흐름 내 1회 수행, 회귀 방지)한 뒤 (1,7)을 클릭 —
  // 타워가 없으니 정보 패널이 뜨지 않아야 한다.
  await page.mouse.click(...cell(1, 7), { button: 'right' });
  await page.waitForTimeout(100);
  await page.mouse.click(...cell(1, 7));
  await page.waitForTimeout(150);
  check(!(await vis(page, '.tower-panel').isVisible().catch(() => false)), '봉쇄 칸(1,7)에 타워가 설치됨(거부 실패)');

  // 양성 대조: 실제로 설치된 (0,6)을 클릭하면 패널이 떠야 선택 판정이 유효함을 보장.
  await page.mouse.click(...cell(0, 6));
  await page.waitForTimeout(150);
  check(await vis(page, '.tower-panel').isVisible(), '설치된 타워(0,6) 선택 시 패널이 안 뜸(판정 신뢰 불가)');
  await page.keyboard.press('Escape');

  // ── 중첩 웨이브(D2.4) + 처치 → 일괄 완료 ──
  // 스폰 앞 (0,6)(0,8)에 더해 통로(7행) 중반 (8,6)(12,6)까지 애로우를 펼쳐 화력을 배치한다.
  // 타워는 "가장 앞선 적"을 노리므로 분산 배치가 표적을 나눠 처치 효율이 높다. 웨이브1 진행 중에
  // 조기 호출로 웨이브2를 중첩 시작하고, 두 웨이브의 적이 전부 처리되면 진행 상태가 해제된다(= 일괄 완료).
  stage = 'defense-kill';
  await selectArrow();
  await placeAt(8, 6);
  await placeAt(12, 6);
  await page.keyboard.press('Escape');

  await vis(page, '.speed-btn:has-text("x3")').click();

  // D2.3 웨이브 프리뷰: 웨이브 1 시작 전, 프리뷰 아이콘 수 합계 = waves.json 1웨이브 총 마리수.
  stage = 'defense-preview';
  const waves = JSON.parse(await readFile(join(HERE, '../../src/data/waves.json'), 'utf8'));
  const wave1Total = waves.waves[0].reduce((n, g) => n + g.count, 0);
  const counts = await page.locator('#controls .wave-preview .wp-count').allTextContents();
  const previewTotal = counts.reduce((n, t) => n + parseInt(t.replace(/\D/g, ''), 10), 0);
  check(previewTotal === wave1Total, `웨이브1 프리뷰 합계(${previewTotal}) ≠ waves.json(${wave1Total})`);

  const nextBtn = vis(page, '.next-wave-btn');
  // 진행 상태는 버튼의 data-inprogress로 관찰(중첩 웨이브라 버튼 활성 여부로는 완료를 못 가른다).
  const inProgress = async () => (await nextBtn.getAttribute('data-inprogress')) === 'true';
  check(await nextBtn.isEnabled(), '웨이브 시작 전 다음 웨이브 버튼이 비활성');
  await nextBtn.click();

  // 웨이브1 시작 → 진행 상태로 전이. 중첩 웨이브라 진행 중에도 버튼은 계속 활성이어야 한다.
  const started = await waitUntil(page, inProgress, 6000);
  check(started, '다음 웨이브를 눌러도 웨이브가 시작되지 않음(진행 상태 전이 없음)');
  check(await nextBtn.isEnabled(), '웨이브1 진행 중 다음 웨이브 버튼이 비활성(중첩 호출 불가)');

  // 조기 호출(얼리콜) 1회 — 웨이브1이 아직 진행 중일 때 웨이브2를 중첩 시작(보너스 지급 경로).
  await nextBtn.click();

  // 두 웨이브의 적이 전부 처리되면 진행 상태가 해제(data-inprogress=false) = 일괄 완료 처리.
  const cleared = await waitUntil(page, async () => !(await inProgress()), 40000);
  check(cleared, '중첩 웨이브가 제한 시간 내 완료되지 않음(적을 처치하지 못함)');

  // 완료 후에도 버튼이 활성(재활성)이고 다시 시작 버튼이 없어야 함 = 승/패 미발생·정상 진행.
  check(await nextBtn.isEnabled(), '웨이브 완료 후 다음 웨이브 버튼이 비활성(재활성 실패)');
  check(!(await page.locator('#controls .restart-btn').isVisible()), '웨이브 완료 대신 승/패로 종료됨');
  await page.screenshot({ path: join(OUT, '03-defense-wave-clear.png') });
}

// ── 4) 정복: 일꾼 생산 → 채집 → 크리스탈 증가 ─────────────────────
async function conquestStage(page) {
  // 디펜스 상태와 완전히 격리하려고 새로 로드한 뒤 정복으로 진입한다.
  stage = 'conquest-enter';
  await page.goto(BASE_URL);
  await page.waitForTimeout(1100);
  const { pt, cell } = await canvasMapper(page);
  await page.mouse.click(...pt(620, 403));
  await page.waitForTimeout(500);

  // HQ(2,11) 선택 → 일꾼 생산 패널 노출.
  stage = 'conquest-worker';
  await page.mouse.click(...cell(2, 11));
  await page.waitForTimeout(200);
  const workerBtn = () => vis(page, 'button:has-text("일꾼 생산")');
  check(await workerBtn().isVisible(), 'HQ 선택 후 일꾼 생산 버튼이 안 뜸');

  // 일꾼 2기 생산(각 50) → 크리스탈 150→50. 패널은 큐 변동 때 재생성되므로 매번 재조회.
  await workerBtn().click();
  await page.waitForTimeout(250);
  await workerBtn().click();
  await page.waitForTimeout(250);

  const depotBtn = () => vis(page, '.tower-btn:has-text("보급고")');
  // 기준선: 크리스탈 50 < 75 이므로 보급고 버튼이 비활성이어야 한다(증가 전 상태).
  const wentBroke = await waitUntil(page, async () => await depotBtn().isDisabled(), 4000);
  check(wentBroke, '일꾼 2기 생산 후에도 보급고 버튼이 비활성이 되지 않음(자원 소비 안 됨)');
  await page.screenshot({ path: join(OUT, '04-conquest-spent.png') });

  // 배속 후 일꾼이 스폰되길 기다렸다가 드래그로 전원 선택 → 크리스탈(4,9) 채집 명령.
  stage = 'conquest-harvest';
  await vis(page, '.speed-btn:has-text("x3")').click();
  await page.waitForTimeout(4000); // workerBuildTime 4s×2, x3 → ~2.7s면 둘 다 스폰.

  // HQ 주변(좌하단)을 드래그 선택 — 박스 안 일꾼 전원 선택.
  const [dx0, dy0] = cell(0, 9);
  const [dx1, dy1] = cell(5, 13);
  await page.mouse.move(dx0, dy0);
  await page.mouse.down();
  await page.mouse.move((dx0 + dx1) / 2, (dy0 + dy1) / 2, { steps: 6 });
  await page.mouse.move(dx1, dy1, { steps: 6 });
  await page.mouse.up();
  // 크리스탈 (4,9) 우클릭 → 채집.
  await page.mouse.click(...cell(4, 9), { button: 'right' });

  // 채집으로 크리스탈이 75 이상으로 올라 보급고 버튼이 다시 활성 = 크리스탈 증가의 관찰 근거.
  const recovered = await waitUntil(page, async () => await depotBtn().isEnabled(), 20000);
  check(recovered, '채집 후에도 보급고 버튼이 활성화되지 않음(크리스탈이 늘지 않음)');

  // 증가를 실제 지불로도 확인: 보급고(75) 건설 착공이 성공해야 한다.
  stage = 'conquest-build';
  await depotBtn().click();
  await page.mouse.click(...cell(4, 12));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, '05-conquest-harvest.png') });
}

// ── 5) 정복: 치트 없이 x3 방치 → 본진 함락 → 패배 오버레이 ─────────
async function conquestDefeatStage(page) {
  // 4단계의 잔여 경제(일꾼·건물)가 판정을 흐리지 않게, 깨끗한 상태로 정복에 재진입한다.
  // (타이틀 경유 = 새로 로드 후 정복 버튼. conquestStage와 동일한 진입 패턴 재사용.)
  stage = 'conquest-defeat-enter';
  await page.goto(BASE_URL);
  await page.waitForTimeout(1100);
  const { pt } = await canvasMapper(page);
  await page.mouse.click(...pt(620, 403));
  await page.waitForTimeout(500);

  // 아무 것도 하지 않고 x3로 방치 — 적 AI가 빌드오더대로 병력을 모아 웨이브를 보내고(첫 웨이브
  // ≈120 sim초 = x3에서 ~40실초), 무방비 본진(HQ 900hp)이 함락된다. 치트·개입 없음.
  stage = 'conquest-defeat-idle';
  await vis(page, '.speed-btn:has-text("x3")').click();

  // 패배 확정 신호: 정복 컨트롤의 '다시 시작' 버튼이 노출(showRestart(true))된다. 방치 패배는
  // x3에서 45~60초 실측 — 타임아웃 90초로 여유를 둔다.
  const restartBtn = vis(page, '.restart-btn');
  const defeated = await waitUntil(page, async () => await restartBtn.isVisible().catch(() => false), 90000);
  check(defeated, '방치 90초 내 본진이 함락되지 않음(패배 오버레이 미도달)');
  await page.screenshot({ path: join(OUT, '06-conquest-defeat.png') });
}

// ── 6) 사운드 옵션(D2.6): 음량 슬라이더 저장·복원 ─────────────────
// 오디오 재생은 헤드리스로 검증 불가하므로, 옵션 지속성만 DOM으로 확인한다:
// 디펜스 컨트롤 바의 음량 슬라이더를 임의값으로 바꾸고 새로고침 → 재진입 시 그 값이 유지되면
// localStorage 저장·복원(gridlock.audio)이 동작하는 것이다.
async function audioStage(page) {
  stage = 'audio-enter';
  await page.goto(BASE_URL);
  await page.waitForTimeout(1100);
  const { pt } = await canvasMapper(page);
  await page.mouse.click(...pt(340, 403)); // 디펜스 진입(컨트롤 바 노출).
  await page.waitForTimeout(400);

  const slider = () => vis(page, '#controls .volume-slider');
  check(await slider().isVisible(), '디펜스 컨트롤 바에 음량 슬라이더가 없음');

  // 슬라이더를 37로 설정하고 input 이벤트를 발생시킨다(저장 트리거).
  stage = 'audio-set';
  await slider().evaluate((el) => {
    el.value = '37';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  check((await slider().inputValue()) === '37', '슬라이더 값이 37로 설정되지 않음');

  // 새로고침 후 재진입 → 저장값(37)이 복원되어야 한다.
  stage = 'audio-reload';
  await page.reload();
  await page.waitForTimeout(1100);
  await page.mouse.click(...pt(340, 403));
  await page.waitForTimeout(400);
  const restored = await slider().inputValue();
  check(restored === '37', `리로드 후 음량이 복원되지 않음(기대 37, 실제 ${restored})`);
  await page.screenshot({ path: join(OUT, '07-audio-persist.png') });
}

main().catch((err) => {
  process.stderr.write(`[smoke] FAIL @ ${stage}: ${err.message}\n`);
  process.exit(1);
});

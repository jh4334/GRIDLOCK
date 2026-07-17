// D3.2 중앙 크리스탈 쟁탈 데모 캡처(수동) — 매장량 차등(본진 300/칸, 중앙 800/칸)과 일꾼의
// 자동 필드 전환을 눈으로 확인하는 스크린샷을 tests/e2e/out/crystal-demo.png 로 남긴다.
// 판정은 하지 않고 연출 확인용 캡처만 찍는다(artillery-demo와 동일 골격).
// 실행: `node tests/e2e/crystal-demo.mjs` (preview 서버가 없으면 직접 띄웠다 정리한다).
//
// 흐름: 정복 진입 → 일꾼 4기 생산 → x3 방치로 본진 필드(4칸×300=1200) 채집·고갈 →
//       일꾼들이 더 먼 중앙 크리스탈(9,6)/(10,7)로 자동 전환해 채집하는 프레임을 연속 캡처.
// 픽셀 프로브로 본진 필드 고갈 시점과 중앙 도달 시점을 실측해 로그로 남긴다.

import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { get } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}/`;
const PW_CHROMIUM = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';

const GAME_W = 960;
const TILE = 48;

// 본진(플레이어) 크리스탈 4칸과 중앙 2칸, 그리고 중앙 채집 시 일꾼이 서는 인접 통행 칸.
const HOME_CELLS = [[4, 9], [5, 9], [4, 10], [5, 10]];
const CENTER_CELLS = [[9, 6], [10, 7]]; // 매장량 800/칸 — 본진 고갈 후에도 한참 살아있다.
// 본진 접근로 방어용 포탑 배치 칸(HQ 2,11의 우상단 길목).
const TURRET_CELLS = [[6, 10], [7, 10], [6, 11]];

function ping(url) {
  return new Promise((resolve) => {
    const req = get(url, (res) => { res.resume(); resolve((res.statusCode ?? 500) < 500); });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => { req.destroy(); resolve(false); });
  });
}
async function waitForServer(url, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await ping(url)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}
async function waitUntil(page, predicate, timeout = 40000, interval = 250) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await predicate()) return true;
    if (Date.now() >= deadline) return false;
    await page.waitForTimeout(interval);
  }
}

// 게임 캔버스의 셀 중심 주변 박스 평균 RGB를 읽는다(내부 픽셀 기준, CSS 스케일 무관).
async function probeCell(page, cx, cy) {
  return page.evaluate(({ cx, cy, tile, gameW }) => {
    const cv = document.querySelector('#game-canvas');
    const ctx = cv.getContext('2d');
    const f = cv.width / gameW; // 내부 해상도 보정.
    const px = Math.round((cx * tile + tile / 2) * f);
    const py = Math.round((cy * tile + tile / 2) * f);
    const half = Math.round(10 * f);
    const d = ctx.getImageData(px - half, py - half, half * 2, half * 2).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    return { r: r / n, g: g / n, b: b / n };
  }, { cx, cy, tile: TILE, gameW: GAME_W });
}
// 크리스탈이 그 칸에 그려져 있는가(올리브-민트 틴트: G가 R보다 높음. 고갈되면 렌더가 사라져 중성 바닥색).
// 실측: 크리스탈 g-r≈+15~25 / g-b≈+50, 빈 바닥 g-r≈-9 / g-b≈+22.
const hasCrystal = (p) => p.g - p.r > 5 && p.g - p.b > 35;

async function capture(page) {
  await page.goto(BASE_URL);
  await page.waitForTimeout(1100); // 에셋 로드 대기.

  const box = await page.locator('#game-canvas').boundingBox();
  const s = box.width / GAME_W;
  const pt = (x, y) => [box.x + x * s, box.y + y * s];
  const cell = (cx, cy) => pt(cx * TILE + TILE / 2, cy * TILE + TILE / 2);
  const vis = (sel) => page.locator(sel).locator('visible=true').first();

  // 정복 진입.
  await page.mouse.click(...pt(620, 403));
  await page.waitForTimeout(500);

  const dragSelect = async (c0, c1) => {
    const [x0, y0] = cell(...c0);
    const [x1, y1] = cell(...c1);
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 6 });
    await page.mouse.move(x1, y1, { steps: 6 });
    await page.mouse.up();
  };
  const selectAllAndHarvest = async () => {
    await dragSelect([0, 8], [6, 13]); // HQ 주변 좌하단 = 일꾼 전원.
    await page.mouse.click(...cell(4, 9), { button: 'right' });
  };

  // HQ(2,11) 선택 → 일꾼 생산. 시작 크리스탈 150 = 3기, 이후 채집 수입으로 4기째 생산.
  await page.mouse.click(...cell(2, 11));
  await page.waitForTimeout(200);
  const workerBtn = () => vis('button:has-text("일꾼 생산")');
  for (let i = 0; i < 3; i++) { await workerBtn().click(); await page.waitForTimeout(250); }

  // 배속 + 초기 일꾼 스폰 대기 → 전원 선택 후 본진 필드로 채집 명령(이후 자동 사이클).
  await vis('.speed-btn:has-text("x3")').click();
  await page.waitForTimeout(3500);
  await selectAllAndHarvest();

  // 최소 방어: 본진 접근로에 포탑 3기. 방치해도 첫 적 웨이브에 즉사하지 않고 본진 필드가
  // 고갈될 때까지 버텨야 '고갈 후 중앙 전환'을 관측할 수 있다(무방어 시 고갈 전에 함락됨).
  const turretBtn = () => vis('.tower-btn:has-text("포탑")');
  for (const [cx, cy] of TURRET_CELLS) {
    await waitUntil(page, async () => await turretBtn().isEnabled(), 40000);
    await turretBtn().click();
    await page.mouse.click(...cell(cx, cy));
    await page.waitForTimeout(1500); // 배정 일꾼 이동+착공 여유.
    await selectAllAndHarvest(); // 건설로 빠진 일꾼 포함 전원 채집 복귀.
  }

  // 4기째 일꾼: 채집 수입으로 비용(50)이 모이면 생산.
  await page.mouse.click(...cell(2, 11));
  await page.waitForTimeout(200);
  await waitUntil(page, async () => await workerBtn().isEnabled(), 30000);
  await workerBtn().click();
  await page.waitForTimeout(500);
  await selectAllAndHarvest();

  const t0 = Date.now();
  process.stdout.write('[crystal-demo] 본진 필드 채집 시작 — 고갈까지 방치(x3, 포탑 방어)\n');

  // 본진 필드(4칸) 전부 고갈될 때까지 대기. 함락 오버레이가 크리스탈을 붉게 물들여 오탐하지 않도록,
  // '본진 4칸 모두 비었고 + 중앙은 아직 크리스탈로 읽힘'일 때만 진짜 고갈로 판정한다(중앙은 매장량 800).
  const depleted = await waitUntil(page, async () => {
    const home = await Promise.all(HOME_CELLS.map(([cx, cy]) => probeCell(page, cx, cy)));
    if (home.some(hasCrystal)) return false; // 아직 본진 채집 중.
    const center = await Promise.all(CENTER_CELLS.map(([cx, cy]) => probeCell(page, cx, cy)));
    if (!center.some(hasCrystal)) throw new Error('본진 함락 추정(중앙 크리스탈도 흐림) — 방어 실패');
    return true; // 본진만 비고 중앙은 살아있음 = 진짜 고갈.
  }, 200000, 1000);
  const tDepleted = ((Date.now() - t0) / 1000).toFixed(1);
  if (!depleted) throw new Error(`본진 필드가 ${tDepleted}s 내 고갈되지 않음`);
  process.stdout.write(`[crystal-demo] 본진 필드 고갈: 실측 ${tDepleted}s (x3 기준)\n`);

  // 고갈 직후 일꾼이 더 먼 중앙 크리스탈로 자동 전환해 이동·집결할 시간을 준다(관측: ~5s 내 도달).
  await page.waitForTimeout(5000);

  // 본진이 아직 서 있는(=중앙 크리스탈이 붉은 함락 오버레이로 흐려지지 않은) 동안만 프레임을 덮어써,
  // 마지막 저장본이 '함락'이 아니라 일꾼이 중앙 크리스탈을 쟁탈·채집하는 장면이 되게 한다.
  let good = 0;
  for (let i = 0; i < 12 && good < 8; i++) {
    const center = await Promise.all(CENTER_CELLS.map(([cx, cy]) => probeCell(page, cx, cy)));
    if (!center.some(hasCrystal)) break; // 함락 오버레이 진입 → 직전 프레임 유지.
    await page.screenshot({ path: join(OUT, 'crystal-demo.png') });
    good++;
    await page.waitForTimeout(400);
  }
  if (good === 0) throw new Error('고갈 후 중앙 쟁탈 프레임 확보 전에 본진이 함락됨(방어 부족)');
  const capAt = ((Date.now() - t0) / 1000).toFixed(1);
  process.stdout.write(`[crystal-demo] 중앙 쟁탈 캡처(${good}프레임, 고갈 후 ${(capAt - tDepleted).toFixed(1)}s): 일꾼이 중앙 크리스탈로 자동 전환\n`);
  process.stdout.write(`[crystal-demo] 캡처 완료: ${join(OUT, 'crystal-demo.png')}\n`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  let server = null;
  if (!(await ping(BASE_URL))) {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    server = spawn(npmCmd, ['run', 'preview', '--', '--port', String(PORT), '--strictPort'], {
      cwd: join(HERE, '..', '..'), stdio: 'inherit', detached: true,
    });
    if (!(await waitForServer(BASE_URL))) { stop(server); throw new Error('preview 서버 준비 실패'); }
  }
  const browser = await chromium.launch({ executablePath: PW_CHROMIUM });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
    await capture(page);
  } finally {
    await browser.close();
    stop(server);
  }
}

function stop(server) {
  if (!server || server.killed) return;
  try { process.kill(-server.pid, 'SIGTERM'); } catch { try { server.kill('SIGTERM'); } catch { /* 종료됨 */ } }
}

main().catch((err) => { process.stderr.write(`[crystal-demo] ${err.message}\n`); process.exit(1); });

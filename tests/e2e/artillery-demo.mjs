// D3.1 원거리 유닛 "포격 전차" 데모 캡처(수동) — 정복에서 차량 공장을 지어 포격 전차 2기를
// 뽑고, 그들이 적 진영으로 공격 이동하며 사거리 140px 투사체로 원거리 사격하는 프레임을
// tests/e2e/out/artillery-demo.png 로 남긴다. 판정은 하지 않고 연출 확인용 스크린샷만 찍는다.
// 실행: `node tests/e2e/artillery-demo.mjs` (preview 서버가 없으면 직접 띄웠다 정리한다).
//
// 흐름: 정복 진입 → 일꾼 2기 생산·채집으로 크리스탈 200 확보 → 전방 칸에 차량 공장 건설 →
//       완성 시 포격 전차 2기 등장 → 부대 선택 후 적 진영으로 공격 이동 → 교전(투사체) 프레임 캡처.

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

  // HQ(2,11) 선택 → 일꾼 2기 생산(각 50). 크리스탈 150 → 50.
  await page.mouse.click(...cell(2, 11));
  await page.waitForTimeout(200);
  const workerBtn = () => vis('button:has-text("일꾼 생산")');
  await workerBtn().click();
  await page.waitForTimeout(250);
  await workerBtn().click();
  await page.waitForTimeout(250);

  // 배속 + 일꾼 스폰 대기 → 드래그로 전원 선택 → 크리스탈(4,9) 채집.
  await vis('.speed-btn:has-text("x3")').click();
  await page.waitForTimeout(4000);
  const dragSelect = async (c0, c1) => {
    const [x0, y0] = cell(...c0);
    const [x1, y1] = cell(...c1);
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 6 });
    await page.mouse.move(x1, y1, { steps: 6 });
    await page.mouse.up();
  };
  await dragSelect([0, 9], [5, 13]);
  await page.mouse.click(...cell(4, 9), { button: 'right' });

  // 채집으로 크리스탈이 공장(200)을 지을 만큼 쌓이면 공장 버튼이 활성화된다.
  const factoryBtn = () => vis('.tower-btn:has-text("공장")');
  const afford = await waitUntil(page, async () => await factoryBtn().isEnabled(), 45000);
  if (!afford) throw new Error('채집으로 공장 비용(200)을 확보하지 못함');

  // 전방 통행 칸(8,9)에 차량 공장 착공. 완성까지 대기(buildTime 8s, x3 → ~2.7s).
  await factoryBtn().click();
  await page.mouse.click(...cell(8, 9));
  await page.waitForTimeout(6000); // 이동+건설 완료 여유. 완성 시 포격 전차 2기 스폰.

  // 공장 주변에 등장한 포격 전차를 드래그 선택 → 'a' 공격 이동 → 적 진영(16,5)으로 진격.
  await dragSelect([6, 6], [11, 12]);
  await page.keyboard.press('a');
  await page.mouse.click(...cell(16, 5));

  // 적 진영에 접근할 시간을 준 뒤, 적 웨이브까지 겹쳐 교전이 격화되는 구간을 촘촘히 샘플링해
  // 사거리 내 적에게 투사체가 날아가는 프레임을 캡처한다(같은 파일에 덮어써 마지막을 남긴다).
  await page.waitForTimeout(5000); // 진격으로 사거리 안까지 접근.
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, 'artillery-demo.png') });
  }
  process.stdout.write(`[artillery-demo] 캡처 완료: ${join(OUT, 'artillery-demo.png')}\n`);
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

main().catch((err) => { process.stderr.write(`[artillery-demo] ${err.message}\n`); process.exit(1); });

// D2.5 주스 ② 데모 캡처(수동) — 전투 중 "잔해 데칼 + 포신 반동"이 보이는 프레임 한 장을
// tests/e2e/out/juice-demo.png 로 남긴다. 스모크와 달리 판정은 하지 않고 연출 확인용 스크린샷만
// 찍는다. 실행: `node tests/e2e/juice-demo.mjs` (preview 서버가 없으면 직접 띄웠다 정리한다).
//
// 흐름: 디펜스 진입 → 통로변에 애로우 다수 배치 → 웨이브 시작 + 스웜 소환 → x3로 교전 진행 →
// 타워가 발사(반동)하고 적이 죽어(잔해) 데칼이 깔린 프레임을 캡처.

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

async function capture(page) {
  await page.goto(BASE_URL);
  await page.waitForTimeout(1100); // 에셋 로드 대기.

  const box = await page.locator('#game-canvas').boundingBox();
  const s = box.width / GAME_W;
  const pt = (x, y) => [box.x + x * s, box.y + y * s];
  const cell = (cx, cy) => pt(cx * TILE + TILE / 2, cy * TILE + TILE / 2);
  const vis = (sel) => page.locator(sel).locator('visible=true').first();

  // 디펜스 진입.
  await page.mouse.click(...pt(340, 403));
  await page.waitForTimeout(500);

  // 골드 치트(G)로 넉넉히 확보한 뒤, 통로(7행) 양옆에 애로우를 촘촘히 배치해 강한 화력선을
  // 세운다(처치가 통로에 몰려 잔해가 잘 쌓이고, 적이 기지로 새지 않아 교전 프레임을 잡기 쉽다).
  for (let i = 0; i < 4; i++) await page.keyboard.press('g');
  await vis('.tower-btn:has-text("애로우")').click();
  const line = [];
  for (let cx = 3; cx <= 16; cx += 2) line.push([cx, 6], [cx, 8]);
  for (const [cx, cy] of line) {
    await page.mouse.click(...cell(cx, cy));
    await page.waitForTimeout(80);
  }
  await page.keyboard.press('Escape');

  // x3 + 웨이브 시작 + 스웜 소환(강한 화력선에 처치가 몰려 잔해 데칼이 누적된다).
  await vis('.speed-btn:has-text("x3")').click();
  await vis('.next-wave-btn').click();
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('4'); // 스웜 12기.
    await page.waitForTimeout(1400);
  }

  // 교전이 무르익어 잔해가 여러 개 깔리고 포탑이 발사(반동) 중인 프레임을 캡처.
  await page.waitForTimeout(1800);
  await page.screenshot({ path: join(OUT, 'juice-demo.png') });
  process.stdout.write(`[juice-demo] 캡처 완료: ${join(OUT, 'juice-demo.png')}\n`);
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

main().catch((err) => { process.stderr.write(`[juice-demo] ${err.message}\n`); process.exit(1); });

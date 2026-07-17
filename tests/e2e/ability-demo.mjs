// D4.1 적 특수 능력 데모 캡처(수동) — 실드 링·재생 펄스·분열이 한 화면에 보이는 프레임을
// tests/e2e/out/ability-demo-*.png 로 남긴다. 스모크와 달리 판정은 하지 않고 연출 확인용.
// 실행: `node tests/e2e/ability-demo.mjs` (preview 서버가 없으면 직접 띄웠다 정리한다).
//
// 흐름: 디펜스 진입 → 골드 치트(G)로 통로변에 애로우 화력선 구축 → 웨이브 스킵(N)으로 14웨이브까지
// 진행 → 15·16·17웨이브를 중첩 호출(다음 웨이브 3연타)해 shielded·splitter·regen을 동시에 필드에
// 올린다 → 능력 오버레이가 겹친 프레임(capture 1)과, 분열체가 처치되어 스웜 자식이 퍼진 프레임
// (capture 2)을 캡처한다.

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
  // 통로 밴드(5~10행)만 잘라 확대 캡처 — 능력 오버레이가 크게 보인다.
  const clip = { x: box.x, y: box.y + 5 * TILE * s, width: box.width, height: 5 * TILE * s };

  // 디펜스 진입.
  await page.mouse.click(...pt(340, 403));
  await page.waitForTimeout(500);

  // 골드 확보 후 통로(7행)의 기지쪽 절반에만 애로우 화력선을 세운다 — 적이 통로를 넓게 퍼져
  // 전진하다 기지 근처에서 처치되므로 능력 오버레이가 겹치지 않고 하나씩 잘 보인다.
  for (let i = 0; i < 8; i++) await page.keyboard.press('g');
  await vis('.tower-btn:has-text("애로우")').click();
  const line = [];
  for (let cx = 9; cx <= 16; cx += 2) line.push([cx, 6], [cx, 8]);
  for (const [cx, cy] of line) {
    await page.mouse.click(...cell(cx, cy));
    await page.waitForTimeout(70);
  }
  await page.keyboard.press('Escape');

  // 웨이브 스킵(N) — 14웨이브까지 즉시 진행(필드는 매번 비워진다). 특수 적은 15웨이브부터 등장.
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('n');
    await page.waitForTimeout(90);
  }

  // 15·16·17웨이브를 시차를 두고 중첩 호출 — shielded(15)·splitter(16)·regen(17)이 통로에
  // 퍼진 채 함께 등장한다(동시 호출 시 스폰 지점에 뭉치는 것을 방지).
  for (let i = 0; i < 3; i++) {
    await vis('.next-wave-btn').click();
    await page.waitForTimeout(700);
  }

  // 실드 링(하늘색 육각)·재생 링(초록·+표식)·분열 표식(러너 이중 코어)이 함께 보이는 프레임.
  await page.waitForTimeout(3400);
  await page.screenshot({ path: join(OUT, 'ability-demo-1.png'), clip });
  process.stdout.write(`[ability-demo] 캡처 1(실드·재생·분열): ${join(OUT, 'ability-demo-1.png')}\n`);

  // 분열체가 처치되어 스웜 자식이 사망 위치에서 퍼진 직후 프레임.
  await page.waitForTimeout(3200);
  await page.screenshot({ path: join(OUT, 'ability-demo-2.png'), clip });
  process.stdout.write(`[ability-demo] 캡처 2(분열 자식 확산): ${join(OUT, 'ability-demo-2.png')}\n`);
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
    // deviceScaleFactor 2 — 코어리지가 12px 남짓한 특수 적의 능력 오버레이를 선명하게 캡처.
    const page = await browser.newPage({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 2 });
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

main().catch((err) => { process.stderr.write(`[ability-demo] ${err.message}\n`); process.exit(1); });

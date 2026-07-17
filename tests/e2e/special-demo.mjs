// D4.2 타워 4레벨 스페셜 분기 데모 캡처(수동) — 분기 선택이 저장되고 전투에 반영됨을 눈으로 확인.
// tests/e2e/out/special-demo-*.png 로 남긴다. 스모크와 달리 판정은 하지 않고 연출 확인용.
// 실행: `node tests/e2e/special-demo.mjs` (preview 서버가 없으면 직접 띄웠다 정리한다).
//
// 흐름: 디펜스 진입 → 골드 치트(G) → 통로(7행) 옆에 캐논(잔류 화염)·애로우(관통)를 세우고
// 각각 3레벨까지 올린 뒤 분기를 선택(금색 별 표식) → 스웜을 통로에 흘려보내 관통 사격 프레임과
// 캐논 잔류 화염 지대(주황 원) 프레임을 캡처한다.

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

// 선택된 타워를 3레벨까지 올린 뒤 지정 분기(버튼 텍스트로 지정)를 선택한다.
async function upgradeAndSpecialize(page, specialText) {
  for (let i = 0; i < 2; i++) {
    await page.locator('.upgrade-btn').click();
    await page.waitForTimeout(150);
  }
  await page.locator('.special-btn', { hasText: specialText }).click();
  await page.waitForTimeout(150);
}

async function capture(page) {
  await page.goto(BASE_URL);
  await page.waitForTimeout(1100); // 에셋 로드 대기.

  const box = await page.locator('#game-canvas').boundingBox();
  const s = box.width / GAME_W;
  const pt = (x, y) => [box.x + x * s, box.y + y * s];
  const cell = (cx, cy) => pt(cx * TILE + TILE / 2, cy * TILE + TILE / 2);
  const vis = (sel) => page.locator(sel).locator('visible=true').first();
  // 통로 밴드(5~10행)만 잘라 확대 캡처.
  const clip = { x: box.x, y: box.y + 5 * TILE * s, width: box.width, height: 5 * TILE * s };

  // 디펜스 진입.
  await page.mouse.click(...pt(340, 403));
  await page.waitForTimeout(500);

  // 골드 확보(치트 G = +1000/회).
  for (let i = 0; i < 6; i++) await page.keyboard.press('g');

  // 애로우(관통) — 통로(7행) col 17에 설치(벽이 되어 적이 그 왼쪽에 일렬로 막힘) → 3레벨 → pierce.
  // 관통 투사체는 이 일렬 대열을 향해 수평으로 날아가며 여러 기를 뚫는다(수직 사격이면 한 줄만 교차).
  await vis('.tower-btn:has-text("애로우")').click();
  await page.mouse.click(...cell(17, 7));
  await page.keyboard.press('Escape');
  await page.mouse.click(...cell(17, 7));
  await page.waitForTimeout(150);
  await upgradeAndSpecialize(page, '관통');
  await page.keyboard.press('Escape');

  // 캐논(잔류 화염) — 통로(7행) 위 6행 col 9에 설치 → 3레벨 → napalm.
  await vis('.tower-btn:has-text("캐논")').click();
  await page.mouse.click(...cell(9, 6));
  await page.keyboard.press('Escape');
  await page.mouse.click(...cell(9, 6)); // 선택 → 패널.
  await page.waitForTimeout(150);
  await upgradeAndSpecialize(page, '잔류');
  await page.keyboard.press('Escape');

  // ── 캡처 1: 캐논 잔류 화염 지대 ── 그런트 몇 기를 흘려보내면 캐논이 col 9 부근에서 명중해
  // 화염 지대(주황 원)를 남긴다. 그런트는 캐논+화염에 이곳에서 소멸한다(캡처 후 캐논은 판매).
  for (let i = 0; i < 6; i++) { await page.keyboard.press('2'); await page.waitForTimeout(550); }
  await page.waitForTimeout(2200);
  await page.screenshot({ path: join(OUT, 'special-demo-1.png'), clip });
  process.stdout.write(`[special-demo] 캡처 1(캐논 잔류 화염 지대): ${join(OUT, 'special-demo-1.png')}\n`);

  // ── 캡처 2: 애로우 관통 사격 ── 캐논을 판매해 통로를 열어, 새 그런트가 애로우까지 살아서 도달하게
  // 한다. 넓은 간격(700ms)으로 성기게 흘려보내면 앞선 몇 기를 뚫은 관통탄이 빈 공간으로 빠져나가 보인다.
  await page.mouse.click(...cell(9, 6)); // 캐논 선택.
  await page.waitForTimeout(150);
  await vis('.sell-btn').click(); // 판매 → 통로 개방.
  await page.waitForTimeout(400);
  for (let i = 0; i < 10; i++) { await page.keyboard.press('2'); await page.waitForTimeout(700); }
  // 앞선 그런트가 애로우 사거리(col ~14)에 진입해 관통 사격이 대열을 뚫는 순간. 빠른 투사체를
  // 확실히 잡으려고 짧은 구간을 여러 프레임 연속 캡처한다(관통탄이 보이는 프레임이 최소 하나 남는다).
  await page.waitForTimeout(3300);
  for (let f = 0; f < 6; f++) {
    await page.screenshot({ path: join(OUT, `special-demo-2-${f}.png`), clip });
    await page.waitForTimeout(95);
  }
  process.stdout.write(`[special-demo] 캡처 2(애로우 관통 사격, 6연속): ${join(OUT, 'special-demo-2-*.png')}\n`);
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

main().catch((err) => { process.stderr.write(`[special-demo] ${err.message}\n`); process.exit(1); });

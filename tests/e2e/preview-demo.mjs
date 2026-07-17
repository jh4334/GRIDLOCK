// D2.2 경로 미리보기 데모 캡처 (수동 실행용 — 스모크와 별개, 회귀 검증 아님).
//
// 벽 몇 개를 세워 실제 도로가 꺾이게 한 뒤, 설치 모드에서 경로가 더 크게 꺾일 위치에 고스트를
// (클릭 없이) 호버시켜, 실제 도로(도로 타일)와 다른 예상 경로(회색 반투명 오버레이)가 함께
// 보이는 스크린샷을 tests/e2e/out/preview-demo.png 로 남긴다.
//
// 실행: node tests/e2e/preview-demo.mjs
//   - 4173 포트가 이미 응답하면 그 preview 서버를 재사용, 아니면 vite preview를 자체 기동 후 정리.
//   - Chromium 경로는 PW_CHROMIUM(기본 /opt/pw-browsers/chromium).

import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { get } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(HERE, 'out');
const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE_URL = `http://localhost:${PORT}/`;
const PW_CHROMIUM = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';

const GAME_W = 960;
const TILE = 48;

function ping(url) {
  return new Promise((resolve) => {
    const req = get(url, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
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

function stopServer(server) {
  if (!server || server.killed) return;
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    try {
      server.kill('SIGTERM');
    } catch {
      /* 이미 종료됨 */
    }
  }
}

async function ensureServer() {
  if (await ping(BASE_URL)) {
    process.stdout.write(`[preview-demo] 기존 서버 재사용: ${BASE_URL}\n`);
    return null;
  }
  process.stdout.write(`[preview-demo] preview 서버 기동: ${BASE_URL}\n`);
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const server = spawn(npmCmd, ['run', 'preview', '--', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'inherit',
    detached: true,
  });
  const ok = await waitForServer(BASE_URL);
  if (!ok) {
    stopServer(server);
    throw new Error('preview 서버가 시간 내 준비되지 않음');
  }
  return server;
}

async function capture(page) {
  const box = await page.locator('#game-canvas').boundingBox();
  const s = box.width / GAME_W;
  const pt = (x, y) => [box.x + x * s, box.y + y * s];
  const cell = (cx, cy) => pt(cx * TILE + TILE / 2, cy * TILE + TILE / 2);

  // 디펜스 모드 진입(타이틀 디펜스 버튼).
  await page.mouse.click(...pt(340, 403));
  await page.waitForTimeout(500);

  // 골드 치트로 넉넉히 확보(데모 — 밸런스 무관).
  await page.keyboard.press('g');
  await page.waitForTimeout(50);

  // 애로우 설치 모드 진입(한 번만 누르고 이후엔 칸만 클릭 → 연속 설치).
  const vis = (sel) => page.locator(sel).locator('visible=true').first();
  await vis('.tower-btn:has-text("애로우")').click();

  // 스폰(0,7)→기지(19,7) 직선 경로(7행)를 열 10에서 위로 3칸 막아 실제 도로가 아래로 꺾이게 한다.
  const placeAt = async (cx, cy) => {
    await page.mouse.click(...cell(cx, cy));
    await page.waitForTimeout(120);
  };
  await placeAt(10, 5);
  await placeAt(10, 6);
  await placeAt(10, 7); // 여기까지: 실제 도로는 열 10을 8행 아래로 우회.

  // 설치 모드 유지 중 — 클릭 없이 (5,7)에 고스트 호버. 임시 벽이 열 5도 막아 예상 경로가
  // 실제 도로(열 10에서만 꺾임)와 달리 열 5·10 두 곳에서 꺾인다 → 회색 오버레이로 구분됨.
  await page.mouse.move(...cell(5, 7));
  await page.waitForTimeout(300);

  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: join(OUT, 'preview-demo.png') });
  process.stdout.write(`[preview-demo] 캡처 완료: ${join(OUT, 'preview-demo.png')}\n`);
}

async function main() {
  const server = await ensureServer();
  const browser = await chromium.launch({ executablePath: PW_CHROMIUM });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
    await page.goto(BASE_URL);
    await page.waitForTimeout(1100); // 에셋 로드 대기(도로 타일 스프라이트).
    await capture(page);
  } finally {
    await browser.close();
    stopServer(server);
  }
}

main().catch((err) => {
  process.stderr.write(`[preview-demo] FAIL: ${err.message}\n`);
  process.exit(1);
});

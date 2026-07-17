// D5.1 스웜 스트레스 테스트(수동 실행 전용 — run.mjs에 미등록) — 스웜 100+ 동시 스폰 시 FPS 실측.
// 실행: `node tests/e2e/stress-demo.mjs` (preview 서버가 없으면 직접 띄웠다 정리한다).
//
// 흐름: 디펜스 진입 → G로 골드 확보 → 기지 앞에 타워 10기(캐논 3+애로우 7) + 배럭 2기 배치 →
// 스웜 치트키(4)를 연타해 필드에 120+ 동시 유지 → 10초간 FPS 샘플링 → 평균/최저 FPS와 동시 적 수를
// stdout에 출력 + 캡처 1장(tests/e2e/out/stress-demo.png).
//
// FPS: 캔버스의 FPS 카운터를 밖에서 못 읽으므로 requestAnimationFrame 기반 측정 코드를 page.evaluate로
// 주입해 프레임 간격으로 산출한다(평균 = 전체 프레임/전체 시간, 최저 = 500ms 버킷 최소값 — 게임
// 내부 FpsCounter의 0.5초 샘플 주기와 동일 기준). 동시 적 수는 게임이 매 프레임 window에 발행하는
// __gridlockStress(스트레스 하네스 텔레메트리)를 같은 루프에서 읽는다.

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

// 배치 좌표 — 7행(스폰→기지 직선 통로)에는 아무 것도 두지 않아 봉쇄가 원천적으로 불가능하고, 적은
// 필드를 거의 끝까지 살아서 통과(≈11초 수명 → 동시 적 수 극대화)한다. 기지(19,7) 앞 6·8행에서만
// 협공하되, 밀집한 스웜에는 단일 표적 애로우(처치율 ≈10/s)로는 유입(≈12/s)을 못 막으므로 캐논의
// 스플래시(한 발로 다수 처치)로 처치율을 유입보다 높여 누수 0을 만든다.
const CANNONS = [[16, 6], [18, 6], [17, 8]]; // AoE 킬존 — 통로에 몰린 스웜을 한 발로 여럿 처치.
const ARROWS = [[16, 5], [17, 5], [18, 5], [16, 8], [18, 8], [16, 9], [18, 9]]; // 단일 표적 마무리.
const BARRACKS = [[17, 6], [17, 9]]; // 병사가 통로로 나와 새는 소수를 블로킹·처치.
const SWARM_PRESSES = 44; // 4연타 횟수(1회=12기). 큐가 샘플 내내 마르지 않게 넉넉히 선적재.
const TARGET_ENEMIES = 120; // 샘플 시작 전 도달해야 할 동시 적 수.
const SAMPLE_MS = 10000; // FPS 샘플링 구간(초).

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

// window.__gridlockStress 폴링 헬퍼(필드 적 수).
const enemyCount = (page) => page.evaluate(() => window.__gridlockStress?.enemies ?? 0);

async function run(page) {
  await page.goto(BASE_URL);
  await page.waitForTimeout(1100); // 에셋 로드 대기.

  const box = await page.locator('#game-canvas').boundingBox();
  const s = box.width / GAME_W;
  const pt = (x, y) => [box.x + x * s, box.y + y * s];
  const cell = (cx, cy) => pt(cx * TILE + TILE / 2, cy * TILE + TILE / 2);
  const vis = (sel) => page.locator(sel).locator('visible=true').first();

  // 디펜스 진입(진입 즉시 playing 상태 → 치트 스폰 유효).
  await page.mouse.click(...pt(340, 403));
  await page.waitForTimeout(500);

  // 골드 확보(G 1회=+1000). 애로우 10×50 + 배럭 2×100 = 700 → 넉넉히.
  for (let i = 0; i < 8; i++) await page.keyboard.press('g');

  // 타워 배치 — 종류별로 버튼 1회 선택 후 연속 설치(같은 버튼 재클릭은 설치 모드를 끈다).
  const place = async (label, cells) => {
    await vis(`.tower-btn:has-text("${label}")`).click();
    for (const [cx, cy] of cells) { await page.mouse.click(...cell(cx, cy)); await page.waitForTimeout(60); }
    await page.keyboard.press('Escape');
  };
  await place('캐논', CANNONS);
  await place('애로우', ARROWS);
  await place('배럭', BARRACKS);

  // 스웜 치트키(4) 연타 — 큐를 크게 채워 샘플 내내 필드를 120+로 유지한다.
  for (let i = 0; i < SWARM_PRESSES; i++) { await page.keyboard.press('4'); await page.waitForTimeout(25); }

  // 필드 적 수가 목표(120)에 도달할 때까지 대기(최대 30초). 도달 못 하면 실측치로 그대로 보고.
  const rampDeadline = Date.now() + 30000;
  let peak = 0;
  for (;;) {
    const n = await enemyCount(page);
    peak = Math.max(peak, n);
    if (n >= TARGET_ENEMIES || Date.now() >= rampDeadline) break;
    await page.waitForTimeout(150);
  }
  const atSampleStart = await enemyCount(page);
  process.stdout.write(`[stress-demo] 램프업 완료: 현재 적 ${atSampleStart}기(피크 ${peak}) → ${SAMPLE_MS / 1000}s 샘플 시작\n`);

  // 샘플 중간 프레임 캡처(120+가 필드에 깔린 상태).
  const capture = setTimeout(() => {
    page.screenshot({ path: join(OUT, 'stress-demo.png') }).catch(() => {});
  }, SAMPLE_MS / 2);

  // rAF 기반 측정 — 프레임마다 간격(FPS)과 __gridlockStress.enemies를 수집, 500ms 버킷으로 최저 FPS 산출.
  const result = await page.evaluate((durationMs) => new Promise((resolve) => {
    const bucketFps = [];
    const start = performance.now();
    let bucketStart = start, bucketFrames = 0;
    let totalFrames = 0, eSum = 0, eMax = 0, eMin = Infinity;
    let playingFrames = 0; // 월드가 'playing'이었던 프레임 수(패배 시 갱신 정지 → 측정 유효성 판단).
    const frame = (now) => {
      totalFrames += 1;
      bucketFrames += 1;
      const t = window.__gridlockStress ?? { enemies: 0, playing: false };
      const ec = t.enemies;
      if (t.playing) playingFrames += 1;
      eSum += ec; if (ec > eMax) eMax = ec; if (ec < eMin) eMin = ec;
      if (now - bucketStart >= 500) {
        bucketFps.push((bucketFrames * 1000) / (now - bucketStart));
        bucketStart = now; bucketFrames = 0;
      }
      if (now - start >= durationMs) {
        const elapsed = now - start;
        resolve({
          avgFps: (totalFrames * 1000) / elapsed,
          minFps: bucketFps.length ? Math.min(...bucketFps) : (totalFrames * 1000) / elapsed,
          buckets: bucketFps.map((f) => Math.round(f * 10) / 10),
          avgEnemies: eSum / totalFrames, maxEnemies: eMax, minEnemies: eMin === Infinity ? 0 : eMin,
          totalFrames, elapsedMs: Math.round(elapsed), playingFrames,
        });
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }), SAMPLE_MS);

  clearTimeout(capture);
  // 캡처가 아직 안 찍혔으면 지금(샘플 종료 직후) 한 장.
  await page.screenshot({ path: join(OUT, 'stress-demo.png') });

  // 샘플 유효성 — 전 프레임 'playing'이면 월드가 내내 살아 있었던 것(측정 유효). 패배로 갱신이
  // 멈춘 프레임이 섞였다면 그만큼 측정이 오염된다.
  const alive = result.playingFrames === result.totalFrames;
  const alivePct = ((result.playingFrames / result.totalFrames) * 100).toFixed(1);

  process.stdout.write('\n===== D5.1 스웜 스트레스 측정 =====\n');
  process.stdout.write(`환경        : Chromium(headless) / preview 프로덕션 빌드 / 디펜스 x1\n`);
  process.stdout.write(`배치        : 타워 ${CANNONS.length + ARROWS.length}기(캐논 ${CANNONS.length}+애로우 ${ARROWS.length}) + 배럭 ${BARRACKS.length}기\n`);
  process.stdout.write(`동시 적 수   : 평균 ${result.avgEnemies.toFixed(0)}기 / 최대 ${result.maxEnemies}기 / 최소 ${result.minEnemies}기\n`);
  process.stdout.write(`FPS         : 평균 ${result.avgFps.toFixed(1)} / 최저(500ms 버킷) ${result.minFps.toFixed(1)}\n`);
  process.stdout.write(`샘플        : ${result.totalFrames}프레임 / ${result.elapsedMs}ms\n`);
  process.stdout.write(`버킷 FPS    : ${result.buckets.join(', ')}\n`);
  process.stdout.write(`월드 유효   : ${alive ? '샘플 전 구간 playing(측정 유효)' : `playing ${alivePct}% — 나머지 구간 갱신 정지`}\n`);
  process.stdout.write(`판정        : ${result.avgFps >= 55 ? '평균 55fps 이상 → 개선 불요' : '평균 55fps 미만 → 원인 프로파일 필요'}\n`);
  process.stdout.write(`캡처        : ${join(OUT, 'stress-demo.png')}\n`);
  process.stdout.write('==================================\n');

  return { result, alive };
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
    await run(page);
  } finally {
    await browser.close();
    stop(server);
  }
}

function stop(server) {
  if (!server || server.killed) return;
  try { process.kill(-server.pid, 'SIGTERM'); } catch { try { server.kill('SIGTERM'); } catch { /* 종료됨 */ } }
}

main().catch((err) => { process.stderr.write(`[stress-demo] ${err.message}\n`); process.exit(1); });

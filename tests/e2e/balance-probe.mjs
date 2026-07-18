// GRIDLOCK 기준 플레이어 봇 (D7.7 밸런스 측정 — 수동 실행 전용, run.mjs 미등록).
// 실행: `node tests/e2e/balance-probe.mjs` (preview 서버가 없으면 직접 띄웠다 정리).
//
// 목적: 맵 불문 동작하는 "공정한 기준 봇"으로 신규/랜덤 맵의 난이도를 실측한다. 수치 조정은
// 사람(기획)이 하고, 봇은 실측 데이터만 만든다. 치트(골드/스킵) 없이 시작 골드 + 웨이브 보상만으로
// 방어한다.
//
// 전략(맵 불문):
//   1) 도로 텔레메트리(window.__gridlockTerrain.road)에서 현재 도로 칸을 읽어, 도로에 인접(8방향)한
//      설치 가능 칸을 후보로 산출한다. 우선순위 = 주변 도로 칸 수(커버리지) 높은 순 → 길목 우선.
//   2) 웨이브 사이(진행 중 웨이브 없음)마다: 골드가 허용하는 한 애로우:캐논:프로스트 = 3:1:1로 설치.
//      설치 거부(봉쇄/점유)면 다음 후보로. 후보 소진 시 기존 타워를 업그레이드(U)로 골드 소진.
//   3) x3 배속, "다음 웨이브"는 이전 웨이브 완료(inProgress=false) 후에만 호출(얼리콜 없음).
//   4) 패배 시 도달 웨이브 기록, 20웨이브 승리 시 클리어 기록. 맵당 상한 12분(벽시계) — 초과 시 중단.
//
// 판단 근거는 전부 window.__gridlockBalance(gold/lives/wave/state, 읽기 전용 텔레메트리)에서 읽는다.
// 결과를 stdout에 표로 출력(맵별 도달 웨이브·잔여 라이프·시간·이상치 후보).

import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { get } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEFENSE_BTN, defenseCardCenter, GAME_W, TILE } from './titleCoords.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}/`;
const PW_CHROMIUM = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';

const COLS = 20, ROWS = 14, BASE = [19, 7];
const BUDGET_MS = 12 * 60 * 1000; // 맵당 벽시계 상한(x3 배속 기준 12분).
const COST = { arrow: 50, cannon: 90, frost: 70 };
const LABEL = { arrow: '애로우', cannon: '캐논', frost: '프로스트' };
const PATTERN = ['arrow', 'arrow', 'arrow', 'cannon', 'frost']; // 3:1:1 혼합 순서.

// 측정 대상: 고정 6맵(카드 인덱스) + 랜덤 시드 3개.
const ONLY = process.env.PROBE_ONLY ?? '';
const FIXED = [
  { id: 'classic', card: 0 }, { id: 'canyon', card: 1 }, { id: 'twinriver', card: 2 },
  { id: 'ruins', card: 3 }, { id: 'crossroads', card: 4 }, { id: 'pincer', card: 5 },
];
const SEEDS = ONLY ? [] : [1001, 1002, 1003];
const TARGETS_FIXED = ONLY ? FIXED.filter((f) => f.id === ONLY) : FIXED;

// ── 서버 헬퍼(stress-demo와 동일 패턴) ──────────────────────────────
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

const vis = (page, sel) => page.locator(sel).locator('visible=true').first();

async function waitUntil(page, predicate, timeout = 8000, interval = 100) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await predicate()) return true;
    if (Date.now() >= deadline) return false;
    await page.waitForTimeout(interval);
  }
}

const readBalance = (page) => page.evaluate(() =>
  window.__gridlockBalance ?? { gold: 0, lives: 0, wave: 0, state: 'menu', inProgress: false, canStart: false, endless: false });
const readRoad = (page) => page.evaluate(() => window.__gridlockTerrain?.road ?? []);

// ── 후보 산출 — 도로 인접 설치 가능 칸을 커버리지 높은 순으로 ────────
// terrain=현재 맵의 rock/water(벽), spawns=[[x,y]], road=현재 도로 칸[[x,y]].
// 후보 = 벽·도로·스폰·기지가 아니면서 8방향에 도로 칸이 하나라도 있는 칸. 정렬 = 도로 커버리지 desc.
function computeCandidates(terrain, spawns, road) {
  const k = (x, y) => `${x},${y}`;
  const blocked = new Set([...terrain.rock, ...terrain.water].map(([x, y]) => k(x, y)));
  const roadSet = new Set(road.map(([x, y]) => k(x, y)));
  const spawnSet = new Set(spawns.map(([x, y]) => k(x, y)));
  const cands = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const key = k(x, y);
    if (blocked.has(key) || roadSet.has(key) || spawnSet.has(key)) continue;
    if (x === BASE[0] && y === BASE[1]) continue;
    let cov = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (roadSet.has(k(x + dx, y + dy))) cov++;
    }
    if (cov > 0) cands.push({ x, y, cov });
  }
  cands.sort((a, b) => b.cov - a.cov || a.y - b.y || a.x - b.x);
  return cands;
}

// ── 설치/업그레이드 시도 — 성공 판정은 골드 감소로(웨이브 사이라 다른 골드 변동 없음) ──
async function placeTower(page, cell, kind) {
  const before = (await readBalance(page)).gold;
  await page.keyboard.press('Escape'); // 기존 설치 모드/선택 해제 → 버튼 클릭이 항상 설치 모드 진입.
  await vis(page, `.tower-btn:has-text("${LABEL[kind]}")`).click();
  await page.mouse.click(...cell);
  await page.waitForTimeout(80);
  return (await readBalance(page)).gold < before; // 골드 차감 = 설치 성공.
}
async function upgradeTower(page, cell) {
  const before = (await readBalance(page)).gold;
  await page.keyboard.press('Escape');
  await page.mouse.click(...cell); // 비설치 모드 → 타워 선택.
  await page.waitForTimeout(50);
  await page.keyboard.press('u'); // 선택 타워 업그레이드.
  await page.waitForTimeout(50);
  return (await readBalance(page)).gold < before;
}

// 웨이브 사이 1회 빌드/업그레이드 — 골드 소진할 때까지 후보에 설치, 이후 잉여를 업그레이드로.
async function buildPhase(page, cellFn, ctx) {
  for (let guard = 0; guard < 50; guard++) {
    const road = await readRoad(page);
    const cands = computeCandidates(ctx.terrain, ctx.spawns, road)
      .filter((c) => !ctx.placed.has(`${c.x},${c.y}`) && !ctx.failed.has(`${c.x},${c.y}`));
    if (cands.length === 0) break;
    const b = await readBalance(page);
    let kind = PATTERN[ctx.patternIdx % PATTERN.length];
    if (b.gold < COST[kind]) {
      const affordable = ['arrow', 'frost', 'cannon'].filter((kk) => b.gold >= COST[kk]);
      if (affordable.length === 0) break; // 가장 싼 것도 못 사면 빌드 종료.
      kind = affordable[0];
    }
    let placedOne = false;
    for (const c of cands) {
      const key = `${c.x},${c.y}`;
      if (await placeTower(page, cellFn(c.x, c.y), kind)) {
        ctx.placed.add(key); ctx.patternIdx++; placedOne = true; break;
      }
      ctx.failed.add(key); // 봉쇄/점유 — 이번 판에선 재시도 안 함.
    }
    if (!placedOne) break;
  }
  // 잉여 골드는 기존 타워 업그레이드로(라운드로빈). 한 패스에서 아무 것도 못 올리면 종료.
  for (let pass = 0; pass < 4; pass++) {
    let any = false;
    for (const key of ctx.placed) {
      if ((await readBalance(page)).gold < 40) return; // 최저 업그레이드가도 못 미침.
      const [x, y] = key.split(',').map(Number);
      if (await upgradeTower(page, cellFn(x, y))) any = true;
    }
    if (!any) break;
  }
}

// ── 한 맵 플레이 ────────────────────────────────────────────────────
async function playMap(page, mapmeta) {
  await page.goto(BASE_URL);
  await page.waitForTimeout(1100); // 에셋·생성기 노출 대기.

  const box = await page.locator('#game-canvas').boundingBox();
  const s = box.width / GAME_W;
  const pt = (x, y) => [box.x + x * s, box.y + y * s];
  const cell = (cx, cy) => pt(cx * TILE + TILE / 2, cy * TILE + TILE / 2);

  // 진입 + 지형·스폰 확보.
  let terrain, spawns;
  if (mapmeta.seed !== undefined) {
    const g = await page.evaluate((seed) => window.__gridlockPlaySeed(seed) ?? window.__gridlockGen(seed), mapmeta.seed);
    const gen = await page.evaluate((seed) => window.__gridlockGen(seed), mapmeta.seed);
    terrain = gen.terrain;
    spawns = gen.spawns.map((c) => [c.cx, c.cy]);
    void g;
  } else {
    const maps = JSON.parse(await readFile(join(HERE, '../../src/data/maps.json'), 'utf8')).maps;
    const def = maps[mapmeta.id];
    terrain = def.terrain;
    spawns = def.spawns ?? [[0, 7]];
    await page.mouse.click(...pt(...defenseCardCenter(mapmeta.card)));
    await page.waitForTimeout(120);
    await page.mouse.click(...pt(...DEFENSE_BTN));
  }
  await page.waitForTimeout(400);

  // playing + 도로 발행 대기.
  const ready = await waitUntil(page, async () => {
    const b = await readBalance(page);
    const road = await readRoad(page);
    return b.state === 'playing' && Array.isArray(road) && road.length > 0;
  }, 8000, 150);
  if (!ready) throw new Error('진입 후 playing/도로 텔레메트리 미발행');

  // x3 배속.
  await vis(page, '.speed-btn:has-text("x3")').click();

  const ctx = { terrain, spawns, placed: new Set(), failed: new Set(), patternIdx: 0 };
  const startT = Date.now();
  let reached = 0, lives = 0, cleared = false, timedOut = false;

  for (;;) {
    const b = await readBalance(page);
    reached = b.wave; lives = b.lives;
    if (b.state === 'lost') { lives = 0; break; }
    if (b.state === 'won') { cleared = true; reached = 20; lives = b.lives; break; }
    if (Date.now() - startT > BUDGET_MS) { timedOut = true; break; }

    if (b.inProgress) { await page.waitForTimeout(250); continue; }

    // 웨이브 사이 — 빌드/업그레이드 후 다음 웨이브 시작(얼리콜 없음).
    ctx.failed.clear(); // 도로가 바뀌었을 수 있으니 봉쇄 실패 후보는 판마다 재시도 허용.
    await buildPhase(page, cell, ctx);

    const bb = await readBalance(page);
    if (bb.state !== 'playing' || !bb.canStart) { await page.waitForTimeout(200); continue; }
    await page.keyboard.press('Escape');
    const nextBtn = vis(page, '.next-wave-btn');
    if (await nextBtn.isEnabled()) {
      const prev = bb.wave;
      await nextBtn.click();
      await waitUntil(page, async () => {
        const c = await readBalance(page);
        return c.wave > prev || c.inProgress || c.state !== 'playing';
      }, 8000, 100);
    } else {
      await page.waitForTimeout(200);
    }
  }

  const elapsed = (Date.now() - startT) / 1000;
  return { reached, lives, cleared, timedOut, towers: ctx.placed.size, elapsed };
}

// ── 결과표 + 이상치 ────────────────────────────────────────────────
function anomaly(r) {
  if (!r.cleared && r.reached < 8 && !r.timedOut) return '과난이도 의심(<8웨이브 사망)';
  if (r.cleared && r.lives >= 20) return '과저난이도 의심(20웨이브 무손실)';
  return '';
}

function printTable(rows) {
  const pad = (str, n) => String(str).padEnd(n);
  const padS = (str, n) => String(str).padStart(n);
  process.stdout.write('\n===== D7.7 기준 봇 밸런스 실측 =====\n');
  process.stdout.write('환경: Chromium(headless) / preview 프로덕션 빌드 / 디펜스 x3 / 치트 없음(시작220G+웨이브보상)\n');
  process.stdout.write('봇  : 도로 인접 커버리지순 배치, 애로우:캐논:프로스트=3:1:1, 후보 소진 시 업그레이드, 얼리콜 없음\n\n');
  process.stdout.write(`${pad('맵', 14)}${pad('결과', 12)}${padS('도달웨이브', 12)}${padS('잔여라이프', 12)}${padS('설치수', 8)}${padS('시간(s)', 10)}  이상치\n`);
  process.stdout.write('-'.repeat(92) + '\n');
  for (const r of rows) {
    const outcome = r.error ? '오류' : r.cleared ? '클리어' : r.timedOut ? `중단(상한)` : '패배';
    const wave = r.error ? '-' : r.cleared ? '20/20' : `${r.reached}/20`;
    process.stdout.write(
      `${pad(r.name, 14)}${pad(outcome, 12)}${padS(wave, 12)}${padS(r.error ? '-' : r.lives, 12)}` +
      `${padS(r.error ? '-' : r.towers, 8)}${padS(r.error ? '-' : r.elapsed.toFixed(1), 10)}  ${r.error ?? anomaly(r)}\n`);
  }
  process.stdout.write('-'.repeat(92) + '\n');
  const flagged = rows.filter((r) => !r.error && anomaly(r));
  if (flagged.length === 0) process.stdout.write('이상치 후보: 없음(전 맵 8~20웨이브 구간, 무손실 클리어 없음)\n');
  else {
    process.stdout.write('이상치 후보:\n');
    for (const r of flagged) process.stdout.write(`  - ${r.name}: ${anomaly(r)}\n`);
  }
  process.stdout.write('===================================\n');
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
  const rows = [];
  try {
    const targets = [
      ...TARGETS_FIXED.map((m) => ({ name: m.id, meta: m })),
      ...SEEDS.map((seed) => ({ name: `seed:${seed}`, meta: { seed } })),
    ];
    for (const t of targets) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
      const errs = [];
      page.on('pageerror', (e) => errs.push(String(e)));
      try {
        process.stdout.write(`[balance-probe] ${t.name} 측정 시작...\n`);
        const r = await playMap(page, t.meta);
        rows.push({ name: t.name, ...r });
        process.stdout.write(`[balance-probe] ${t.name}: ${r.cleared ? '클리어' : r.timedOut ? '중단' : '패배'} `
          + `웨이브 ${r.cleared ? 20 : r.reached}, 라이프 ${r.lives}, 설치 ${r.towers}, ${r.elapsed.toFixed(1)}s\n`);
        if (errs.length) process.stdout.write(`[balance-probe] ${t.name} 페이지 오류: ${errs.join(' | ')}\n`);
      } catch (err) {
        rows.push({ name: t.name, error: err.message });
        process.stdout.write(`[balance-probe] ${t.name} 실패: ${err.message}\n`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    stop(server);
  }
  printTable(rows);
}

function stop(server) {
  if (!server || server.killed) return;
  try { process.kill(-server.pid, 'SIGTERM'); } catch { try { server.kill('SIGTERM'); } catch { /* 종료됨 */ } }
}

main().catch((err) => { process.stderr.write(`[balance-probe] ${err.message}\n`); process.exit(1); });

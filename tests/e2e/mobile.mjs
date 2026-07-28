// GRIDLOCK 모바일 E2E (D8.6) — 390×844 / hasTouch / deviceScaleFactor 2 컨텍스트에서
// D8.1~D8.5(반응형 레이아웃·Pointer Events·2탭 배치·44px 터치 타깃·정복 터치 명령)의 회귀를 잡는다.
//
// 입력은 전부 실제 터치 이벤트(touchscreen.tap / locator.tap)만 쓴다 — 마우스 이벤트를 섞으면
// 터치 경로가 아니라 데스크톱 경로를 검증하게 되어 D8의 회귀를 못 잡는다.
// 판정 근거는 캔버스 밖에서 관찰 가능한 것뿐이다: DOM 사각형(레이아웃·터치 타깃),
// window.__gridlockBalance(골드·웨이브), window.__gridlockConquest(선택 수·아군 좌표).
//
// 검증 항목:
//   1) 레이아웃 — 가로 스크롤 없음(scrollWidth = 뷰포트 폭) + 뷰포트 넘는 요소 0건 (D8.1)
//   2) 터치 타깃 — 보이는 button 전부 44px 이상 + 서로 겹치지 않음 (D8.4)
//   3) 디펜스 — 터치 진입 → 2탭 배치(첫 탭 골드 불변 → 재탭 차감) → 웨이브 1 시작·완주 (D8.2/D8.3)
//   4) 정복 — 터치 진입 → 일꾼 생산 → 탭 이동 명령(좌표 변화) → 건설 2탭 확정 (D8.5)
//
// 실패 시 어느 단계에서 깨졌는지 stderr 한 줄 + 비-0 종료(runner가 감지).

import { chromium } from 'playwright-core';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CONQUEST_BTN, DEFENSE_BTN, DIFF_EASY, GAME_W, TILE } from './titleCoords.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173/';
const PW_CHROMIUM = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';

const VIEWPORT = { width: 390, height: 844 }; // iPhone 12/13/14 논리 해상도.
const MIN_TARGET = 44; // D8.4 최소 터치 타깃(px).

// 밸런스 수치는 코드에 박지 않고 데이터에서 읽는다(CLAUDE.md).
const towers = JSON.parse(await readFile(join(HERE, '../../src/data/towers.json'), 'utf8'));
const conquest = JSON.parse(await readFile(join(HERE, '../../src/data/conquest.json'), 'utf8'));
const ARROW_COST = towers.towers.arrow.cost;
const DEPOT_COST = conquest.buildings.depot.cost;

let stage = 'init';
const log = (m) => process.stdout.write(`[mobile] ${m}\n`);
function check(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ── 공용 헬퍼 ─────────────────────────────────────────────────────
// 모바일에선 캔버스가 CSS로 축소되므로 논리 좌표(960×672)를 boundingBox 비율로 환산한다.
async function canvasMapper(page) {
  const box = await page.locator('#game-canvas').boundingBox();
  const s = box.width / GAME_W;
  const pt = (x, y) => [box.x + x * s, box.y + y * s];
  const cell = (cx, cy) => pt(cx * TILE + TILE / 2, cy * TILE + TILE / 2);
  return { box, s, pt, cell };
}

const vis = (page, sel) => page.locator(sel).locator('visible=true').first();
const balance = (page) => page.evaluate(() => window.__gridlockBalance ?? null);
const conq = (page) => page.evaluate(() => window.__gridlockConquest ?? null);
const shot = (page, name) => page.screenshot({ path: join(OUT, `mobile-${name}.png`) });

async function waitUntil(page, predicate, timeout = 30000, interval = 250) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await predicate()) return true;
    if (Date.now() >= deadline) return false;
    await page.waitForTimeout(interval);
  }
}

async function tap(page, xy, wait = 200) {
  await page.touchscreen.tap(...xy);
  await page.waitForTimeout(wait);
}

// ── 레이아웃 + 터치 타깃 감사 ─────────────────────────────────────
// 보이는 button 전부의 사각형을 재서 (1) 44px 미달, (2) 버튼끼리 겹침,
// (3) 뷰포트 가로 오버플로를 한 번에 수집한다.
const auditScreen = (page, label) =>
  page.evaluate(
    ({ label, MIN }) => {
      const shown = (el) => {
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const name = (el) => {
        const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
        return `${el.tagName.toLowerCase()}${cls}[${(el.textContent || '').trim().slice(0, 12)}]`;
      };
      const buttons = [...document.querySelectorAll('button')].filter(shown).map((el) => {
        const r = el.getBoundingClientRect();
        return { name: name(el), x: r.x, y: r.y, w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
      });
      const overlaps = [];
      for (let i = 0; i < buttons.length; i++)
        for (let j = i + 1; j < buttons.length; j++) {
          const a = buttons[i], b = buttons[j];
          if (a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5)
            overlaps.push(`${a.name} × ${b.name}`);
        }
      const clientW = document.documentElement.clientWidth;
      return {
        label,
        count: buttons.length,
        small: buttons.filter((b) => b.w < MIN || b.h < MIN).map((b) => `${b.name} ${b.w}×${b.h}`),
        overlaps,
        scrollW: document.documentElement.scrollWidth,
        clientW,
        overflowing: [...document.querySelectorAll('body *')]
          .filter((el) => shown(el) && el.getBoundingClientRect().right > clientW + 0.5)
          .map(name),
      };
    },
    { label, MIN: MIN_TARGET },
  );

async function assertScreen(page, label, { minButtons = 1 } = {}) {
  stage = `audit-${label}`;
  const a = await auditScreen(page, label);
  check(a.clientW === VIEWPORT.width, `${label}: 뷰포트 폭이 ${a.clientW}px(기대 ${VIEWPORT.width})`);
  check(a.scrollW === a.clientW, `${label}: 가로 스크롤 발생(scrollWidth ${a.scrollW} > ${a.clientW})`);
  check(a.overflowing.length === 0, `${label}: 뷰포트를 넘는 요소 ${a.overflowing.length}건 — ${a.overflowing.join(', ')}`);
  check(a.count >= minButtons, `${label}: 보이는 버튼이 ${a.count}개(기대 ${minButtons}개 이상) — 화면 전환 실패 의심`);
  check(a.small.length === 0, `${label}: ${MIN_TARGET}px 미달 터치 타깃 ${a.small.length}건 — ${a.small.join(', ')}`);
  check(a.overlaps.length === 0, `${label}: 버튼 겹침 ${a.overlaps.length}건 — ${a.overlaps.join(', ')}`);
  log(`${label}: 버튼 ${a.count}개 전부 ${MIN_TARGET}px 이상·겹침 없음, scrollWidth ${a.scrollW}=clientWidth, 오버플로 0`);
  return a;
}

// ── 1) 디펜스: 터치 진입 → 2탭 배치 → 웨이브 1 ────────────────────
async function defenseStage(page) {
  stage = 'defense-enter';
  await page.goto(BASE_URL);
  await page.waitForTimeout(1200); // 에셋 로드(assetsReady) 대기.
  await assertScreen(page, 'title', { minButtons: 0 }); // 타이틀 버튼은 캔버스 내부라 DOM button이 0개.
  await shot(page, '01-title');

  const t0 = await canvasMapper(page);
  await tap(page, t0.pt(...DEFENSE_BTN), 700);
  check(await vis(page, '.tower-btn').isVisible(), '디펜스 진입 실패(빌드 메뉴가 안 보임)');
  const { cell } = await canvasMapper(page); // 인게임 UI 노출로 캔버스 위치가 바뀌므로 재계산.
  await assertScreen(page, 'defense', { minButtons: 6 });
  await shot(page, '02-defense');

  const g0 = (await balance(page))?.gold;
  check(typeof g0 === 'number', '골드 텔레메트리(window.__gridlockBalance)를 읽지 못함');

  // 2탭 배치: 첫 탭 = 대기 칸(골드 불변) → 다른 칸 탭 = 대기 칸 이동(여전히 불변) → 재탭 = 확정(차감).
  stage = 'defense-2tap';
  await vis(page, '.tower-btn:has-text("애로우")').tap();
  await page.waitForTimeout(200);
  check((await page.locator('.tower-btn.active').locator('visible=true').count()) === 1, '타워 버튼 탭으로 설치 모드가 켜지지 않음');

  await tap(page, cell(8, 6), 260);
  const gA = (await balance(page)).gold;
  check(gA === g0, `첫 탭에서 즉시 배치됨(골드 ${g0}→${gA}) — 2탭 확정 규칙 위반`);
  await shot(page, '03-defense-tap1-pending');

  await tap(page, cell(12, 6), 260);
  const gB = (await balance(page)).gold;
  check(gB === g0, `대기 칸 이동 탭에서 골드가 변함(${g0}→${gB})`);

  await tap(page, cell(12, 6), 400);
  const gC = (await balance(page)).gold;
  check(gC === g0 - ARROW_COST, `재탭 확정 실패 — 골드 ${g0}→${gC}(기대 ${g0 - ARROW_COST})`);
  log(`2탭 배치: 첫 탭 골드 ${g0} 유지 → 재탭 확정 ${g0}→${gC}(-${ARROW_COST})`);
  await shot(page, '04-defense-tap2-placed');

  // 웨이브를 넘길 화력 확보 — 통로 중반(8,6)과 스폰 앞(0,6)에 2탭으로 마저 배치.
  // 골드를 다 쓰면 타워 버튼이 disabled가 되어 설치 모드를 탭으로 못 끄므로 여유를 남긴다.
  stage = 'defense-place-rest';
  for (const c of [[8, 6], [0, 6]]) {
    await tap(page, cell(...c), 200);
    await tap(page, cell(...c), 300);
  }
  const placed = (await balance(page)).gold;
  check(placed === g0 - ARROW_COST * 3, `추가 2기 2탭 배치 실패(골드 ${placed}, 기대 ${g0 - ARROW_COST * 3})`);

  // 타워 패널 열림 상태의 터치 타깃(업그레이드·판매·특화)까지 감사.
  stage = 'defense-panel';
  await vis(page, '.tower-btn:has-text("애로우")').tap(); // 설치 모드 해제.
  await page.waitForTimeout(200);
  await tap(page, cell(12, 6), 300);
  check(await vis(page, '.tower-panel').isVisible(), '설치된 타워 탭에 정보 패널이 안 뜸');
  await assertScreen(page, 'defense+panel', { minButtons: 8 });
  await shot(page, '05-defense-panel');
  await tap(page, cell(15, 11), 200); // 빈 곳 탭 = 패널 닫기.

  // 웨이브 1 시작 → 진행 → 완주.
  stage = 'defense-wave';
  await vis(page, '.speed-btn:has-text("x3")').tap();
  const nextBtn = vis(page, '.next-wave-btn');
  const inProgress = async () => (await nextBtn.getAttribute('data-inprogress')) === 'true';
  check(await nextBtn.isEnabled(), '웨이브 시작 전 다음 웨이브 버튼이 비활성');
  await nextBtn.tap();
  check(await waitUntil(page, inProgress, 8000), '다음 웨이브 탭에도 웨이브가 시작되지 않음(진행 상태 전이 없음)');
  const started = await balance(page);
  check(started.wave >= 1, `웨이브 번호가 갱신되지 않음(wave=${started.wave})`);
  await shot(page, '06-defense-wave1');

  check(await waitUntil(page, async () => !(await inProgress()), 60000), '웨이브 1이 제한 시간 내 완료되지 않음');
  const done = await balance(page);
  check(done.state === 'playing', `웨이브 1 완료 대신 게임이 종료됨(state=${done.state})`);
  await shot(page, '07-defense-wave1-clear');
  log(`웨이브 1 터치 시작 → 완주(라이프 ${done.lives}, 골드 ${done.gold})`);
}

// ── 2) 정복: 터치 진입 → 일꾼 생산 → 탭 이동 명령 → 건설 2탭 ──────
async function conquestStage(page) {
  // 디펜스 상태와 격리하려고 새로 로드한 뒤 정복으로 진입한다.
  stage = 'conquest-enter';
  await page.goto(BASE_URL);
  await page.waitForTimeout(1200);
  const t0 = await canvasMapper(page);
  await tap(page, t0.pt(...DIFF_EASY), 150); // 쉬움 = 적 첫 공격이 늦어 검증 구간 간섭 최소.
  await tap(page, t0.pt(...CONQUEST_BTN), 800);
  const { pt, cell } = await canvasMapper(page);
  check((await conq(page)) !== null, '정복 진입 실패(텔레메트리 없음)');
  await assertScreen(page, 'conquest', { minButtons: 6 });
  await shot(page, '08-conquest');

  // HQ 탭 선택 → 일꾼 생산.
  stage = 'conquest-worker';
  await tap(page, cell(2, 11), 250);
  const workerBtn = () => vis(page, 'button:has-text("일꾼 생산")');
  check(await workerBtn().isVisible(), 'HQ 탭으로 HQ가 선택되지 않음(일꾼 생산 패널 없음)');
  await workerBtn().tap();
  await vis(page, '.speed-btn:has-text("x3")').tap();
  check(await waitUntil(page, async () => ((await conq(page))?.workers.length ?? 0) >= 1, 20000), '일꾼이 스폰되지 않음');
  await shot(page, '09-conquest-worker');
  log('HQ 탭 선택 + 일꾼 생산 OK');

  // 일꾼 탭 = 단일 선택 → 빈 땅 탭 = 이동 명령(우클릭 대체). 좌표가 목표에 가까워지면 명령 성립.
  stage = 'conquest-move';
  const w0 = (await conq(page)).workers[0];
  await tap(page, pt(w0.x, w0.y), 250);
  check((await conq(page)).selectedWorkers === 1, '일꾼 탭 단일 선택 실패');
  const dest = { x: 8 * TILE + TILE / 2, y: 12 * TILE + TILE / 2 };
  const gap = (w) => Math.hypot(w.x - dest.x, w.y - dest.y);
  const before = gap((await conq(page)).workers[0]);
  await tap(page, cell(8, 12), 2000);
  const after = gap((await conq(page)).workers[0]);
  check(after < before - 20, `빈 땅 탭 이동 명령 미동작(목표거리 ${before.toFixed(0)}→${after.toFixed(0)})`);
  check((await conq(page)).selectedWorkers === 1, '명령 후 선택이 유지되지 않음');
  await shot(page, '10-conquest-move');
  log(`탭 이동 명령 OK — 목표거리 ${before.toFixed(0)}→${after.toFixed(0)}, 선택 유지`);

  // 건설 2탭 확정(보급고) — 디펜스와 같은 규칙.
  stage = 'conquest-build';
  await vis(page, '.tower-btn:has-text("보급고")').tap();
  await page.waitForTimeout(200);
  const cBefore = (await conq(page)).crystal;
  await tap(page, cell(4, 12), 500);
  const cPending = (await conq(page)).crystal;
  check(cPending >= cBefore, `건설 첫 탭에서 이미 차감됨(${cBefore}→${cPending}) — 2탭 확정 규칙 위반`);
  await shot(page, '11-conquest-build-pending');
  await tap(page, cell(4, 12), 500);
  const cAfter = (await conq(page)).crystal;
  check(cAfter <= cPending - DEPOT_COST, `건설 재탭 확정 실패(크리스탈 ${cPending}→${cAfter}, 기대 -${DEPOT_COST})`);
  await shot(page, '12-conquest-build-confirmed');
  log(`건설 2탭 확정 OK — 첫 탭 ${cBefore}→${cPending}(불변), 재탭 ${cPending}→${cAfter}(-${DEPOT_COST})`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: PW_CHROMIUM });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  try {
    await defenseStage(page);
    await conquestStage(page);
    stage = 'page-errors';
    check(errors.length === 0, `페이지 런타임 오류 ${errors.length}건: ${errors.join(' | ')}`);
    log('모바일 스위트 전체 통과');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  process.stderr.write(`[mobile] FAIL @ ${stage}: ${err.message}\n`);
  process.exit(1);
});

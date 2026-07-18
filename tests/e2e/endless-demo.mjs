// GRIDLOCK 엔드리스 데모 (D4.3) — 20웨이브 승리 → "엔드리스 계속" → 21웨이브 진행 → 패배 → 타이틀 기록.
//
// 캔버스 HUD 텍스트(웨이브 번호)는 헤드리스에서 직접 못 읽으므로, 관찰 가능한 DOM 상태로 판정하고
// 근거는 스크린샷 2장으로 남긴다:
//   1) N키 20연타로 20웨이브 승리 → 승리 오버레이의 "엔드리스 계속" 버튼(.endless-btn) 노출 확인.
//   2) "엔드리스 계속" 클릭 → 게임이 다시 진행(playing)되고 다음 웨이브 버튼이 재활성 = 21웨이브 진입.
//      → HUD 캡처(endless-demo-01-wave21.png). N키 스킵이 엔드리스에서도 동작함을 몇 번 더 눌러 확인.
//   3) 무방비 상태로 방치 → 라이프 0 패배 → 엔드리스 도달 웨이브가 gridlock.endless에 기록.
//      → "타이틀로" 복귀 후 타이틀 캡처(endless-demo-02-title.png)에 "엔드리스 최고: 웨이브 n" 표시.
//
// 실패 시 어느 단계에서 깨졌는지 stderr 한 줄 + 비-0 종료(runner가 감지).

import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEFENSE_BTN, GAME_W } from './titleCoords.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173/';
const PW_CHROMIUM = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';

let stage = 'init';

function check(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function canvasMapper(page) {
  const box = await page.locator('#game-canvas').boundingBox();
  const s = box.width / GAME_W; // CSS 확대/축소 보정 스케일.
  const pt = (x, y) => [box.x + x * s, box.y + y * s];
  return { box, s, pt };
}

const vis = (page, sel) => page.locator(sel).locator('visible=true').first();

async function waitUntil(page, predicate, timeout = 20000, interval = 250) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await predicate()) return true;
    if (Date.now() >= deadline) return false;
    await page.waitForTimeout(interval);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: PW_CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  try {
    // 이전 실행의 엔드리스 기록이 남아 판정을 흐리지 않게 초기화한 뒤 시작한다.
    stage = 'enter';
    await page.goto(BASE_URL);
    // v2 스키마(D5.2): 기록은 통합 gridlock.save에 있으므로 그 키를 비운다.
    await page.evaluate(() => { localStorage.removeItem('gridlock.save'); localStorage.removeItem('gridlock.endless'); });
    await page.reload();
    await page.waitForTimeout(1100); // 에셋 로드 대기(assetsReady).
    const { box, s, pt } = await canvasMapper(page);

    // 디펜스 진입.
    await page.mouse.click(...pt(...DEFENSE_BTN));
    await page.waitForTimeout(400);
    const nextBtn = vis(page, '.next-wave-btn');
    check(await nextBtn.isVisible(), '디펜스 진입 후 컨트롤 바가 보이지 않음');

    // ── 1) N키 20연타로 20웨이브 승리 ──
    // N 스킵은 진행 중 웨이브가 없으면 다음 웨이브를 시작한 뒤 즉시 완료 처리한다(치트).
    // 20회면 20웨이브까지 클리어 → 승리 오버레이.
    stage = 'skip-to-win';
    const endlessBtn = vis(page, '.endless-btn');
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('n');
      await page.waitForTimeout(90);
    }
    const won = await waitUntil(page, async () => await endlessBtn.isVisible().catch(() => false), 8000);
    check(won, 'N키 20연타 후에도 "엔드리스 계속" 버튼이 안 뜸(20웨이브 승리 미도달)');
    // 승리 시 다음 웨이브 버튼은 비활성(더 시작할 일반 웨이브 없음)이어야 정상.
    check(!(await nextBtn.isEnabled()), '승리 상태인데 다음 웨이브 버튼이 아직 활성(승리 판정 이상)');

    // ── 2) "엔드리스 계속" → 21웨이브 진입 ──
    stage = 'continue-endless';
    await endlessBtn.click();
    await page.waitForTimeout(300);
    // 엔드리스 계속 = 다시 진행(playing) → 다음 웨이브 버튼 재활성(엔드리스는 상한 없음) + 승리 버튼 숨김.
    check(await nextBtn.isEnabled(), '엔드리스 계속 후 다음 웨이브 버튼이 재활성되지 않음(21웨이브 진입 실패)');
    check(!(await endlessBtn.isVisible().catch(() => false)), '엔드리스 진입 후에도 "엔드리스 계속" 버튼이 남아 있음');

    // HUD 캡처(우상단 "웨이브 21 (엔드리스)").
    stage = 'capture-wave21';
    await page.screenshot({
      path: join(OUT, 'endless-demo-01-wave21.png'),
      clip: { x: box.x + Math.round(600 * s), y: box.y, width: Math.round(360 * s), height: Math.round(72 * s) },
    });

    // N 스킵이 엔드리스에서도 동작(승리 재판정 없이 다음 웨이브로) — 몇 번 더 눌러 진행.
    stage = 'endless-skips';
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('n');
      await page.waitForTimeout(120);
    }
    // 엔드리스에선 승리가 없으므로 스킵을 반복해도 승리 버튼이 뜨면 안 된다.
    check(!(await endlessBtn.isVisible().catch(() => false)), '엔드리스 스킵 중 승리 오버레이가 떴음(승리 재판정 발생)');

    // ── 3) 무방비 방치 → 패배 → 기록 ──
    // 마지막으로 새 웨이브를 시작(다음 웨이브 버튼)하고 스킵하지 않으면, 타워가 없어 적이 기지에
    // 도달하며 라이프가 0으로 떨어진다. x3로 가속해 패배(다시 시작 버튼 노출)까지 기다린다.
    stage = 'let-lose';
    await nextBtn.click();
    await vis(page, '.speed-btn:has-text("x3")').click();
    const restartBtn = vis(page, '.restart-btn');
    const lost = await waitUntil(page, async () => await restartBtn.isVisible().catch(() => false), 60000);
    check(lost, '무방비 방치 60초 내 패배하지 않음(라이프 0 미도달)');

    // 엔드리스 도달 웨이브가 기록되었는지 확인(21 이상).
    const rec = await page.evaluate(() => {
      try { return Number(JSON.parse(localStorage.getItem('gridlock.save') ?? '{}').endlessBest ?? 0); }
      catch { return 0; }
    });
    check(rec >= 21, `엔드리스 기록이 저장되지 않음(기대 ≥21, 실제 ${rec})`);

    // ── 타이틀 복귀 → 엔드리스 기록 표시 ──
    stage = 'to-title';
    await vis(page, '.to-title-btn').click();
    await page.waitForTimeout(500);
    check(!(await nextBtn.isVisible().catch(() => false)), '타이틀 복귀 후에도 컨트롤 바가 보임');
    await page.screenshot({ path: join(OUT, 'endless-demo-02-title.png') });

    stage = 'page-errors';
    check(errors.length === 0, `페이지 런타임 오류 ${errors.length}건: ${errors.join(' | ')}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  process.stderr.write(`[endless-demo] FAIL @ ${stage}: ${err.message}\n`);
  process.exit(1);
});

// 디펜스 모드 터치 회귀(D8.2/D8.3/D8.4) + 시드 부제 가독성(D9.5).
//   defenseStage — 터치 진입 → 2탭 배치(첫 탭 골드 불변 → 재탭 차감) → 웨이브 1 시작·완주.
//   seedStage    — 랜덤 맵 진입 후 HUD 시드 줄이 화면상 12px 잉크 이상인지 실측.
// 시드 줄은 캔버스에 그려서 DOM으로 못 재므로 렌더와 같은 폰트로 measureText 한 값을
// window.__gridlockHudMetrics로 받아 캔버스 축소비로 환산한다.

import {
  ARROW_COST,
  assertScreen,
  balance,
  canvasMapper,
  check,
  log,
  MIN_INK,
  savedMap,
  seedTextScreenSize,
  setStage,
  shot,
  tap,
  vis,
  waitUntil,
} from './shared.mjs';
import { MOBILE_DEFENSE_TAB, MOBILE_PAGE_NEXT, mobileCardCenter } from '../titleCoords.mjs';
import { assertTitleTargets, mapPageSlot } from './mobileTitle.mjs';

/** 터치 진입 → 2탭 배치 → 웨이브 1 완주. 저장된 맵(기본 classic)에서 진행한다. */
export async function defenseStage(page, url) {
  setStage('defense-enter');
  await page.goto(url);
  await page.waitForTimeout(1200);
  const t0 = await canvasMapper(page);
  assertTitleTargets(t0.s);
  await tap(page, t0.pt(...MOBILE_DEFENSE_TAB), 700); // 디펜스는 활성 섹션이라 탭 1회로 진입.
  check(await vis(page, '.tower-btn').isVisible(), '디펜스 진입 실패(빌드 메뉴가 안 보임)');
  const { cell } = await canvasMapper(page); // 인게임 UI 노출로 캔버스 위치가 바뀌므로 재계산.
  await assertScreen(page, 'defense', { minButtons: 6 });
  await shot(page, '04-defense');

  const g0 = (await balance(page))?.gold;
  check(typeof g0 === 'number', '골드 텔레메트리(window.__gridlockBalance)를 읽지 못함');

  // 2탭 배치: 첫 탭 = 대기 칸(골드 불변) → 다른 칸 탭 = 대기 칸 이동(여전히 불변) → 재탭 = 확정(차감).
  setStage('defense-2tap');
  await vis(page, '.tower-btn:has-text("애로우")').tap();
  await page.waitForTimeout(200);
  check((await page.locator('.tower-btn.active').locator('visible=true').count()) === 1, '타워 버튼 탭으로 설치 모드가 켜지지 않음');

  await tap(page, cell(8, 6), 260);
  const gA = (await balance(page)).gold;
  check(gA === g0, `첫 탭에서 즉시 배치됨(골드 ${g0}→${gA}) — 2탭 확정 규칙 위반`);
  await shot(page, '05-defense-tap1-pending');

  await tap(page, cell(12, 6), 260);
  const gB = (await balance(page)).gold;
  check(gB === g0, `대기 칸 이동 탭에서 골드가 변함(${g0}→${gB})`);

  await tap(page, cell(12, 6), 400);
  const gC = (await balance(page)).gold;
  check(gC === g0 - ARROW_COST, `재탭 확정 실패 — 골드 ${g0}→${gC}(기대 ${g0 - ARROW_COST})`);
  log(`2탭 배치: 첫 탭 골드 ${g0} 유지 → 재탭 확정 ${g0}→${gC}(-${ARROW_COST})`);
  await shot(page, '06-defense-tap2-placed');

  // 웨이브를 넘길 화력 확보 — 통로 중반(8,6)과 스폰 앞(0,6)에 2탭으로 마저 배치.
  // 골드를 다 쓰면 타워 버튼이 disabled가 되어 설치 모드를 탭으로 못 끄므로 여유를 남긴다.
  setStage('defense-place-rest');
  for (const c of [[8, 6], [0, 6]]) {
    await tap(page, cell(...c), 200);
    await tap(page, cell(...c), 300);
  }
  const placed = (await balance(page)).gold;
  check(placed === g0 - ARROW_COST * 3, `추가 2기 2탭 배치 실패(골드 ${placed}, 기대 ${g0 - ARROW_COST * 3})`);

  // 타워 패널 열림 상태의 터치 타깃(업그레이드·판매·특화)까지 감사.
  setStage('defense-panel');
  await vis(page, '.tower-btn:has-text("애로우")').tap(); // 설치 모드 해제.
  await page.waitForTimeout(200);
  await tap(page, cell(12, 6), 300);
  check(await vis(page, '.tower-panel').isVisible(), '설치된 타워 탭에 정보 패널이 안 뜸');
  await assertScreen(page, 'defense+panel', { minButtons: 8 });
  await shot(page, '07-defense-panel');
  await tap(page, cell(15, 11), 200); // 빈 곳 탭 = 패널 닫기.

  // 웨이브 1 시작 → 진행 → 완주.
  setStage('defense-wave');
  await vis(page, '.speed-btn:has-text("x3")').tap();
  const nextBtn = vis(page, '.next-wave-btn');
  const inProgress = async () => (await nextBtn.getAttribute('data-inprogress')) === 'true';
  check(await nextBtn.isEnabled(), '웨이브 시작 전 다음 웨이브 버튼이 비활성');
  await nextBtn.tap();
  check(await waitUntil(page, inProgress, 8000), '다음 웨이브 탭에도 웨이브가 시작되지 않음(진행 상태 전이 없음)');
  const started = await balance(page);
  check(started.wave >= 1, `웨이브 번호가 갱신되지 않음(wave=${started.wave})`);
  await shot(page, '08-defense-wave1');

  check(await waitUntil(page, async () => !(await inProgress()), 60000), '웨이브 1이 제한 시간 내 완료되지 않음');
  const done = await balance(page);
  check(done.state === 'playing', `웨이브 1 완료 대신 게임이 종료됨(state=${done.state})`);
  await shot(page, '09-defense-wave1-clear');
  log(`웨이브 1 터치 시작 → 완주(라이프 ${done.lives}, 골드 ${done.gold})`);
}

/**
 * D9.5 — 랜덤 맵(시드 부제가 뜨는 유일한 경로 중 하나)으로 진입해 시드 줄 크기를 실측한다.
 * 카드 선택은 compact 페이지 2의 슬롯을 통해서만 가능하므로 페이지 이동도 겸해 밟는다.
 */
export async function seedStage(page, url) {
  setStage('seed-select-random');
  await page.goto(url);
  await page.waitForTimeout(1200);
  const { pt } = await canvasMapper(page);
  const { page: mapPage, slot } = mapPageSlot('random');
  for (let i = 0; i < mapPage; i++) await tap(page, pt(...MOBILE_PAGE_NEXT), 250);
  await tap(page, pt(...mobileCardCenter(slot)), 220);
  check((await savedMap(page)).map === 'random', `랜덤 맵 카드 선택 실패(${(await savedMap(page)).map})`);

  setStage('seed-enter');
  await tap(page, pt(...MOBILE_DEFENSE_TAB), 900);
  check(await vis(page, '.tower-btn').isVisible(), '랜덤 맵 디펜스 진입 실패(빌드 메뉴가 안 보임)');
  await assertScreen(page, 'defense-random', { minButtons: 6 });

  setStage('seed-readability');
  const m = await seedTextScreenSize(page, '시드 #12345678');
  check(m.scale > 1, `모바일인데 hudScale이 ${m.scale}(축소 보정이 걸리지 않음)`);
  check(
    m.screenInkPx >= MIN_INK,
    `시드 부제 잉크 높이 ${m.screenInkPx.toFixed(2)}px < ${MIN_INK}px(화면상) — 기준 폰트 상향이 되돌아갔는지 확인`,
  );
  await shot(page, '10-defense-seed');
  log(
    `시드 부제 실측: 배율 ${m.scale.toFixed(2)}, 논리 ${m.fontPx}px → 화면 폰트 ${m.screenFontPx.toFixed(2)}px / 잉크 ${m.screenInkPx.toFixed(2)}px (≥${MIN_INK})`,
  );
}

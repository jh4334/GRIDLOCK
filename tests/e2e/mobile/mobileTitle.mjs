// 타이틀 compact 레이아웃 검증(D9.3 → D9.5 보강) — 캔버스에 그린 화면이라 DOM button이 없다.
// 논리 rect를 캔버스 축소비로 환산해 터치 타깃을 재고, 상태 전이는 localStorage 저장값으로 본다
// (탭한 카드가 실제로 선택되어야 저장값이 바뀐다 = 그린 자리와 누른 자리가 일치한다는 증거).
//
// D9.5 신규: 페이지네이션 이동(1↔2)과 섹션 탭 전환·재탭 진입을 타이틀에서 직접 검증한다.
// (정복 진입 경로의 재탭은 mobileConquest가 따로 밟지만, 여기서는 '진입하지 않는' 전환만 본다.)

import {
  assertScreen,
  canvasMapper,
  check,
  conq,
  log,
  MIN_TARGET,
  savedMap,
  setStage,
  shot,
  tap,
} from './shared.mjs';
import {
  MOBILE_CONQUEST_TAB,
  MOBILE_DEFENSE_TAB,
  MOBILE_PER_PAGE,
  mobileCardCenter,
  mobileCardRect,
  mobileDiffCenter,
  mobileDiffRect,
  mobilePageRect,
  MOBILE_PAGE_NEXT,
  MOBILE_PAGE_PREV,
  mobileTabRect,
} from '../titleCoords.mjs';

// 디펜스 맵 순서(maps.json 정의 순 + 절차 생성 2종) — compact은 4장/페이지라 아래 인덱스가
// 곧 (페이지, 슬롯)이다. 0=classic … 5=pincer, 6=random, 7=daily.
export const DEFENSE_MAP_ORDER = ['classic', 'canyon', 'twinriver', 'ruins', 'crossroads', 'pincer', 'random', 'daily'];
export const mapPageSlot = (id) => {
  const i = DEFENSE_MAP_ORDER.indexOf(id);
  return { page: Math.floor(i / MOBILE_PER_PAGE), slot: i % MOBILE_PER_PAGE };
};

/** 타이틀 히트 영역(논리 rect)이 화면상 44px 이상인지 — 캔버스 축소비 scale로 환산해 잰다. */
export function assertTitleTargets(scale) {
  setStage('title-targets');
  const targets = [
    ['디펜스 탭', mobileTabRect('defense')],
    ['정복 탭', mobileTabRect('conquest')],
    ...[0, 1, 2, 3].map((i) => [`맵 카드 ${i}`, mobileCardRect(i)]),
    ['이전 페이지', mobilePageRect('prev')],
    ['다음 페이지', mobilePageRect('next')],
    ...[0, 1, 2].map((i) => [`난이도 ${i}`, mobileDiffRect(i)]),
  ];
  const small = targets
    .map(([name, r]) => [name, +(r.w * scale).toFixed(1), +(r.h * scale).toFixed(1)])
    .filter(([, w, h]) => w < MIN_TARGET || h < MIN_TARGET)
    .map(([name, w, h]) => `${name} ${w}×${h}`);
  check(small.length === 0, `타이틀: ${MIN_TARGET}px 미달 터치 타깃 ${small.length}건 — ${small.join(', ')}`);
  log(`타이틀 터치 타깃 ${targets.length}개 전부 ${MIN_TARGET}px 이상(캔버스 축소비 ${scale.toFixed(3)})`);
}

/**
 * 타이틀 compact 전용 스테이지(D9.5) — 페이지 이동과 섹션 전환만 검증하고 게임에는 들어가지 않는다.
 * 끝나면 디펜스 섹션 · 페이지 0 · classic 선택 상태로 되돌려 뒤 스테이지가 기본 맵에서 시작한다.
 */
export async function titleStage(page, url) {
  setStage('title-enter');
  await page.goto(url);
  await page.waitForTimeout(1200); // 에셋 로드(assetsReady) 대기.
  await assertScreen(page, 'title', { minButtons: 0 }); // 타이틀 버튼은 캔버스 내부라 DOM button이 0개.
  await shot(page, '01-title');
  const { pt } = await canvasMapper(page);

  // 1) 페이지 1 — 첫 슬롯은 classic(인덱스 0). 저장값이 바뀌어야 카드 탭이 먹은 것.
  setStage('title-page1');
  await tap(page, pt(...mobileCardCenter(0)), 200);
  check((await savedMap(page)).map === 'classic', `페이지 1 슬롯 0 탭이 classic을 선택하지 않음(${(await savedMap(page)).map})`);

  // 2) 다음 페이지 → 페이지 2. 같은 슬롯 0이 이제 crossroads(인덱스 4)여야 한다.
  setStage('title-page-next');
  await tap(page, pt(...MOBILE_PAGE_NEXT), 250);
  await tap(page, pt(...mobileCardCenter(0)), 200);
  const onPage2 = (await savedMap(page)).map;
  check(onPage2 === 'crossroads', `다음 페이지 이동 실패 — 슬롯 0이 ${onPage2}(기대 crossroads)`);
  await shot(page, '02-title-page2');

  // 3) 이전 페이지 → 페이지 1 복귀. 슬롯 0이 다시 classic.
  setStage('title-page-prev');
  await tap(page, pt(...MOBILE_PAGE_PREV), 250);
  await tap(page, pt(...mobileCardCenter(0)), 200);
  const backToPage1 = (await savedMap(page)).map;
  check(backToPage1 === 'classic', `이전 페이지 이동 실패 — 슬롯 0이 ${backToPage1}(기대 classic)`);
  log('타이틀 페이지네이션 OK — 1페이지 classic → 2페이지 crossroads → 1페이지 classic');

  // 4) 섹션 탭 — 비활성(정복) 탭 1탭은 전환만(진입 아님). 전환됐다면 같은 자리 카드가 정복 맵이다.
  setStage('title-section-conquest');
  await tap(page, pt(...MOBILE_CONQUEST_TAB), 300);
  check((await conq(page)) === null, '정복 탭 첫 탭에서 게임에 진입함 — 섹션 전환 규칙 위반');
  await tap(page, pt(...mobileCardCenter(1)), 200); // 정복 맵 2번째 = ridge.
  const conquestMap = (await savedMap(page)).conquestMap;
  check(conquestMap === 'ridge', `정복 섹션 전환 실패 — 카드 1 탭이 conquestMap을 ${conquestMap}로 저장(기대 ridge)`);
  // 난이도 줄은 정복 섹션에서만 보인다 — 눌러서 저장값으로 확인.
  await tap(page, pt(...mobileDiffCenter(2)), 200);
  check((await savedMap(page)).difficulty === 'hard', '정복 섹션 난이도 버튼이 동작하지 않음');
  await shot(page, '03-title-conquest-section');
  log('섹션 탭 OK — 정복 탭 1탭 = 전환(진입 없음), 정복 카드·난이도 반응');

  // 5) 디펜스 탭으로 되돌리기(전환) → 같은 자리 카드가 다시 디펜스 맵.
  setStage('title-section-defense');
  await tap(page, pt(...MOBILE_DEFENSE_TAB), 300);
  await tap(page, pt(...mobileCardCenter(1)), 200);
  check((await savedMap(page)).map === 'canyon', `디펜스 섹션 복귀 실패 — 카드 1이 ${(await savedMap(page)).map}(기대 canyon)`);

  // 뒤 스테이지가 기본 맵(classic)에서 시작하도록 되돌린다. 난이도도 easy로(정복 스테이지 기준).
  setStage('title-reset');
  await tap(page, pt(...mobileCardCenter(0)), 200);
  await tap(page, pt(...MOBILE_CONQUEST_TAB), 250);
  await tap(page, pt(...mobileDiffCenter(0)), 200);
  await tap(page, pt(...MOBILE_DEFENSE_TAB), 250);
  const s = await savedMap(page);
  check(s.map === 'classic' && s.difficulty === 'easy', `타이틀 초기화 실패(map=${s.map}, difficulty=${s.difficulty})`);
  log('섹션 재전환 OK — 디펜스 복귀 후 기본 선택(classic/easy)으로 정리');
}

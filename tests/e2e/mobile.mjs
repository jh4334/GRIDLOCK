// GRIDLOCK 모바일 E2E 오케스트레이터 (D8.6 → D9.5) — 390×844 / hasTouch / deviceScaleFactor 2
// 컨텍스트 하나로 D8.1~D9.5의 터치 회귀를 순서대로 밟는다. run.mjs에는 이 파일만 등록한다.
//
// 스테이지가 늘어 파일이 300줄을 넘겨(CLAUDE.md) tests/e2e/mobile/ 아래로 나눴다:
//   mobile/shared.mjs        — 실행 상수·밸런스 데이터·탭/대기 유틸·레이아웃·터치 타깃 감사
//   mobile/mobileTitle.mjs   — compact 타이틀(터치 타깃, 페이지네이션, 섹션 탭 전환)
//   mobile/mobileDefense.mjs — 디펜스 2탭 배치·웨이브 + 시드 부제 가독성 실측
//   mobile/mobileConquest.mjs— 정복 탭 명령·건설 2탭 + 컨트롤 바(공격이동·부대 버튼)
//
// 검증 항목:
//   1) 레이아웃 — 가로 스크롤 없음(scrollWidth = 뷰포트 폭) + 뷰포트 넘는 요소 0건 (D8.1)
//   2) 터치 타깃 — 보이는 button 전부 44px 이상 + 서로 겹치지 않음 (D8.4)
//   3) 타이틀 compact — 히트 영역 화면상 44px 이상, 페이지 1↔2 이동, 섹션 탭 전환·재탭 진입 (D9.3)
//   4) 디펜스 — 터치 진입 → 2탭 배치 → 웨이브 1 시작·완주 (D8.2/D8.3)
//   5) 시드 부제 — 랜덤 맵 진입 후 시드 줄 잉크 높이 화면상 12px 이상 (D9.5)
//   6) 정복 — 탭 이동 명령·건설 2탭 (D8.5) + 부대 저장·호출, 공격이동 토글·명령 (D9.4)
//
// 스테이지끼리는 페이지를 다시 로드해 상태를 격리하되 localStorage(선택 맵·난이도)는 공유한다 —
// 앞 스테이지가 남긴 선택이 뒤 스테이지 전제이므로 실행 순서를 바꾸지 말 것.
//
// 실패 시 어느 단계에서 깨졌는지 stderr 한 줄 + 비-0 종료(runner가 감지).

import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { BASE_URL, check, currentStage, log, OUT, PW_CHROMIUM, setStage, VIEWPORT } from './mobile/shared.mjs';
import { titleStage } from './mobile/mobileTitle.mjs';
import { defenseStage, seedStage } from './mobile/mobileDefense.mjs';
import { commandBarStage, conquestStage } from './mobile/mobileConquest.mjs';

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
    await titleStage(page, BASE_URL);
    await defenseStage(page, BASE_URL);
    await seedStage(page, BASE_URL);
    await conquestStage(page, BASE_URL);
    await commandBarStage(page, BASE_URL);
    setStage('page-errors');
    check(errors.length === 0, `페이지 런타임 오류 ${errors.length}건: ${errors.join(' | ')}`);
    log('모바일 스위트 전체 통과');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  process.stderr.write(`[mobile] FAIL @ ${currentStage()}: ${err.message}\n`);
  process.exit(1);
});

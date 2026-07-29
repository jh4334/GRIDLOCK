// D9.5 HUD 가독성 검증 훅 — 시드 부제가 화면상 몇 px로 보이는지를 캔버스 밖(Playwright)에서
// 실측하게 한다. 시드 줄은 캔버스에 그려져 DOM으로 잴 수 없고, 픽셀 스캔은 배경(지형)에 따라
// 흔들려 회귀 테스트로 못 쓴다. 그래서 렌더가 쓰는 폰트 그대로 measureText 한 값을 노출한다.
//
// balanceProbe.exposeSeedPlay와 같은 패턴 — 매 프레임 발행이 아니라 호출형 훅이라 렌더/업데이트
// 어디에도 개입하지 않는다. 게임 로직은 이 노출을 참조하지 않는다(읽기 전용 debug 경로).

import type { SeedTextMetrics } from '../ui/hud';

/** window.__gridlockHudMetrics(text) 로 시드 줄의 논리 폰트·잉크 높이를 재게 한다. */
export function exposeHudMetrics(measure: (text: string) => SeedTextMetrics): void {
  (window as unknown as { __gridlockHudMetrics?: (text: string) => SeedTextMetrics }).__gridlockHudMetrics = measure;
}

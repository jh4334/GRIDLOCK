// D5.1 스웜 스트레스 하네스 텔레메트리 — 캔버스 밖(Playwright)에서 필드 적 수와 진행 상태를 읽어
// "120+ 동시 유지"와 "샘플 구간 내내 월드가 살아 있었는지(패배로 갱신이 멈추지 않았는지)"를
// 확인하는 용도. 읽기 전용이며 게임 로직은 이 값을 참조하지 않는다.

interface StressTelemetry {
  enemies: number;
  playing: boolean;
}

/** 매 프레임 window에 현재 필드 적 수와 playing 여부를 발행한다(스트레스 데모 전용). */
export function publishStressTelemetry(enemies: number, playing: boolean): void {
  (window as unknown as { __gridlockStress?: StressTelemetry }).__gridlockStress = { enemies, playing };
}

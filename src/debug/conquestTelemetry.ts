// D8.5 정복 터치 검증 텔레메트리 — 캔버스 밖(Playwright)에서 선택 수와 아군 좌표를 읽어
// "탭 선택 / 탭 명령으로 실제 이동" 을 좌표 변화로 확인하는 용도. 읽기 전용이며
// 게임 로직은 이 값을 참조하지 않는다(stressTelemetry와 같은 패턴).

interface Mob {
  x: number;
  y: number;
}

export interface ConquestTelemetry {
  crystal: number;
  selectedUnits: number;
  selectedWorkers: number;
  units: Mob[]; // 아군 전투 유닛.
  workers: Mob[]; // 아군 일꾼.
  enemyUnits: number; // 적 전투 유닛 수(교전 성립 확인용).
}

/** 매 프레임 window에 현재 선택 수·아군 좌표를 발행한다(터치/모바일 검증 전용). */
export function publishConquestTelemetry(t: ConquestTelemetry): void {
  (window as unknown as { __gridlockConquest?: ConquestTelemetry }).__gridlockConquest = t;
}

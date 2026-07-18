// D7.7 맵별 밸런스 측정용 debug 훅 — 기준 플레이어 봇(tests/e2e/balance-probe.mjs)이 맵을 공정하게
// 실측하도록 두 가지를 window에 노출한다. 게임 로직은 이 노출을 참조하지 않는다.
//   ① publishBalanceTelemetry: 매 프레임 골드/라이프/웨이브/상태를 window.__gridlockBalance에
//      발행(읽기 전용). 봇이 이 값으로만 판단하므로 캔버스 밖 실측이 캔버스 안 상태와 일치한다.
//   ② exposeSeedPlay: window.__gridlockPlaySeed(seed)로 특정 시드 랜덤맵 디펜스를 강제 진입시킨다.
//      타이틀 UI엔 시드 강제 경로가 없어(랜덤=Date, 오늘의 맵=날짜) 고정 시드(1001~1003) 실측이
//      불가능하므로, 측정 전용으로만 debug 주입 경로를 연다(읽기 전용 원칙의 최소 예외).

export interface BalanceTelemetry {
  gold: number;
  lives: number;
  wave: number; // 마지막으로 시작된 웨이브 번호(WaveManager.current). 패배 시 = 도달 웨이브.
  state: string; // GameFlow.state: 'menu' | 'playing' | 'won' | 'lost'.
  inProgress: boolean; // 진행 중(미완료) 웨이브가 하나라도 있는가.
  canStart: boolean; // 다음 웨이브를 시작할 수 있는가(남은 웨이브 존재/엔드리스).
  endless: boolean; // 엔드리스 구간 여부(측정에선 20웨이브 승리로 종료하므로 참고용).
}

/** 매 프레임 골드/라이프/웨이브/상태를 window에 발행한다(밸런스 측정 봇 전용, 읽기 전용). */
export function publishBalanceTelemetry(t: BalanceTelemetry): void {
  (window as unknown as { __gridlockBalance?: BalanceTelemetry }).__gridlockBalance = t;
}

/** window.__gridlockPlaySeed(seed) 로 시드 맵 디펜스를 강제 진입하게 한다(App이 진입 콜백 주입). */
export function exposeSeedPlay(enter: (seed: number) => void): void {
  (window as unknown as { __gridlockPlaySeed?: (seed: number) => void }).__gridlockPlaySeed = enter;
}

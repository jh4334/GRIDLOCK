// 게임 진행 상태 머신.
//   playing — 정상 진행(적/타워/투사체/웨이브 갱신).
//   won     — 20웨이브 클리어(스폰 완료 + 적 전멸 + 클리어 보너스 지급).
//   lost    — 기지 라이프 0.
// won/lost 상태에서는 게임 월드 갱신을 멈추고 오버레이 + 다시 시작 버튼만 남는다.
//
// (menu 상태는 M9의 타이틀 화면에서 추가 예정 — 지금은 부팅 즉시 playing.)
export type GameState = 'playing' | 'won' | 'lost';

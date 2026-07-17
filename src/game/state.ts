// 게임 진행 상태 머신.
//   menu    — 타이틀 화면(M9). 게임 월드 정지, 빌드 메뉴·컨트롤 바 숨김. 시작 대기.
//   playing — 정상 진행(적/타워/투사체/웨이브 갱신).
//   won     — 20웨이브 클리어(스폰 완료 + 적 전멸 + 클리어 보너스 지급).
//   lost    — 기지 라이프 0.
// won/lost 상태에서는 게임 월드 갱신을 멈추고 오버레이 + 다시 시작/타이틀로 버튼만 남는다.
//
// 상태 전이:
//   menu ──(클릭/Space)──▶ playing ──(20웨이브 클리어)──▶ won
//                                  └─(라이프 0)──────────▶ lost
//   won/lost ──(R·다시 시작)──▶ playing
//   won/lost ──(타이틀로)─────▶ menu
export type GameState = 'menu' | 'playing' | 'won' | 'lost';

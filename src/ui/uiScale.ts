// 캔버스 CSS 축소 보정(D8.4) — 모바일에선 캔버스 내부 해상도(960×672)가 CSS로 크게 축소되어
// (390px 폭에서 약 0.4배) 캔버스 좌표계로 그린 HUD 텍스트가 화면상 6~7px까지 작아진다.
// 렌더 시점에 "내부 해상도 / CSS 폭" 비율을 읽어 폰트·여백 px를 그만큼 키우면 화면상 크기가
// 유지된다(내부 해상도·게임 로직은 불변, 그리는 크기만 보정).
//
// 상태를 만지지 않는 읽기 전용 헬퍼라 render에서 호출해도 update/render 분리 규칙을 지킨다.
// 배율은 시각 상수(밸런스 아님)이므로 코드 상수로 둔다.

const MIN_SCALE = 1; // 축소가 없는 데스크톱(비율 1) 이하에서는 기존 렌더와 완전히 동일.
const MAX_SCALE = 2; // 과확대로 HUD가 전장을 덮지 않게 두는 상한.

/**
 * HUD·오버레이 텍스트에 곱할 배율. 캔버스가 CSS로 축소된 만큼(최대 2배) 키운다.
 * 데스크톱(CSS 폭 = 내부 폭)에서는 항상 1이라 렌더 결과가 바뀌지 않는다.
 */
export function hudScale(canvas: HTMLCanvasElement): number {
  const cssW = canvas.clientWidth;
  if (!(cssW > 0)) return MIN_SCALE; // 레이아웃 전(0)·비DOM 캔버스에서는 보정하지 않는다.
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, canvas.width / cssW));
}

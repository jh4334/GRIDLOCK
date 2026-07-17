// NEON GRID 아트 팔레트 — 홀로그램 전장 컨셉의 공용 색 상수.
// 모든 스프라이트 모듈이 이 팔레트를 참조해 색을 통일한다(밸런스가 아닌 시각 상수).
//
// 진영 규칙: 아군=시안/블루, 적=마젠타/레드/오렌지, 자원/골드=앰버, 크리스탈=민트.

// 배경(다크 네이비 회로기판).
export const BG_DEEP = '#0d1117';
export const BG_MID = '#161b27';
export const BG_FLOOR = '#12172080'; // 바닥 살짝 밝은 톤(반투명 결합용).

// 아군(시안/블루).
export const ALLY_CYAN = '#39d5ff';
export const ALLY_BLUE = '#4d8dff';

// 적(마젠타/레드/오렌지).
export const FOE_MAGENTA = '#ff4d6a';
export const FOE_RED = '#ff3b5c';
export const FOE_ORANGE = '#ff7a5c';

// 자원·크리스탈.
export const GOLD = '#ffc94d';
export const MINT = '#4dffd5';

// 회로기판 디테일(아주 옅게).
export const GRID_LINE = 'rgba(110, 170, 255, 0.055)';
export const TRACE_LINE = 'rgba(90, 150, 220, 0.10)';
export const TRACE_NODE = 'rgba(120, 200, 255, 0.16)';

// 공용 어두운 베이스/외곽.
export const PLATE_DARK = '#1b2233';
export const PLATE_EDGE = '#0a0e16';

/** 16진 색(#rrggbb)에 알파(0~1)를 붙여 rgba 문자열로. 반투명 글로우 표현에 쓴다. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

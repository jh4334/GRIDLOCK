// 타이틀 좌표 공용 헬퍼(D7.6) — 썸네일 카드 그리드로 개편된 타이틀의 버튼·카드 중심을
// 캔버스 논리 좌표(960×672)로 계산한다. src/ui/titleButtons.ts + src/ui/mapCards.ts의
// 레이아웃 상수와 반드시 일치. 여러 데모가 하드코딩하던 타이틀 좌표를 여기로 모았다.
//
// 반환값은 캔버스 논리 좌표 [x, y]다. 각 데모는 자신의 pt()로 화면 좌표로 환산해 클릭한다.

export const GAME_W = 960;
export const GAME_H = 672;
export const TILE = 48;

// 모드 버튼(titleButtons.ts).
const BTN_W = 200, BTN_H = 46;
const DEFENSE_BTN_Y = 108, CONQUEST_BTN_Y = 402;

// 난이도 3버튼(정복 버튼 오른쪽).
const DBTN_W = 74, DBTN_H = 34, DBTN_GAP = 6, PAIR_GAP = 20;

// 맵 카드(mapCards.ts).
const THUMB_W = 120, THUMB_H = 84, COL_GAP = 12, DEF_COLS = 4;
const LABEL_BAND = 20, ROW_PITCH = THUMB_H + LABEL_BAND + 2, GRID_GAP = 16;

function defenseBtnRect() {
  return { x: GAME_W / 2 - BTN_W / 2, y: DEFENSE_BTN_Y, w: BTN_W, h: BTN_H };
}
function conquestBtnRect() {
  const diffTotalW = DBTN_W * 3 + DBTN_GAP * 2;
  const pairW = BTN_W + PAIR_GAP + diffTotalW;
  return { x: GAME_W / 2 - pairW / 2, y: CONQUEST_BTN_Y, w: BTN_W, h: BTN_H };
}

/** 디펜스 모드 버튼 중앙. */
export const DEFENSE_BTN = (() => { const r = defenseBtnRect(); return [r.x + r.w / 2, r.y + r.h / 2]; })();
/** 정복 모드 버튼 중앙. */
export const CONQUEST_BTN = (() => { const r = conquestBtnRect(); return [r.x + r.w / 2, r.y + r.h / 2]; })();

/** 난이도 버튼 i(0=쉬움,1=보통,2=어려움) 중앙. */
export function difficultyCenter(i) {
  const conq = conquestBtnRect();
  const startX = conq.x + conq.w + PAIR_GAP;
  const y = conq.y + (conq.h - DBTN_H) / 2;
  return [startX + i * (DBTN_W + DBTN_GAP) + DBTN_W / 2, y + DBTN_H / 2];
}
export const DIFF_EASY = difficultyCenter(0);
export const DIFF_NORMAL = difficultyCenter(1);
export const DIFF_HARD = difficultyCenter(2);

/**
 * 디펜스 맵 카드 i번째 중앙. 그리드는 항상 4열 고정(부분 마지막 줄은 좌측 정렬).
 * 맵 순서: classic(0)·canyon(1)·twinriver(2)·ruins(3)·crossroads(4)·pincer(5)·random(6)·daily(7).
 */
export function defenseCardCenter(i) {
  const btn = defenseBtnRect();
  const top = btn.y + btn.h + GRID_GAP;
  const gridW = DEF_COLS * THUMB_W + (DEF_COLS - 1) * COL_GAP;
  const startX = GAME_W / 2 - gridW / 2;
  const row = Math.floor(i / DEF_COLS), col = i % DEF_COLS;
  const x = startX + col * (THUMB_W + COL_GAP);
  const y = top + row * ROW_PITCH;
  return [x + THUMB_W / 2, y + THUMB_H / 2];
}

/** 정복 맵 카드 i번째 중앙(한 줄). total=카드 수(정복 맵 개수). */
export function conquestCardCenter(i, total) {
  const btn = conquestBtnRect();
  const top = btn.y + btn.h + GRID_GAP;
  const gridW = total * THUMB_W + (total - 1) * COL_GAP;
  const startX = GAME_W / 2 - gridW / 2;
  const x = startX + i * (THUMB_W + COL_GAP);
  return [x + THUMB_W / 2, top + THUMB_H / 2];
}

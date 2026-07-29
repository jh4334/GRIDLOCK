// 타이틀 레이아웃(D9.3) — 렌더와 히트 판정이 공유하는 단 하나의 기하 소스.
//
// 배경: 타이틀은 전부 캔버스에 그린다. 캔버스는 논리 960×672를 CSS로 축소해 보여주므로
// 390px 폭 모바일에서는 화면 배율이 0.406(390/960)까지 떨어진다 — 13px 라벨이 화면상 5.3px,
// 46px 버튼이 18.7px가 되어 읽을 수도 누를 수도 없다. 논리 좌표를 그대로 키우는 것 외에
// 방법이 없고(캔버스 CSS 크기는 뷰포트 폭에 묶여 있다), 전 요소를 2배로 키우면 세로 예산
// 672px을 넘는다. 그래서 좁은 화면에서는 레이아웃 자체를 바꾼다(compact):
//   · 모드 버튼 2개 = 섹션 탭. 선택 안 된 탭 = 섹션 전환, 선택된 탭 = 게임 시작(2탭 확정 idiom).
//   · 활성 섹션의 맵 카드만 2열×2행(4장)으로 크게 보여주고 넘치면 페이지 버튼으로 넘긴다.
//   · 난이도는 정복 섹션에서만(정복 전용 설정), 하단 줄에 크게.
// 데스크톱(배율 1)은 wide 레이아웃 = D7.6 값 그대로라 렌더 결과가 완전히 동일하다.
//
// 화면상 크기 기준(390px 기준 배율 0.40625): 44px 터치 타깃 = 논리 108px, 12px 잉크 ≈ 논리 40px 폰트.
// 아래 compact 상수는 이 두 기준을 세로 예산 672px 안에서 만족하도록 잡은 값이다.

import { conquestMapList, type ConquestMapId, type DifficultyId, type MapId } from '../core/storage';
import { mapList } from '../game/maps';
import { THUMB_W, THUMB_H } from './mapThumbnail';
import { VIEW_W, VIEW_H } from '../render/viewport';

export type TitleMode = 'defense' | 'conquest';

export interface Rect { x: number; y: number; w: number; h: number }

/** 타이틀 UI 상태 — 렌더·히트 판정이 같은 값을 받아야 오탭이 없다. scale은 hudScale(캔버스). */
export interface TitleUi { scale: number; section: TitleMode; page: number }

export const DEFAULT_TITLE_UI: TitleUi = { scale: 1, section: 'defense', page: 0 };

// 레이아웃 분기 기준 — 캔버스가 논리 폭의 2/3(=640px) 이하로 축소되면 compact.
// 데스크톱 스위트(1280px 뷰포트 → 캔버스 960px)는 배율 1이라 항상 wide다.
const COMPACT_SCALE = 1.5;

function isCompactTitle(scale: number): boolean {
  return scale >= COMPACT_SCALE;
}

// rect는 썸네일 사각형. 히트 영역은 아래 라벨 밴드까지 포함한다(cardHitRect).
interface CardSlot<T> { id: T; name: string; rect: Rect }

// subFont 0 = 부제 없음(compact).
export interface BtnStyle { labelFont: number; labelDy: number; subFont: number; subDy: number }

// badgeBandDy/badgeTextDy는 카드 하단 기준 오프셋(음수).
export interface CardStyle {
  thumbW: number; thumbH: number; labelBand: number; labelFont: number; labelDy: number;
  badgeFont: number; badgeBandH: number; badgeBandDy: number; badgeTextDy: number; badgePadX: number;
}

interface TextSpec { x: number; y: number; font: number }

export interface TitleLayout {
  compact: boolean;
  section: TitleMode;
  logo: TextSpec;
  subtitle: TextSpec | null; // compact은 세로 예산상 생략.
  defenseBtn: Rect;
  conquestBtn: Rect;
  btn: BtnStyle;
  difficulty: { list: { id: DifficultyId; label: string; rect: Rect }[]; caption: TextSpec; btnFont: number } | null;
  defenseCards: CardSlot<MapId>[];
  conquestCards: CardSlot<ConquestMapId>[];
  card: CardStyle;
  pager: { prev: Rect; next: Rect; label: Rect; font: number; index: number; total: number } | null;
  best: TextSpec & { align: CanvasTextAlign; short: boolean };
  endless: TextSpec & { align: CanvasTextAlign };
}

const DIFF_ORDER: { id: DifficultyId; label: string }[] = [
  { id: 'easy', label: '쉬움' },
  { id: 'normal', label: '보통' },
  { id: 'hard', label: '어려움' },
];

// ── wide(데스크톱, D7.6 원본 값) ───────────────────────────────────
const W_BTN_W = 200;
const W_BTN_H = 46;
const W_DEFENSE_BTN_Y = 108;
const W_CONQUEST_BTN_Y = 402;
const W_DBTN_W = 74;
const W_DBTN_H = 34;
const W_DBTN_GAP = 6;
const W_PAIR_GAP = 20; // 정복 버튼 ↔ 난이도 묶음 간격.
const W_COL_GAP = 12;
const W_DEF_COLS = 4;
const W_LABEL_BAND = 20;
const W_ROW_PITCH = THUMB_H + W_LABEL_BAND + 2;
const W_GRID_GAP = 16; // 모드 버튼 ↔ 카드 그리드 세로 간격.

const W_BTN: BtnStyle = { labelFont: 22, labelDy: -7, subFont: 12, subDy: 14 };
const W_CARD: CardStyle = {
  thumbW: THUMB_W,
  thumbH: THUMB_H,
  labelBand: W_LABEL_BAND,
  labelFont: 13,
  labelDy: 4,
  badgeFont: 11,
  badgeBandH: 15,
  badgeBandDy: -16,
  badgeTextDy: -8,
  badgePadX: 5,
};

// ── compact(모바일) ───────────────────────────────────────────────
const C_MARGIN = 24;
const C_LOGO: TextSpec = { x: VIEW_W / 2, y: 26, font: 40 };
const C_TAB_Y = 52;
const C_TAB_H = 112; // 화면상 45.5px(≥44).
const C_TAB_GAP = 16;
const C_BTN: BtnStyle = { labelFont: 42, labelDy: 0, subFont: 0, subDy: 0 };
const C_GRID_TOP = 178;
const C_COL_GAP = 36;
const C_ROW_GAP = 8;
const C_THUMB_W = 180; // 썸네일 1.5배 — 세로 예산이 허용하는 최대치.
const C_THUMB_H = 126;
const C_LABEL_BAND = 48;
const C_CARD: CardStyle = {
  thumbW: C_THUMB_W,
  thumbH: C_THUMB_H,
  labelBand: C_LABEL_BAND,
  labelFont: 40,
  labelDy: 6,
  badgeFont: 38,
  badgeBandH: 42,
  badgeBandDy: -44,
  badgeTextDy: -23,
  badgePadX: 10,
};
const C_COLS = 2;
const C_ROWS = 2;
const C_PER_PAGE = C_COLS * C_ROWS;
const C_BOTTOM_Y = 544;
const C_BOTTOM_H = 110; // 화면상 44.7px(≥44).
const C_ROW_FONT = 40;
const C_GAP = 14;
const C_PAGE_BTN_W = 160;
const C_PAGE_LABEL_W = 170;
const C_DBTN_W = 150;
const C_DIFF_CAPTION_W = 124;
const C_BEST_FONT = 38;

function cardGrid<T>(
  maps: { id: T; name: string }[],
  cols: number,
  top: number,
  tw: number,
  th: number,
  colGap: number,
  pitch: number,
): CardSlot<T>[] {
  const gridW = cols * tw + (cols - 1) * colGap;
  const startX = VIEW_W / 2 - gridW / 2;
  return maps.map((m, i) => ({
    id: m.id,
    name: m.name,
    rect: { x: startX + (i % cols) * (tw + colGap), y: top + Math.floor(i / cols) * pitch, w: tw, h: th },
  }));
}

/** 현재 페이지에 해당하는 카드 4장만 남긴다(compact). */
function pageSlice<T>(all: { id: T; name: string }[], page: number): { id: T; name: string }[] {
  return all.slice(page * C_PER_PAGE, page * C_PER_PAGE + C_PER_PAGE);
}

/** 총 페이지 수(compact). wide는 항상 1(전부 표시). */
function titlePageCount(section: TitleMode): number {
  const n = section === 'defense' ? mapList().length : conquestMapList().length;
  return Math.max(1, Math.ceil(n / C_PER_PAGE));
}

/** 선택된 디펜스 맵이 들어 있는 페이지(compact 진입 시 초기 페이지). */
export function defenseCardPage(id: MapId): number {
  const i = mapList().findIndex((m) => m.id === id);
  return i < 0 ? 0 : Math.floor(i / C_PER_PAGE);
}

function wideLayout(): TitleLayout {
  const diffTotalW = W_DBTN_W * 3 + W_DBTN_GAP * 2;
  const pairW = W_BTN_W + W_PAIR_GAP + diffTotalW;
  const defenseBtn = { x: VIEW_W / 2 - W_BTN_W / 2, y: W_DEFENSE_BTN_Y, w: W_BTN_W, h: W_BTN_H };
  const conquestBtn = { x: VIEW_W / 2 - pairW / 2, y: W_CONQUEST_BTN_Y, w: W_BTN_W, h: W_BTN_H };
  const dStartX = conquestBtn.x + conquestBtn.w + W_PAIR_GAP;
  const dY = conquestBtn.y + (conquestBtn.h - W_DBTN_H) / 2;
  const diff = DIFF_ORDER.map((d, i) => ({
    id: d.id,
    label: d.label,
    rect: { x: dStartX + i * (W_DBTN_W + W_DBTN_GAP), y: dY, w: W_DBTN_W, h: W_DBTN_H },
  }));
  return {
    compact: false,
    section: 'defense',
    logo: { x: VIEW_W / 2, y: 50, font: 60 },
    subtitle: { x: VIEW_W / 2, y: 88, font: 18 },
    defenseBtn,
    conquestBtn,
    btn: W_BTN,
    difficulty: { list: diff, caption: { x: dStartX, y: dY - 12, font: 13 }, btnFont: 15 },
    defenseCards: cardGrid(mapList(), W_DEF_COLS, defenseBtn.y + defenseBtn.h + W_GRID_GAP, THUMB_W, THUMB_H, W_COL_GAP, W_ROW_PITCH),
    conquestCards: cardGrid(
      conquestMapList(),
      conquestMapList().length,
      conquestBtn.y + conquestBtn.h + W_GRID_GAP,
      THUMB_W,
      THUMB_H,
      W_COL_GAP,
      W_ROW_PITCH,
    ),
    card: W_CARD,
    pager: null,
    best: { x: VIEW_W / 2, y: 604, font: 18, align: 'center', short: false },
    endless: { x: VIEW_W / 2, y: 630, font: 15, align: 'center' },
  };
}

function compactLayout(section: TitleMode, page: number): TitleLayout {
  const tabW = (VIEW_W - C_MARGIN * 2 - C_TAB_GAP) / 2;
  const defenseBtn = { x: C_MARGIN, y: C_TAB_Y, w: tabW, h: C_TAB_H };
  const conquestBtn = { x: C_MARGIN + tabW + C_TAB_GAP, y: C_TAB_Y, w: tabW, h: C_TAB_H };
  const pitch = C_THUMB_H + C_LABEL_BAND + C_ROW_GAP;
  const grid = <T,>(maps: { id: T; name: string }[]): CardSlot<T>[] =>
    cardGrid(pageSlice(maps, page), C_COLS, C_GRID_TOP, C_THUMB_W, C_THUMB_H, C_COL_GAP, pitch);

  const total = titlePageCount(section);
  const rowY = C_BOTTOM_Y;
  const pager =
    total > 1
      ? {
          prev: { x: C_MARGIN, y: rowY, w: C_PAGE_BTN_W, h: C_BOTTOM_H },
          label: { x: C_MARGIN + C_PAGE_BTN_W + C_GAP, y: rowY, w: C_PAGE_LABEL_W, h: C_BOTTOM_H },
          next: { x: C_MARGIN + C_PAGE_BTN_W + C_GAP + C_PAGE_LABEL_W + C_GAP, y: rowY, w: C_PAGE_BTN_W, h: C_BOTTOM_H },
          font: C_ROW_FONT,
          index: page,
          total,
        }
      : null;
  // 난이도는 정복 전용 설정이라 정복 섹션에서만 노출한다(페이지 줄과 자리를 나눠 쓰지 않게 배타).
  const diffStartX = C_MARGIN + C_DIFF_CAPTION_W + C_GAP;
  const difficulty =
    section === 'conquest' && !pager
      ? {
          list: DIFF_ORDER.map((d, i) => ({
            id: d.id,
            label: d.label,
            rect: { x: diffStartX + i * (C_DBTN_W + C_GAP), y: rowY, w: C_DBTN_W, h: C_BOTTOM_H },
          })),
          caption: { x: C_MARGIN, y: rowY + C_BOTTOM_H / 2, font: C_ROW_FONT },
          btnFont: C_ROW_FONT,
        }
      : null;

  return {
    compact: true,
    section,
    logo: C_LOGO,
    subtitle: null,
    defenseBtn,
    conquestBtn,
    btn: C_BTN,
    difficulty,
    defenseCards: section === 'defense' ? grid(mapList()) : [],
    conquestCards: section === 'conquest' ? grid(conquestMapList()) : [],
    card: C_CARD,
    pager,
    // 정보 줄은 하단 줄의 오른쪽 여백에 우측 정렬로 넣는다(세로 예산상 별도 줄을 못 만든다).
    best: { x: VIEW_W - C_MARGIN, y: rowY + C_BOTTOM_H / 2 - 24, font: C_BEST_FONT, align: 'right', short: true },
    endless: { x: VIEW_W - C_MARGIN, y: rowY + C_BOTTOM_H / 2 + 24, font: C_BEST_FONT, align: 'right' },
  };
}

/** 타이틀 전 요소의 기하. 렌더와 히트 판정이 반드시 이 함수 하나에서 좌표를 받는다. */
export function titleLayout(ui: TitleUi): TitleLayout {
  if (!isCompactTitle(ui.scale)) return wideLayout();
  const total = titlePageCount(ui.section);
  return compactLayout(ui.section, Math.min(Math.max(0, ui.page), total - 1));
}

/** 카드 히트 영역 = 썸네일 + 이름 라벨 밴드(이름을 눌러도 선택된다). */
export function cardHitRect(rect: Rect, card: CardStyle): Rect {
  return { x: rect.x, y: rect.y, w: rect.w, h: rect.h + card.labelBand };
}

export function insideRect(r: Rect, px: number, py: number): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

// 세로 예산 확인 — compact 하단 줄이 캔버스를 넘으면 레이아웃 상수가 잘못된 것이다.
void (C_BOTTOM_Y + C_BOTTOM_H <= VIEW_H);

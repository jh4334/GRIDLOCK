// 타이틀 클릭/탭 판정(D9.3) — 좌표가 무엇을 눌렀는지만 답한다.
//
// 기하는 전부 titleLayout()에서 받는다. 렌더도 같은 함수에서 rect를 받으므로 "그린 자리 ≠ 누른 자리"
// 오탭이 구조적으로 생기지 않는다(모바일에서 캔버스가 0.4배로 축소되면 몇 px 어긋남도 오탭이 된다).
// 판정 결과는 App이 해석한다 — 여기서는 상태를 만지지 않는다.

import type { ConquestMapId, DifficultyId, MapId } from '../core/storage';
import { cardHitRect, insideRect, titleLayout, type TitleMode, type TitleUi } from './titleLayout';

export type TitleAction =
  | { kind: 'enter'; mode: TitleMode } // 모드 진입(게임 시작).
  | { kind: 'section'; mode: TitleMode } // compact 섹션 전환(진입 아님).
  | { kind: 'page'; page: number } // compact 카드 페이지 이동.
  | { kind: 'difficulty'; id: DifficultyId }
  | { kind: 'defenseMap'; id: MapId }
  | { kind: 'conquestMap'; id: ConquestMapId };

/**
 * 클릭/탭 좌표(논리 좌표)가 무엇을 눌렀는지. 아무것도 아니면 null.
 * 판정 순서는 D7.6 원본과 동일하다: 난이도 → 디펜스 카드 → 정복 카드 → 페이지 → 모드 버튼.
 */
export function hitTitle(ui: TitleUi, px: number, py: number): TitleAction | null {
  const L = titleLayout(ui);
  for (const d of L.difficulty?.list ?? []) if (insideRect(d.rect, px, py)) return { kind: 'difficulty', id: d.id };
  for (const c of L.defenseCards) if (insideRect(cardHitRect(c.rect, L.card), px, py)) return { kind: 'defenseMap', id: c.id };
  for (const c of L.conquestCards) if (insideRect(cardHitRect(c.rect, L.card), px, py)) return { kind: 'conquestMap', id: c.id };
  if (L.pager) {
    const { index, total } = L.pager;
    if (insideRect(L.pager.prev, px, py)) return { kind: 'page', page: (index + total - 1) % total };
    if (insideRect(L.pager.next, px, py)) return { kind: 'page', page: (index + 1) % total };
  }
  for (const mode of ['defense', 'conquest'] as const) {
    const rect = mode === 'defense' ? L.defenseBtn : L.conquestBtn;
    if (!insideRect(rect, px, py)) continue;
    // compact에서 비활성 탭은 섹션 전환만(오탭으로 게임에 들어가지 않게), 활성 탭은 진입.
    return L.compact && L.section !== mode ? { kind: 'section', mode } : { kind: 'enter', mode };
  }
  return null;
}

// 정복 공용 명령(키보드 · 컨트롤 바 버튼 공유) — 공격 이동 대기 진입/해제, 부대 저장·호출.
//
// D9.4: 터치에서 A키·Ctrl+숫자를 낼 수 없어 같은 동작을 버튼으로도 노출한다. 두 입구가
// 각자 로직을 복사하면 흐름이 갈라지므로(키만 고치고 버튼은 안 고치는 사고) 실제 동작은
// 전부 여기 모아 두고 conquestInput(키보드)과 conquestCommandBar(버튼)가 이 함수만 호출한다.
// 상태는 갖지 않는다 — 선택·부대·모드 플래그는 전부 deps 쪽(코디네이터) 소유.

import type { ConquestSelection } from './conquestSelection';
import type { ConquestControlGroups } from './controlGroups';

/** 공용 명령이 필요로 하는 최소 의존성. ConquestInputDeps가 이 인터페이스를 확장한다. */
export interface ConquestActionDeps {
  selection: ConquestSelection;
  groups: ConquestControlGroups;
  canInteract: () => boolean; // active + playing.
  cancelPlace: () => void; // 건설 모드 해제(placeKind + 메뉴 하이라이트).
  isAttackMove: () => boolean;
  setAttackMove: (v: boolean) => void;
}

/** 공격 이동 대기 진입(A키 · 버튼 공용). 유닛 선택이 없으면 무시하고 건설 모드는 해제한다. */
export function enterAttackMove(d: ConquestActionDeps): void {
  if (!d.canInteract() || !d.selection.hasUnits) return;
  d.cancelPlace();
  d.setAttackMove(true);
}

/** 버튼 전용 토글 — 대기 중이면 해제, 아니면 진입(A키는 진입만 하던 기존 동작 유지). */
export function toggleAttackMove(d: ConquestActionDeps): void {
  if (!d.canInteract()) return;
  if (d.isAttackMove()) d.setAttackMove(false);
  else enterAttackMove(d);
}

/** 현재 선택을 n번 부대로 저장(Ctrl+N · 버튼 공용). 빈 선택이면 그 부대가 해제된다. */
export function assignGroup(d: ConquestActionDeps, n: number): void {
  if (!d.canInteract()) return;
  d.groups.assign(n, d.selection.selectedUnits, d.selection.selectedWorkers);
}

/** n번 부대 호출(N키 · 버튼 공용). 빈 부대면 아무 것도 하지 않는다. */
export function recallGroup(d: ConquestActionDeps, n: number): void {
  if (!d.canInteract()) return;
  const g = d.groups.members(n);
  if (!g) return;
  d.cancelPlace();
  d.setAttackMove(false);
  d.selection.selectGroup(g.units, g.workers);
}

/**
 * 부대 버튼 탭(D9.4) — 선택 중이면 저장, 선택이 없으면 호출.
 * 터치엔 Ctrl 수정자가 없어 "선택 유무"로 저장/호출을 가른다(길게 누르기 불요).
 */
export function tapGroup(d: ConquestActionDeps, n: number): void {
  if (!d.canInteract()) return;
  if (d.selection.hasUnits || d.selection.hasWorkers) assignGroup(d, n);
  else recallGroup(d, n);
}

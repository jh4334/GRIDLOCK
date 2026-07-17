// 정복 입력 배선 — 마우스(클릭/드래그/우클릭)와 키보드 핸들러를 한곳에 등록한다.
// conquestGame이 300줄 제한에 걸려 입력 라우팅을 분리했다(gameInput 선례와 동일 패턴).
//
// 좌클릭 우선순위: 공격 이동 모드 > 건설 모드 > 선택. 우클릭: 모드 취소 또는 이동/공격/채집 명령.
// 키: A=공격 이동, Esc=취소, Ctrl+1~9=부대 지정, 1~9=부대 선택. active 가드로 디펜스와 격리한다.

import type { MouseInput, Keyboard } from '../core/input';
import type { ConquestWorld } from './conquestWorld';
import type { ConquestSelection } from './conquestSelection';
import type { ConquestControlGroups } from './controlGroups';
import type { BuildKind } from './building';

export interface ConquestInputDeps {
  input: MouseInput;
  keyboard: Keyboard;
  selection: ConquestSelection;
  groups: ConquestControlGroups;
  getWorld: () => ConquestWorld; // 재시작 시 월드가 교체되므로 getter로 최신 참조를 얻는다.
  isActive: () => boolean; // 정복 모드 활성 여부(디펜스·타이틀에서 정복 키 격리).
  canInteract: () => boolean; // active + playing.
  getPlaceKind: () => BuildKind | null;
  cancelPlace: () => void; // 건설 모드 해제(placeKind + 메뉴 하이라이트).
  tryPlace: (x: number, y: number) => void;
  isAttackMove: () => boolean;
  setAttackMove: (v: boolean) => void;
  toggleMute: () => void; // M키 음소거 토글(active 시에만).
}

/** ConquestGame 생성자에서 1회 호출 — 모든 마우스·키보드 핸들러를 등록한다. */
export function bindConquestInput(d: ConquestInputDeps): void {
  const { input, keyboard, selection, groups } = d;

  input.onClick((x, y) => {
    if (!d.canInteract()) return;
    if (d.isAttackMove()) {
      if (selection.hasUnits) d.getWorld().commandUnits(selection.selectedUnits, x, y, true);
      d.setAttackMove(false);
      return;
    }
    if (d.getPlaceKind()) d.tryPlace(x, y);
    else selection.clickSelect(x, y, d.getWorld().playerUnits, d.getWorld().workers, d.getWorld().playerHQ);
  });

  input.onRightClick((x, y) => {
    if (!d.canInteract()) return;
    if (d.isAttackMove()) {
      d.setAttackMove(false);
      return;
    }
    if (d.getPlaceKind()) {
      d.cancelPlace();
      return;
    }
    const w = d.getWorld();
    if (selection.hasUnits) w.commandUnits(selection.selectedUnits, x, y);
    if (selection.hasWorkers) w.commandWorkers(selection.selectedWorkers, x, y);
  });

  input.onDrag({
    onStart: (x, y) => {
      if (!d.canInteract()) return;
      d.setAttackMove(false); // 드래그 선택 시작 시 공격 이동 대기 해제.
      selection.beginDrag(x, y);
    },
    onMove: (box) => d.canInteract() && selection.updateDrag(box),
    onEnd: (box) => {
      if (!d.canInteract()) return selection.cancelDrag();
      selection.endDrag(box, d.getWorld().playerUnits, d.getWorld().workers);
    },
  });

  // A — 유닛 선택 상태에서 공격 이동 모드 진입(건설 모드는 해제).
  keyboard.on('a', () => {
    if (!d.canInteract() || !selection.hasUnits) return;
    d.cancelPlace();
    d.setAttackMove(true);
  });

  keyboard.on('escape', () => {
    if (!d.isActive()) return;
    if (d.isAttackMove()) d.setAttackMove(false);
    else if (d.getPlaceKind()) d.cancelPlace();
    else selection.clear();
  });

  // M — 음소거 토글(디펜스와 동기화, 공유 엔진).
  keyboard.on('m', () => {
    if (d.isActive()) d.toggleMute();
  });

  // 1~9 — Ctrl과 함께면 현재 선택을 부대로 지정, 아니면 해당 부대 선택.
  for (let n = 1; n <= 9; n++) {
    keyboard.on(String(n), (e) => {
      if (!d.canInteract()) return;
      if (e.ctrlKey || e.metaKey) {
        groups.assign(n, selection.selectedUnits, selection.selectedWorkers);
        return;
      }
      const g = groups.members(n);
      if (g) {
        d.cancelPlace();
        d.setAttackMove(false);
        selection.selectGroup(g.units, g.workers);
      }
    });
  }
}

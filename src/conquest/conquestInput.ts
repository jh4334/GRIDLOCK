// 정복 입력 배선 — 마우스(클릭/드래그/우클릭)와 키보드 핸들러를 한곳에 등록한다.
// conquestGame이 300줄 제한에 걸려 입력 라우팅을 분리했다(gameInput 선례와 동일 패턴).
//
// 좌클릭 우선순위: 공격 이동 모드 > 건설 모드 > 선택. 우클릭: 모드 취소 또는 이동/공격/채집 명령.
// 키: A=공격 이동, Esc=취소, Ctrl+1~9=부대 지정, 1~9=부대 선택. active 가드로 디펜스와 격리한다.
//
// D8.5 터치(pointerType==='touch') 분기 — 롱프레스 contextmenu가 막혀 있어 우클릭 명령을 낼 수
// 없으므로, 탭 하나가 선택과 명령을 겸한다: 탭 지점에 아군(유닛/일꾼/HQ)이 있으면 선택,
// 없고 선택 중인 아군이 있으면 그 지점으로 이동/공격/채집 명령(우클릭과 같은 경로),
// 둘 다 아니면 선택 해제. 마우스는 이 분기를 타지 않아 기존 UX가 그대로다.

import type { MouseInput, Keyboard } from '../core/input';
import type { ConquestWorld } from './conquestWorld';
import type { BuildKind } from './building';
import { enterAttackMove, assignGroup, recallGroup, type ConquestActionDeps } from './conquestActions';

// 공격 이동·부대 지정 동작은 D9.4 컨트롤 바 버튼과 공유한다(conquestActions).
export interface ConquestInputDeps extends ConquestActionDeps {
  input: MouseInput;
  keyboard: Keyboard;
  getWorld: () => ConquestWorld; // 재시작 시 월드가 교체되므로 getter로 최신 참조를 얻는다.
  isActive: () => boolean; // 정복 모드 활성 여부(디펜스·타이틀에서 정복 키 격리).
  getPlaceKind: () => BuildKind | null;
  tryPlace: (x: number, y: number, touch: boolean) => void; // touch=true면 2탭 확정(D8.5).
  toggleMute: () => void; // M키 음소거 토글(active 시에만).
}

/** ConquestGame 생성자에서 1회 호출 — 모든 마우스·키보드 핸들러를 등록한다. */
export function bindConquestInput(d: ConquestInputDeps): void {
  const { input, keyboard, selection } = d;

  // 선택 중인 아군에게 그 지점 명령(우클릭 = 터치 탭 공통 경로).
  const commandAt = (x: number, y: number): void => {
    const w = d.getWorld();
    if (selection.hasUnits) w.commandUnits(selection.selectedUnits, x, y);
    if (selection.hasWorkers) w.commandWorkers(selection.selectedWorkers, x, y);
  };

  input.onClick((x, y) => {
    if (!d.canInteract()) return;
    const touch = input.pointerType === 'touch';
    if (d.isAttackMove()) {
      if (selection.hasUnits) d.getWorld().commandUnits(selection.selectedUnits, x, y, true);
      d.setAttackMove(false);
      return;
    }
    if (d.getPlaceKind()) {
      d.tryPlace(x, y, touch);
      return;
    }
    const w = d.getWorld();
    // 터치 전용: 아군이 없는 지점 탭은 우클릭 대체(명령). 선택은 명령 후에도 유지된다.
    if (touch && (selection.hasUnits || selection.hasWorkers)) {
      if (selection.hitTest(x, y, w.playerUnits, w.workers, w.playerHQ) === 'none') {
        commandAt(x, y);
        return;
      }
    }
    selection.clickSelect(x, y, w.playerUnits, w.workers, w.playerHQ);
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
    commandAt(x, y);
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
    // 포인터 취소(D8.2) — 선택을 확정하지 않고 드래그 박스만 되돌린다.
    onCancel: () => selection.cancelDrag(),
  });

  // A — 유닛 선택 상태에서 공격 이동 모드 진입(건설 모드는 해제).
  keyboard.on('a', () => enterAttackMove(d));

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
      if (e.ctrlKey || e.metaKey) assignGroup(d, n);
      else recallGroup(d, n);
    });
  }
}

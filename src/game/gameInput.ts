// 입력 배선(M11) — 마우스(클릭/드래그/우클릭) + 키보드 핸들러를 한곳에서 등록한다.
// game.ts가 300줄을 넘어 입력 라우팅을 분리했다.
//
// M12: 타이틀·모드 선택은 App이 담당하므로, 여기서는 디펜스 모드가 활성(isActive)일 때만
// 입력을 처리한다(정복 모드·타이틀에서 디펜스 조작이 새지 않게).
// 좌클릭 우선순위: 설치 모드 > 병사 단일 선택 > 타워 선택/해제. 드래그=다중 선택,
// 우클릭=병사 이동 명령(없으면 배럭 집결지 지정).

import type { MouseInput, Keyboard } from '../core/input';
import type { GameFlow } from './flow';
import type { Interaction } from './interaction';
import type { UnitSelection } from './unitSelection';
import type { AudioEngine } from '../core/audio';

export interface GameInputDeps {
  input: MouseInput;
  keyboard: Keyboard;
  flow: GameFlow;
  interaction: Interaction;
  unitSelection: UnitSelection;
  audio: AudioEngine;
  toggleFlowDebug: () => void; // 'd' 키 — Game 소유의 플로우필드 디버그 토글.
  isActive: () => boolean; // 디펜스 모드 활성 여부(비활성 시 모든 입력 무시).
}

/** Game 생성자에서 1회 호출 — 모든 마우스·키보드 핸들러를 등록한다. */
export function bindGameInput(d: GameInputDeps): void {
  const { input, keyboard, flow, interaction, unitSelection, audio, isActive } = d;

  // 좌클릭 — 설치 모드면 설치, 아니면 병사 선택 시도 후 실패 시 타워 선택/해제.
  const handleLeftClick = (x: number, y: number): void => {
    if (interaction.isPlacing) {
      interaction.handleClick(x, y);
      return;
    }
    if (unitSelection.trySelectAt(x, y)) {
      interaction.clearTowerSelection(); // 병사 선택 → 타워 패널 닫기.
      return;
    }
    unitSelection.clear(); // 빈 곳/타워 클릭 → 병사 선택 해제.
    interaction.handleClick(x, y);
  };

  input.onClick((x, y) => {
    if (!isActive()) return;
    handleLeftClick(x, y);
  });

  // 드래그 박스 — 다중 병사 선택. 놓으면 박스 안 병사 선택 + 타워 선택 해제.
  input.onDrag({
    onStart: (x, y) => isActive() && unitSelection.beginDrag(x, y),
    onMove: (box) => isActive() && unitSelection.updateDrag(box),
    onEnd: (box) => {
      if (!isActive() || flow.state !== 'playing') {
        unitSelection.cancelDrag();
        return;
      }
      if (unitSelection.endDrag(box) > 0) interaction.clearTowerSelection();
    },
  });

  // 우클릭 — 설치 모드면 설치 취소(D2.1), 아니면 병사 이동 명령, 그도 없으면 배럭 집결지 지정(M10/M11).
  // 설치 모드 취소를 최우선으로 두어 기존 우클릭 동작(이동/집결지)은 설치 중이 아닐 때만 발동한다.
  input.onRightClick((x, y) => {
    if (!isActive() || flow.state !== 'playing') return;
    if (interaction.isPlacing) {
      interaction.handleEscape(); // 설치 모드일 때 handleEscape는 설치 모드만 해제(선택 유지).
      return;
    }
    if (unitSelection.hasSelection) unitSelection.commandMove(x, y);
    else interaction.handleRightClick(x, y);
  });

  const whenActive = (fn: () => void) => () => {
    if (isActive()) fn();
  };
  keyboard.on('d', whenActive(d.toggleFlowDebug));
  keyboard.on('escape', whenActive(() => interaction.handleEscape()));
  keyboard.on('u', whenActive(() => interaction.upgradeSelected())); // 선택 타워 업그레이드.
  keyboard.on('x', whenActive(() => interaction.sellSelected()));
  keyboard.on('m', whenActive(() => audio.toggleMute())); // 음소거 토글.
  keyboard.on('r', whenActive(() => flow.restart())); // 승리/패배 후 다시 시작.
}

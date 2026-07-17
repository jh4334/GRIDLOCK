// 입력 배선(M11) — 마우스(클릭/드래그/우클릭) + 키보드 핸들러를 한곳에서 등록한다.
// game.ts가 300줄을 넘어 입력 라우팅을 분리했다. 동작 변화 없음 — 배선 위치만 옮겼을 뿐이다.
//
// 좌클릭 라우팅 우선순위: 설치 모드 > 병사 단일 선택 > 타워 선택/해제(병사·타워 선택 상호 배타).
// 드래그는 다중 병사 선택, 우클릭은 병사 선택이 있으면 A* 이동 명령, 없으면 배럭 집결지 지정.

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
}

/** Game 생성자에서 1회 호출 — 모든 마우스·키보드 핸들러를 등록한다. */
export function bindGameInput(d: GameInputDeps): void {
  const { input, keyboard, flow, interaction, unitSelection, audio } = d;

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

  // 캔버스 클릭 — menu에선 게임 시작, 그 외엔 좌클릭 라우팅.
  input.onClick((x, y) => {
    if (flow.state === 'menu') flow.startGame();
    else handleLeftClick(x, y);
  });

  // 드래그 박스 — 다중 병사 선택. 놓으면 박스 안 병사 선택 + 타워 선택 해제.
  input.onDrag({
    onStart: (x, y) => unitSelection.beginDrag(x, y),
    onMove: (box) => unitSelection.updateDrag(box),
    onEnd: (box) => {
      if (flow.state !== 'playing') {
        unitSelection.cancelDrag();
        return;
      }
      if (unitSelection.endDrag(box) > 0) interaction.clearTowerSelection();
    },
  });

  // 우클릭 — 병사 선택이 있으면 A* 이동 명령, 없으면 배럭 집결지 지정(M10/M11).
  input.onRightClick((x, y) => {
    if (flow.state !== 'playing') return;
    if (unitSelection.hasSelection) unitSelection.commandMove(x, y);
    else interaction.handleRightClick(x, y);
  });

  keyboard.on('d', d.toggleFlowDebug);
  keyboard.on('escape', () => interaction.handleEscape());
  keyboard.on('u', () => interaction.upgradeSelected()); // 선택 타워 업그레이드.
  keyboard.on('x', () => interaction.sellSelected());
  keyboard.on('m', () => audio.toggleMute()); // 음소거 토글.
  keyboard.on('r', () => flow.restart()); // 승리/패배 후 다시 시작.
  keyboard.on(' ', () => flow.startGame()); // Space — 타이틀에서 시작.
}

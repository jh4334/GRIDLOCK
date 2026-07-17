// 게임 흐름 상태머신 — menu/playing/won/lost 전이, 월드 초기화 배선, 최고기록 갱신.
// (M9에서 game.ts가 300줄을 넘어 상태 전이 로직만 분리했다. 동작 변화 없음.)
//
// state와 best(최고기록)를 이 클래스가 소유하고, Game은 getter로 읽어 update/render를 조율한다.
// 월드 초기화(resetWorld)는 여러 서브시스템 리셋의 조합이라, 서브시스템 참조와 Game 소유
// 필드(enemies/speed/hitbox/lastGold)를 되돌리는 소형 콜백을 deps로 주입받는다.
// update(dt)/render(ctx) 분리 규칙 유지 — 여기엔 렌더 로직이 없고 상태 전이만 담당한다.

import type { GameState } from './state';
import { type BestRecord, loadBest, updateBest } from '../core/storage';
import type { Economy } from './economy';
import type { Grid } from './grid';
import type { Interaction } from './interaction';
import type { CombatSystem } from '../systems/combat';
import type { EffectsSystem } from '../systems/effects';
import type { WaveManager } from './waves';
import type { ScreenShake } from './screenShake';
import type { BuildMenu } from '../ui/buildMenu';
import type { Controls } from '../ui/controls';

export interface FlowDeps {
  economy: Economy;
  grid: Grid;
  interaction: Interaction;
  combat: CombatSystem;
  effects: EffectsSystem;
  waveManager: WaveManager;
  shake: ScreenShake;
  buildMenu: BuildMenu;
  controls: Controls;
  clearEnemies: () => void; // this.enemies = [] (recomputeField 전에 비워 재경로 낭비 방지).
  recomputeField: () => void; // flowField 재계산 + 살아있는 적 reroute.
  setSpeed: (s: number) => void; // 배속 = 1로 + 컨트롤 하이라이트.
  resetView: () => void; // 히트박스 오버레이 off + 골드 변동 감지값(lastGold) 재동기화.
}

export class GameFlow {
  private _state: GameState = 'menu'; // 부팅 즉시 타이틀 화면(M9).
  private _best: BestRecord | null = loadBest(); // localStorage 최고기록(타이틀·승패 화면 표시).

  constructor(private deps: FlowDeps) {
    this.setGameplayUiVisible(false); // menu 상태 — 게임 UI(빌드 메뉴·컨트롤 바)는 숨긴 채 시작.
  }

  get state(): GameState {
    return this._state;
  }
  get best(): BestRecord | null {
    return this._best;
  }

  // 타이틀 → 게임 시작(클릭/Space). 월드 초기화 + 게임 UI 노출.
  startGame(): void {
    if (this._state !== 'menu') return;
    this.resetWorld();
    this._state = 'playing';
    this.setGameplayUiVisible(true);
  }

  // 승/패 → 타이틀 복귀. 월드 초기화 + 게임 UI 숨김.
  toMenu(): void {
    if (this._state === 'menu') return;
    this.resetWorld();
    this._state = 'menu';
    this.deps.controls.showRestart(false);
    this.setGameplayUiVisible(false);
  }

  // 승/패 → 즉시 재플레이. 월드 초기화 후 playing으로.
  restart(): void {
    if (this._state !== 'won' && this._state !== 'lost') return;
    this.resetWorld();
    this._state = 'playing';
    this.deps.controls.showRestart(false);
  }

  // 승리 확정(20웨이브 클리어). 최고기록 갱신.
  win(): void {
    this._state = 'won';
    this.record(true);
  }

  // 패배 확정(라이프 0). 최고기록 갱신.
  lose(): void {
    this._state = 'lost';
    this.record(false);
  }

  // 승/패 확정 시 최고기록 갱신. 승리는 총 웨이브 클리어, 패배는 도달 웨이브 기준.
  private record(cleared: boolean): void {
    const wm = this.deps.waveManager;
    this._best = updateBest({
      wave: cleared ? wm.total : wm.current,
      lives: this.deps.economy.lives,
      cleared,
    });
  }

  // 게임 월드 초기화 — 페이지 리로드 없이 시작값으로 되돌린다(리스너·DOM 재생성 없음).
  private resetWorld(): void {
    const d = this.deps;
    d.economy.reset();
    d.clearEnemies();
    d.interaction.reset();
    d.grid.resetCells();
    d.combat.reset();
    d.effects.reset();
    d.waveManager.reset();
    d.recomputeField();
    d.setSpeed(1);
    d.resetView();
    d.shake.reset();
    d.buildMenu.updateAffordability(d.economy.gold);
  }

  // menu 상태에선 빌드 메뉴·컨트롤 바를 숨기고, 게임 중에는 노출한다.
  private setGameplayUiVisible(show: boolean): void {
    this.deps.controls.setBarVisible(show);
    this.deps.buildMenu.setVisible(show);
  }
}

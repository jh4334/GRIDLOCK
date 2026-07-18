// 게임 흐름 상태머신 — menu/playing/won/lost 전이, 월드 초기화 배선, 최고기록 갱신.
// (M9에서 game.ts가 300줄을 넘어 상태 전이 로직만 분리했다. 동작 변화 없음.)
//
// state와 best(최고기록)를 이 클래스가 소유하고, Game은 getter로 읽어 update/render를 조율한다.
// 월드 초기화(resetWorld)는 여러 서브시스템 리셋의 조합이라, 서브시스템 참조와 Game 소유
// 필드(enemies/speed/hitbox/lastGold)를 되돌리는 소형 콜백을 deps로 주입받는다.
// update(dt)/render(ctx) 분리 규칙 유지 — 여기엔 렌더 로직이 없고 상태 전이만 담당한다.

import type { GameState } from './state';
import { type BestRecord, loadBest, updateBest, loadEndlessBest, updateEndlessBest, updateDaily } from '../core/storage';
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
  private _endlessBest = loadEndlessBest(); // 엔드리스 최고 도달 웨이브(D4.3, 0 = 기록 없음).
  private _dailySeed: number | null = null; // 오늘의 맵 시드(D7.5). null이면 시드별 기록을 남기지 않음.

  constructor(private deps: FlowDeps) {
    this.setGameplayUiVisible(false); // menu 상태 — 게임 UI(빌드 메뉴·컨트롤 바)는 숨긴 채 시작.
  }

  get state(): GameState {
    return this._state;
  }
  get best(): BestRecord | null {
    return this._best;
  }
  /** 엔드리스 최고 도달 웨이브(타이틀 표시용). 0이면 기록 없음. */
  get endlessBest(): number {
    return this._endlessBest;
  }

  /** 오늘의 맵 시드 설정(D7.5) — Game.activate가 호출. daily면 시드, 그 외(고정·랜덤 맵)는 null. */
  setDailySeed(seed: number | null): void {
    this._dailySeed = seed;
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

  // 승리(20웨이브) 후 "엔드리스 계속" — 월드는 그대로 두고(타워·골드·라이프 유지) 21웨이브부터
  // 이어서 진행한다. WaveManager를 엔드리스로 전환하고 곧장 다음 웨이브를 시작한다(승리 재판정 없음).
  continueEndless(): void {
    if (this._state !== 'won') return;
    this._state = 'playing';
    this.deps.controls.showRestart(false); // 승리 오버레이 버튼(엔드리스/다시 시작/타이틀) 숨김.
    this.deps.waveManager.enterEndless();
    this.deps.waveManager.startNextWave(); // 21웨이브 시작(승리 직후라 필드 적 0 → 얼리콜 보너스 없음).
  }

  // 패배 확정(라이프 0). 최고기록 갱신 + 엔드리스면 도달 웨이브를 별도 기록.
  lose(): void {
    this._state = 'lost';
    this.record(false);
    if (this.deps.waveManager.isEndless) {
      this._endlessBest = updateEndlessBest(this.deps.waveManager.current);
    }
  }

  // 승/패 확정 시 최고기록 갱신. 승리는 총 웨이브 클리어, 패배는 도달 웨이브 기준.
  // 오늘의 맵(_dailySeed≠null)이면 같은 웨이브 값으로 시드별 최고기록도 갱신한다(D7.5).
  private record(cleared: boolean): void {
    const wm = this.deps.waveManager;
    const wave = cleared ? wm.total : wm.current;
    this._best = updateBest({ wave, lives: this.deps.economy.lives, cleared });
    if (this._dailySeed !== null) updateDaily(this._dailySeed, wave, cleared);
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

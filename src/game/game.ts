// 게임 조립·조율. main.ts는 부트스트랩만 하고, 상태 소유와 update/render 조율은 여기서 한다.
// 설치/판매/선택/호버/고스트/거부 플래시 상호작용은 game/interaction.ts로 분리했고(M5),
// Game이 소유·조율한다.

import { GameLoop } from '../core/loop';
import { MouseInput, Keyboard } from '../core/input';
import { FpsCounter } from '../debug/fps';
import { renderFlowField } from '../debug/flowField';
import { DebugSpawner } from '../debug/spawnKeys';
import { Grid } from './grid';
import { Economy } from './economy';
import { computeFlowField, FlowField } from '../systems/pathfinding';
import { CombatSystem } from '../systems/combat';
import { EffectsSystem } from '../systems/effects';
import { AudioEngine } from '../core/audio';
import { ScreenShake } from './screenShake';
import { Enemy, createEnemy } from '../entities/enemy';
import { towerSpec, TowerKind } from '../entities/tower';
import towersData from '../data/towers.json';
import { Hud } from '../ui/hud';
import { BuildMenu } from '../ui/buildMenu';
import { Controls } from '../ui/controls';
import { renderOverlay } from '../ui/overlay';
import { WaveManager } from './waves';
import type { GameState } from './state';
import { DebugCheats, renderHitboxes } from '../debug/cheats';
import { Interaction } from './interaction';

// 배속 옵션(구조 상수 — 서브스텝 반복 횟수). 밸런스 수치 아님.
const SPEEDS = [1, 2, 3];

export class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;

  private readonly fps = new FpsCounter();
  private readonly input: MouseInput;
  private readonly keyboard = new Keyboard();
  private readonly grid = new Grid();
  private readonly economy = new Economy();
  private readonly hud = new Hud();
  private readonly buildMenu: BuildMenu;
  private readonly spawner: DebugSpawner;
  private readonly combat: CombatSystem;
  private readonly effects = new EffectsSystem();
  private readonly audio = new AudioEngine();
  private readonly shake = new ScreenShake();
  private readonly controls: Controls;
  private readonly waveManager: WaveManager;
  private readonly interaction: Interaction;

  private flowField: FlowField;
  private enemies: Enemy[] = [];

  private state: GameState = 'playing';
  private speed = 1; // 배속(서브스텝 반복 횟수). update가 게임 월드를 이 횟수만큼 갱신.

  private showFlowDebug = false;
  private showHitbox = false; // H 치트로 토글하는 히트박스 오버레이.
  private lastGold: number; // 골드 변동 감지용(변할 때만 메뉴 갱신).

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.input = new MouseInput(canvas);
    this.flowField = computeFlowField(this.grid);
    this.lastGold = this.economy.gold;

    this.spawner = new DebugSpawner(this.keyboard, (kind) => {
      this.enemies.push(createEnemy(kind, this.flowField));
    });

    // 전투 이펙트/사운드/화면흔들림은 combat 훅으로 배선(combat은 좌표만 넘김).
    this.combat = new CombatSystem({
      onFire: (kind) => this.audio.fire(kind),
      onDamage: (x, y, amount) => {
        this.effects.spawnDamage(x, y, amount);
        this.audio.hit();
      },
      onKill: (x, y, color) => {
        this.effects.spawnKill(x, y, color);
        this.audio.kill();
      },
      onCannonHit: () => {
        this.shake.trigger();
        this.audio.boom();
      },
    });

    // 웨이브 스포너 — 스폰 시점의 flowField를 클로저로 주입(설치/판매로 바뀌어도 최신값 사용).
    this.waveManager = new WaveManager({
      spawn: (kind, hpMult) => this.enemies.push(createEnemy(kind, this.flowField, hpMult)),
      onWaveClear: (_wave, bonus) => {
        this.economy.addGold(bonus);
        this.audio.waveClear();
      },
      onVictory: () => {
        this.state = 'won';
        this.audio.win();
      },
    });

    this.controls = new Controls({
      speeds: SPEEDS,
      onNextWave: () => this.startNextWave(),
      onSetSpeed: (s) => this.setSpeed(s),
      onRestart: () => this.restart(),
    });
    this.controls.setActiveSpeed(this.speed);

    new DebugCheats(this.keyboard, {
      addGold: (n) => this.economy.addGold(n),
      skipWave: () => this.skipWave(),
      toggleHitboxes: () => {
        this.showHitbox = !this.showHitbox;
      },
    });

    this.buildMenu = new BuildMenu({
      towers: (Object.keys(towersData.towers) as TowerKind[]).map((kind) => ({
        kind,
        name: towerSpec(kind).name,
        cost: towerSpec(kind).cost,
      })),
      onSelectTower: (kind) => this.interaction.toggleTower(kind),
      onUpgrade: () => this.interaction.upgradeSelected(),
      onSell: () => this.interaction.sellSelected(),
    });
    this.buildMenu.updateAffordability(this.economy.gold);

    // 상호작용(설치/판매/선택/호버/고스트/플래시) — 타워 배열을 소유하고 Game이 조율.
    this.interaction = new Interaction({
      grid: this.grid,
      economy: this.economy,
      buildMenu: this.buildMenu,
      getEnemies: () => this.enemies,
      recomputeField: () => this.recomputeField(),
    });

    this.input.onClick((x, y) => this.interaction.handleClick(x, y));
    this.keyboard.on('d', () => {
      this.showFlowDebug = !this.showFlowDebug;
    });
    this.keyboard.on('escape', () => this.interaction.handleEscape());
    this.keyboard.on('u', () => this.interaction.upgradeSelected()); // 선택 타워 업그레이드.
    this.keyboard.on('x', () => this.interaction.sellSelected());
    this.keyboard.on('m', () => this.audio.toggleMute()); // 음소거 토글.
    this.keyboard.on('r', () => this.restart()); // 승리/패배 후 다시 시작.
  }

  start(): void {
    new GameLoop({ update: (dt) => this.update(dt), render: () => this.render() }).start();
  }

  // 필드 재계산 후 살아있는 적 전원 재경로(DESIGN.md 함정 리스트 5번).
  private recomputeField(): void {
    this.flowField = computeFlowField(this.grid);
    for (const e of this.enemies) e.reroute(this.flowField);
  }

  // ── 웨이브 / 배속 / 재시작 ──────────────────────────────────────
  private startNextWave(): void {
    if (this.state !== 'playing') return;
    this.waveManager.startNextWave();
  }

  // N 치트 — 필드의 적을 보상 없이 제거하고 현재 웨이브를 즉시 완료 처리.
  private skipWave(): void {
    if (this.state !== 'playing') return;
    this.enemies = [];
    this.waveManager.skip();
  }

  private setSpeed(s: number): void {
    this.speed = s;
    this.controls.setActiveSpeed(s);
  }

  // 재시작 — 페이지 리로드 없이 상태를 리셋(리스너·DOM은 재생성하지 않는다).
  private restart(): void {
    if (this.state === 'playing') return; // 승리/패배 상태에서만 재시작.
    this.economy.reset();
    this.enemies = [];
    this.interaction.reset();
    this.grid.resetCells();
    this.combat.reset();
    this.effects.reset();
    this.waveManager.reset();
    this.recomputeField();

    this.state = 'playing';
    this.setSpeed(1);
    this.showHitbox = false;
    this.shake.reset();

    this.lastGold = this.economy.gold;
    this.buildMenu.updateAffordability(this.economy.gold);
    this.controls.showRestart(false);
  }

  // ── update / render ─────────────────────────────────────────
  // FPS·입력(호버/고스트)·플래시는 프레임당 1회, 게임 월드 갱신은 배속만큼 반복한다.
  // (배속은 dt를 키우지 않고 update(dt)를 N회 호출 — 슬로우/쿨다운 타이머 정확도 유지.)
  private update(dt: number): void {
    this.audio.resetFrame(); // 프레임당 발사/명중음 스로틀 카운터 리셋.
    this.fps.update(dt);
    this.interaction.updateHover(this.input);
    this.interaction.updateFlash(dt);
    this.shake.update(dt); // 화면흔들림은 실시간 기준 1회/프레임.

    // 게임 월드는 playing 상태에서만, 배속 수만큼 서브스텝으로 갱신.
    if (this.state === 'playing') {
      for (let i = 0; i < this.speed; i++) this.updateWorld(dt);
    }

    this.syncUi();
  }

  // 게임 월드 1스텝(적·전투·라이프·필터·웨이브·승패). 배속 시 이 함수만 반복된다.
  private updateWorld(dt: number): void {
    if (this.state !== 'playing') return; // 서브스텝 중 승/패 전환 시 잔여 스텝 중단.
    this.spawner.update(dt);

    for (const e of this.enemies) e.update(dt, this.flowField);
    // 전투(타겟팅·발사·명중·데미지·처치 골드)는 combat 시스템이 담당.
    this.combat.update(dt, this.interaction.towers, this.enemies, this.economy, this.flowField);
    for (const e of this.enemies) if (e.reachedBase) this.economy.loseLife(1);
    this.enemies = this.enemies.filter((e) => !e.dead && !e.reachedBase);

    // 이펙트는 서브스텝 안에서 갱신 → 배속 시 이펙트도 같은 배율로 진행된다.
    this.effects.update(dt);

    // 웨이브 진행/완료 판정(스폰도 여기서 발생). 완료 판정은 스폰 이후의 실제 적 수로.
    this.waveManager.update(dt, () => this.enemies.length);

    if (this.economy.isDefeated) {
      this.state = 'lost';
      this.audio.lose();
    }
  }

  // 상태 변화에 따른 UI 동기화(프레임당 1회). 골드 변동 시에만 빌드 메뉴 갱신.
  private syncUi(): void {
    if (this.economy.gold !== this.lastGold) {
      this.lastGold = this.economy.gold;
      this.buildMenu.updateAffordability(this.economy.gold);
      this.interaction.refreshPanel(); // 골드 변동 → 업그레이드 버튼 활성 여부 갱신.
    }
    // 다음 웨이브 버튼은 진행 중 + 대기 상태 + 남은 웨이브가 있을 때만 활성.
    this.controls.setNextWaveEnabled(this.state === 'playing' && this.waveManager.canStart);
    this.controls.showRestart(this.state !== 'playing');
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 화면흔들림 — 캔버스 전체를 오프셋(계산은 update, 여기선 적용만). translate는 clear 이후.
    ctx.save();
    if (this.shake.active) ctx.translate(this.shake.x, this.shake.y);

    // 그리드(정적) → 플로우 디버그 → 호버/고스트 → 타워 → 거부 플래시 → 적 → 전투(투사체·폭발) → 이펙트 → HUD → FPS.
    this.grid.render(ctx);
    if (this.showFlowDebug) renderFlowField(ctx, this.flowField);

    this.interaction.renderHoverOrGhost(ctx);
    this.interaction.renderTowers(ctx);
    this.interaction.renderFlash(ctx);

    for (const e of this.enemies) e.render(ctx);
    this.combat.render(ctx); // 투사체·폭발은 적 위에 그린다.
    this.effects.render(ctx); // 데미지 숫자·처치 파티클은 최상단.

    if (this.showHitbox) renderHitboxes(ctx, this.enemies, this.interaction.towers); // H 치트.

    this.hud.render(ctx, this.economy, {
      current: this.waveManager.current,
      total: this.waveManager.total,
    });
    // 승리/패배 오버레이는 HUD 위, FPS 아래로 그린다.
    renderOverlay(ctx, this.state, this.waveManager.current, this.waveManager.total);
    this.fps.render(ctx);

    ctx.restore();
  }
}

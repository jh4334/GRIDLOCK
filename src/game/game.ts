// 게임 조립·조율. main.ts는 부트스트랩만 하고, 상태 소유와 update/render 조율은 여기서 한다.
// 설치/판매/선택/호버/고스트/거부 플래시 상호작용은 game/interaction.ts로 분리했다(M5).

import { MouseInput, Keyboard } from '../core/input';
import { FpsCounter } from '../debug/fps';
import { DebugSpawner } from '../debug/spawnKeys';
import { Grid } from './grid';
import { Economy } from './economy';
import { computeFlowField, FlowField } from '../systems/pathfinding';
import type { CombatSystem } from '../systems/combat';
import type { MeleeSystem } from '../systems/melee';
import { createBattleSystems } from './battleSystems';
import { EffectsSystem } from '../systems/effects';
import { AudioEngine } from '../core/audio';
import { ScreenShake } from './screenShake';
import { DecalField } from '../render/decals';
import { Vignette } from '../render/vignette';
import { Enemy, createEnemy, spawnSplits } from '../entities/enemy';
import { towerSpec, TowerKind } from '../entities/tower';
import towersData from '../data/towers.json';
import { Hud } from '../ui/hud';
import { BuildMenu } from '../ui/buildMenu';
import { Controls } from '../ui/controls';
import { WaveManager } from './waves';
import { DebugCheats } from '../debug/cheats';
import { publishStressTelemetry } from '../debug/stressTelemetry';
import { Interaction } from './interaction';
import { UnitSelection } from './unitSelection';
import { bindGameInput } from './gameInput';
import { GameFlow } from './flow';
import { renderDefense } from './gameRender';
import { computeRoadCells, type RoadPiece } from '../render/roadPath';
import type { BestRecord } from '../core/storage';

const SPEEDS = [1, 2, 3]; // 배속 옵션(구조 상수 — 서브스텝 반복 횟수). 밸런스 수치 아님.

// App(모드 조율자)이 주입하는 콜백 — 타이틀 복귀 시 App이 디펜스 모드를 정리한다.
export interface GameDeps {
  onExit: () => void; // '타이틀로' 클릭 시 App이 deactivate 후 타이틀을 그린다.
  audio: AudioEngine; // 두 모드가 공유하는 사운드 엔진(음량·음소거 단일 소스, D2.6).
}

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
  private readonly melee: MeleeSystem;
  private readonly effects = new EffectsSystem();
  private readonly audio: AudioEngine; // App이 주입(공유 엔진). 생성자에서 deps로부터 대입.
  private readonly shake = new ScreenShake();
  private readonly decals = new DecalField(); // 적 사망 잔해 데칼(D2.5) — 월드 시간 기반 페이드.
  private readonly vignette = new Vignette(); // 기지 피격 붉은 비네트(D2.5) — 실시간 페이드.
  private readonly controls: Controls;
  private readonly waveManager: WaveManager;
  private readonly interaction: Interaction;
  private readonly unitSelection: UnitSelection; // 병사 선택·이동 명령(M11).
  private readonly flow: GameFlow; // menu/playing/won/lost 상태머신 + 최고기록 소유.

  private flowField: FlowField;
  private roadCells: RoadPiece[] = []; // 적이 따르는 스폰→기지 최단 경로의 도로 조각(recomputeField에서 갱신).
  private enemies: Enemy[] = [];
  private speed = 1; // 배속(서브스텝 반복 횟수). update가 게임 월드를 이 횟수만큼 갱신.
  private showFlowDebug = false;
  private showHitbox = false; // H 치트로 토글하는 히트박스 오버레이.
  private lastGold: number; // 골드 변동 감지용(변할 때만 메뉴 갱신).
  private active = false; // App이 디펜스 모드를 활성화했을 때만 입력·update 처리.

  constructor(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    private deps: GameDeps,
  ) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.audio = deps.audio;
    this.input = new MouseInput(canvas);
    this.flowField = computeFlowField(this.grid);
    this.roadCells = computeRoadCells(this.flowField);
    this.lastGold = this.economy.gold;

    // isActive 가드: 정복 모드·타이틀에서 숫자키 스폰이 새지 않도록 격리.
    this.spawner = new DebugSpawner(this.keyboard, (kind) => this.enemies.push(createEnemy(kind, this.flowField)), () => this.active);

    // 전투(투사체)·근접(병사) 시스템 + 이펙트/사운드/화면흔들림 배선은 battleSystems로 분리.
    const battle = createBattleSystems({ effects: this.effects, audio: this.audio, shake: this.shake, decals: this.decals });
    this.combat = battle.combat;
    this.melee = battle.melee;

    // 웨이브 스포너 — 스폰 시점의 flowField를 클로저로 주입(설치/판매로 바뀌어도 최신값 사용).
    this.waveManager = new WaveManager({
      spawn: (kind, hpMult) => this.enemies.push(createEnemy(kind, this.flowField, hpMult)),
      onWaveClear: (_wave, bonus) => this.awardBonus(bonus), // 클리어·얼리콜은 동일 피드백(골드+사운드).
      onEarlyCall: (bonus) => this.awardBonus(bonus),
      onVictory: () => { this.flow.win(); this.audio.win(); },
      // 시작/완료/리셋 시점에만 다음 웨이브 구성을 프리뷰에 반영(매 프레임 아님).
      onWaveChange: () => this.controls.setWavePreview(this.waveManager.nextWaveComposition()),
    });

    this.controls = new Controls({
      speeds: SPEEDS,
      audio: this.audio, // 음량/음소거 위젯을 컨트롤 바에 부착(D2.6).
      onNextWave: () => this.startNextWave(),
      onSetSpeed: (s) => this.setSpeed(s),
      onRestart: () => this.flow.restart(),
      onEndless: () => this.flow.continueEndless(), // 20웨이브 승리 → 엔드리스 계속(D4.3).
      onToTitle: () => this.deps.onExit(), // 타이틀 복귀는 App이 정리(deactivate)한다.
    });
    this.controls.setActiveSpeed(this.speed);

    // isActive 가드: 정복 모드·타이틀에서 G/N/H 치트가 새지 않도록 격리.
    new DebugCheats(this.keyboard,
      { addGold: (n) => this.economy.addGold(n), skipWave: () => this.skipWave(), toggleHitboxes: () => (this.showHitbox = !this.showHitbox) },
      () => this.active,
    );

    this.buildMenu = new BuildMenu({
      towers: (Object.keys(towersData.towers) as TowerKind[]).map((kind) => ({
        kind,
        name: towerSpec(kind).name,
        cost: towerSpec(kind).cost,
      })),
      onSelectTower: (kind) => this.interaction.toggleTower(kind),
      onUpgrade: () => this.interaction.upgradeSelected(),
      onSell: () => this.interaction.sellSelected(),
      onSpecial: (id) => this.interaction.chooseSpecial(id), // 4레벨 스페셜 분기(D4.2).
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

    // 병사 선택·이동 명령(M11) — 병사 목록은 배럭 로스터에서 매 조회.
    this.unitSelection = new UnitSelection(this.grid, () => this.interaction.barracks);

    // 상태머신 — 서브시스템 참조 + Game 소유 필드(enemies/speed/hitbox/lastGold) 리셋 콜백 주입.
    this.flow = new GameFlow({
      economy: this.economy,
      grid: this.grid,
      interaction: this.interaction,
      combat: this.combat,
      effects: this.effects,
      waveManager: this.waveManager,
      shake: this.shake,
      buildMenu: this.buildMenu,
      controls: this.controls,
      clearEnemies: () => { this.enemies = []; },
      recomputeField: () => this.recomputeField(),
      setSpeed: (s) => this.setSpeed(s),
      resetView: () => {
        this.showHitbox = false;
        this.lastGold = this.economy.gold;
        this.unitSelection.reset(); // 재시작·타이틀 복귀 시 병사 선택·드래그 상태 초기화.
        this.decals.reset(); this.vignette.reset(); // 잔해 데칼·비네트 연출 잔여 제거.
      },
    });

    // 마우스·키보드 배선은 gameInput으로 분리(M11) — 좌클릭 라우팅·드래그·명령·단축키를 한곳에 등록.
    bindGameInput({
      input: this.input,
      keyboard: this.keyboard,
      flow: this.flow,
      interaction: this.interaction,
      unitSelection: this.unitSelection,
      audio: this.audio,
      toggleFlowDebug: () => (this.showFlowDebug = !this.showFlowDebug),
      isActive: () => this.active, // 비활성(타이틀·정복 모드) 시 디펜스 입력 무시.
    });
  }

  get best(): BestRecord | null { return this.flow.best; } // 최고기록(타이틀 표시) — App이 읽는다.
  get endlessBest(): number { return this.flow.endlessBest; } // 엔드리스 최고 웨이브(타이틀 표시, D4.3).

  /** 정복→디펜스 진입 — 선택 맵 바위 주입 + 월드 초기화 + 시작. 재시작은 resetWorld가 같은 맵 유지(D4.4). */
  activate(rocks: [number, number][]): void {
    this.grid.setMap(rocks);
    this.flow.startGame();
    this.active = true;
  }

  /** 타이틀 복귀 — 월드 초기화(flow.toMenu) + 게임 UI 숨김. App이 호출. */
  deactivate(): void {
    this.active = false;
    this.flow.toMenu();
  }

  // 필드 재계산 후 살아있는 적 전원 재경로(DESIGN.md 함정 리스트 5번).
  private recomputeField(): void {
    this.flowField = computeFlowField(this.grid);
    this.roadCells = computeRoadCells(this.flowField); // 도로 경로도 함께 재배치(순수 렌더).
    for (const e of this.enemies) e.reroute(this.flowField);
  }

  // ── 웨이브 / 배속 ── 클리어·얼리콜 공통 보너스 지급(골드 + 사운드).
  private awardBonus(bonus: number): void { this.economy.addGold(bonus); this.audio.waveClear(); }

  private startNextWave(): void {
    if (this.flow.state !== 'playing') return;
    this.waveManager.startNextWave(() => this.enemies.length); // 적 수 → 얼리콜 보너스 판단(D2.4).
  }

  // N 치트 — 필드의 적을 보상 없이 제거하고 현재 웨이브를 즉시 완료 처리.
  private skipWave(): void {
    if (this.flow.state !== 'playing') return;
    this.enemies = [];
    this.waveManager.skip();
  }

  private setSpeed(s: number): void { this.speed = s; this.controls.setActiveSpeed(s); }

  // ── update / render ─────────────────────────────────────────
  // FPS·입력·플래시는 프레임당 1회, 월드 갱신은 배속만큼 반복(App이 디펜스 활성 프레임에만 호출).
  update(dt: number): void {
    this.audio.resetFrame(); // 프레임당 발사/명중음 스로틀 카운터 리셋.
    this.fps.update(dt);
    this.interaction.updateHover(this.input);
    this.interaction.updateFlash(dt);
    this.interaction.updatePanel(); // 배럭 선택 시 병사 수/리스폰 실시간 반영(값 변할 때만).
    this.unitSelection.prune(); // 죽은 병사를 선택에서 정리(리스폰 교체분 자동 배제).
    this.shake.update(dt); // 화면흔들림은 실시간 기준 1회/프레임.
    this.vignette.update(dt); // 기지 피격 비네트도 실시간 페이드(연출 — 배속 무관).

    // 게임 월드는 playing 상태에서만, 배속 수만큼 서브스텝으로 갱신.
    if (this.flow.state === 'playing') {
      for (let i = 0; i < this.speed; i++) this.updateWorld(dt);
    }

    this.syncUi();
    publishStressTelemetry(this.enemies.length, this.flow.state === 'playing'); // D5.1 스트레스 하네스(읽기 전용).
  }

  // 게임 월드 1스텝(적·전투·라이프·필터·웨이브·승패). 배속 시 이 함수만 반복된다.
  private updateWorld(dt: number): void {
    if (this.flow.state !== 'playing') return; // 서브스텝 중 승/패 전환 시 잔여 스텝 중단.
    this.spawner.update(dt);

    // 근접 전투는 적 이동보다 먼저 — 블로킹(enemy.blocked)을 세운 뒤 적 update가 이동을 건너뛴다.
    this.melee.update(dt, this.interaction.barracks, this.enemies, this.economy);
    for (const e of this.enemies) e.update(dt, this.flowField);
    // 전투(타겟팅·발사·명중·데미지·처치 골드)는 combat 시스템이 담당.
    this.combat.update(dt, this.interaction.towers, this.enemies, this.economy, this.flowField);
    for (const e of this.enemies) if (e.reachedBase) { this.economy.loseLife(1); this.vignette.trigger(); }
    spawnSplits(this.enemies, this.flowField); // 분열(D4.1) — 죽은 분열체의 자식을 filter 전에 추가(웨이브 카운트 포함).
    this.enemies = this.enemies.filter((e) => !e.dead && !e.reachedBase);

    // 이펙트·잔해 데칼은 서브스텝 안에서 갱신 → 배속 시 페이드도 같은 배율로 진행된다.
    this.effects.update(dt);
    this.decals.update(dt);

    // 웨이브 진행/완료 판정(스폰도 여기서 발생). 완료 판정은 스폰 이후의 실제 적 수로.
    this.waveManager.update(dt, () => this.enemies.length);

    if (this.economy.isDefeated) {
      this.flow.lose();
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
    // 다음 웨이브 버튼은 진행 중이라도 남은 웨이브가 있으면 활성(중첩 웨이브, D2.4).
    const state = this.flow.state;
    this.controls.setNextWaveEnabled(state === 'playing' && this.waveManager.canStart);
    this.controls.setWaveInProgress(this.waveManager.inProgress); // 진행 상태를 DOM에 반영(E2E 관찰용).
    this.controls.showRestart(state === 'won' || state === 'lost'); // menu는 바 자체가 숨김.
    this.controls.setEndlessVisible(state === 'won'); // 엔드리스 계속 버튼은 승리 시에만(D4.3).
  }

  render(): void {
    renderDefense(this.ctx, {
      canvas: this.canvas, shake: this.shake,
      grid: this.grid, roadCells: this.roadCells,
      showFlowDebug: this.showFlowDebug, flowField: this.flowField,
      interaction: this.interaction, enemies: this.enemies,
      unitSelection: this.unitSelection, combat: this.combat,
      effects: this.effects, decals: this.decals, vignette: this.vignette,
      showHitbox: this.showHitbox, hud: this.hud,
      economy: this.economy, waveManager: this.waveManager,
      flow: this.flow, fps: this.fps,
    });
  }
}

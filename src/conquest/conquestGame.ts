// 정복 모드 조율자 — 월드(모델)와 입력·UI를 잇는다. 공용 모듈(core/input, ui/controls,
// grid 좌표 유틸)을 재사용하고 디펜스 모드와 상태를 공유하지 않는다.
//
// App이 소유하는 루프가 update/render를 호출한다(App은 conquest 활성 시에만 호출). 입력은
// 자체 MouseInput/Keyboard로 받되 active 플래그로 비활성 시 무시한다(모드 전환 시 상대 모드 정리).
// update(dt)/render(ctx) 엄격 분리: 상태 변경은 update·명령 핸들러에서만, render는 읽기 전용.

import conquestData from '../data/conquest.json';
import { MouseInput, Keyboard } from '../core/input';
import { AudioEngine } from '../core/audio';
import { loadDifficulty, loadConquestMap, type DifficultyId, type ConquestMapId } from '../core/storage';
import { Controls } from '../ui/controls';
import { ConquestWorld } from './conquestWorld';
import { ConquestSelection } from './conquestSelection';
import { ConquestControlGroups } from './controlGroups';
import { ConquestMenu } from './conquestMenu';
import { ConquestPlacement } from './conquestPlace';
import { renderConquestHud, renderConquestOverlay, renderAttackMoveCursor } from './conquestHud';
import { renderMinimap, type MinimapData } from './minimap';
import { bindConquestInput, type ConquestInputDeps } from './conquestInput';
import { ConquestCommandBar } from './conquestCommandBar';
import { publishConquestTelemetry } from '../debug/conquestTelemetry';
import { VIEW_W, VIEW_H } from '../render/viewport';
import type { BuildKind } from './building';
import type { ConquestPhase } from './conquestWorld';

const SPEEDS = [1, 2, 3];
const BUILD_LABELS: Record<BuildKind, string> = { barracks: '배럭', turret: '포탑', depot: '보급고', factory: '공장' };

export interface ConquestDeps {
  onExit: () => void; // 타이틀 복귀(App이 정복 모드를 정리하고 타이틀을 그린다).
  audio: AudioEngine; // 두 모드가 공유하는 사운드 엔진(음량·음소거 단일 소스, D2.6).
}

export class ConquestGame {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly input: MouseInput;
  private readonly keyboard = new Keyboard();
  private readonly audio: AudioEngine; // App이 주입(공유 엔진). 생성자에서 deps로부터 대입.
  private readonly controls: Controls;
  private readonly menu: ConquestMenu;
  private readonly commandBar: ConquestCommandBar; // D9.4 공격이동·부대 버튼(키보드와 동작 공유).
  private readonly selection = new ConquestSelection();
  private readonly groups = new ConquestControlGroups();
  private readonly placement = new ConquestPlacement(); // D8.5 배치 고스트 + 터치 2탭 대기 칸.

  private world = new ConquestWorld();
  private difficulty: DifficultyId = 'normal'; // 진입 시 저장값을 읽어 고정(재시작은 동일 유지).
  private conquestMap: ConquestMapId = 'standard'; // 진입 시 저장값을 읽어 고정(재시작은 동일 맵, D7.4).
  private placeKind: BuildKind | null = null;
  private attackMove = false; // A키 공격 이동 대기(좌클릭 지점으로 공격 이동).
  private speed = 1;
  private active = false;

  // UI 갱신 캐시(값이 바뀔 때만 DOM 재구성 → 깜빡임 방지).
  private lastCrystal = -1;
  private lastHqSig = '';
  private lastPhase: ConquestPhase = 'playing';

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, deps: ConquestDeps) {
    this.ctx = ctx;
    this.audio = deps.audio;
    this.input = new MouseInput(canvas);

    this.controls = new Controls({
      speeds: SPEEDS,
      rootId: 'conquest-controls',
      showNextWave: false,
      audio: this.audio, // 음량/음소거 위젯을 정복 컨트롤 바에 부착(D2.6).
      onSetSpeed: (s) => this.setSpeed(s),
      onRestart: () => this.restart(),
      onToTitle: () => deps.onExit(),
    });

    this.menu = new ConquestMenu({
      buildings: (Object.keys(conquestData.buildings) as BuildKind[]).map((kind) => ({
        kind,
        name: BUILD_LABELS[kind],
        cost: conquestData.buildings[kind].cost,
      })),
      onSelectBuilding: (kind) => this.toggleBuild(kind),
      onProduceWorker: () => this.world.produceWorker(),
    });

    // 입력(키·마우스)과 D9.4 명령 버튼이 같은 의존성 묶음을 공유한다 — 두 입구의 동작이 갈라지지 않게.
    const inputDeps: ConquestInputDeps = {
      input: this.input,
      keyboard: this.keyboard,
      selection: this.selection,
      groups: this.groups,
      getWorld: () => this.world,
      isActive: () => this.active,
      canInteract: () => this.canInteract(),
      getPlaceKind: () => this.placeKind,
      cancelPlace: () => this.cancelPlace(),
      tryPlace: (x, y, touch) => this.tryPlace(x, y, touch),
      isAttackMove: () => this.attackMove,
      setAttackMove: (v) => (this.attackMove = v),
      toggleMute: () => this.audio.toggleMute(), // M키 음소거(디펜스와 동일, 공유 엔진).
    };
    bindConquestInput(inputDeps);
    this.commandBar = new ConquestCommandBar(inputDeps);
    this.setUiVisible(false);
  }

  // ── 모드 진입/정리 ───────────────────────────────────────────
  activate(): void {
    // 진입 시점에 타이틀에서 고른 난이도를 확정한다. 이후 재시작(startWorld)은 이 값을 유지하고,
    // 타이틀로 나갔다 다시 들어오면 새 선택을 반영한다.
    this.difficulty = loadDifficulty();
    this.conquestMap = loadConquestMap();
    this.startWorld();
    this.setUiVisible(true);
    this.active = true;
  }

  deactivate(): void {
    this.active = false;
    this.setUiVisible(false);
  }

  // 새 판 시작(진입·다시 시작 공통) — 월드·선택·UI 상태를 초기화한다.
  private startWorld(): void {
    this.world = new ConquestWorld(this.audio, this.difficulty, this.conquestMap);
    this.selection.reset();
    this.groups.reset();
    this.placeKind = null;
    this.attackMove = false;
    this.placement.clear();
    this.menu.setActiveBuilding(null);
    this.menu.showHqPanel(null);
    this.setSpeed(1);
    this.lastCrystal = -1;
    this.lastHqSig = '';
    this.lastPhase = 'playing';
    this.controls.showRestart(false);
    this.controls.setToTitleVisible(true); // '타이틀로'는 항상 노출.
  }

  private restart(): void {
    this.startWorld();
  }

  private setUiVisible(show: boolean): void {
    this.controls.setBarVisible(show);
    this.menu.setVisible(show);
  }

  private setSpeed(s: number): void {
    this.speed = s;
    this.controls.setActiveSpeed(s);
  }

  private toggleBuild(kind: BuildKind): void {
    this.placeKind = this.placeKind === kind ? null : kind;
    this.placement.clear(); // 모드 전환(해제/건물 변경) — 이전 터치 대기 칸은 무효.
    this.menu.setActiveBuilding(this.placeKind);
    if (this.placeKind) {
      this.selection.clear();
      this.attackMove = false;
    }
  }

  // 건설 모드 해제(입력 모듈이 취소 시 호출).
  private cancelPlace(): void {
    this.placeKind = null;
    this.placement.clear();
    this.menu.setActiveBuilding(null);
  }

  private canInteract(): boolean {
    return this.active && this.world.phase === 'playing';
  }

  // touch=true면 첫 탭은 대기 칸(미리보기)만 잡고, 같은 칸 재탭에서 착공한다(D8.5).
  private tryPlace(x: number, y: number, touch: boolean): void {
    if (!this.placeKind) return;
    const cell = this.placement.tap(x, y, touch);
    if (!cell) return;
    const { cx, cy } = cell;
    const kind = this.placeKind;
    if (this.world.startBuild(kind, cx, cy)) {
      if (this.world.crystal < this.world.buildSpec(kind).cost) this.toggleBuild(kind);
    }
  }

  // ── update ───────────────────────────────────────────────────
  update(dt: number): void {
    if (!this.active) return;
    this.audio.resetFrame();
    this.placement.updateHover(this.input, this.world, this.placeKind !== null);
    this.selection.prune(this.world.playerUnits, this.world.workers);
    this.groups.prune();
    if (this.attackMove && !this.selection.hasUnits) this.attackMove = false; // 대상 소멸 시 모드 해제.
    for (let i = 0; i < this.speed; i++) this.world.update(dt);
    this.syncPhase();
    this.syncUi();
    // D8.5 터치 검증 하네스(읽기 전용) — 선택 수·아군 좌표만 노출한다.
    publishConquestTelemetry({
      crystal: this.world.crystal,
      selectedUnits: this.selection.selectedUnits.length,
      selectedWorkers: this.selection.selectedWorkers.length,
      units: this.world.playerUnits.map((u) => ({ x: u.x, y: u.y })),
      workers: this.world.workers.map((w) => ({ x: w.x, y: w.y })),
      enemyUnits: this.world.units.reduce((n, u) => n + (u.side === 'enemy' && !u.dead ? 1 : 0), 0),
    });
  }

  // 승패 전환 시(1회) 결과음 재생 + '다시 시작' 노출.
  private syncPhase(): void {
    if (this.world.phase === this.lastPhase) return;
    this.lastPhase = this.world.phase;
    const over = this.world.phase !== 'playing';
    this.controls.showRestart(over);
    if (!over) this.controls.setToTitleVisible(true);
    if (this.world.phase === 'won') this.audio.win();
    else if (this.world.phase === 'lost') this.audio.lose();
  }

  private syncUi(): void {
    this.commandBar.update(); // 공격이동 활성 표시 + 부대 인원 배지(D9.4). 내부에서 서명 캐시.
    if (this.world.crystal !== this.lastCrystal) {
      this.lastCrystal = this.world.crystal;
      this.menu.updateAffordability(this.world.crystal);
    }
    const hq = this.selection.selectedHQ;
    const sig = hq ? `${hq.queueCount}|${this.world.canProduceWorker}` : '';
    if (sig !== this.lastHqSig) {
      this.lastHqSig = sig;
      this.menu.showHqPanel(
        hq
          ? {
              workerCost: conquestData.hq.workerCost,
              queue: hq.queueCount,
              queueMax: conquestData.hq.queueMax,
              canProduce: this.world.canProduceWorker,
            }
          : null,
      );
    }
  }

  // ── render(읽기 전용) ────────────────────────────────────────
  render(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H); // 논리 좌표로 지운다(백스토어는 DPR 배, D9.2).
    const w = this.world;

    w.grid.render(ctx);
    if (this.placeKind) this.placement.render(ctx, w, this.placeKind);
    for (const c of w.crystals) c.render(ctx);
    w.enemyHQ.render(ctx);
    w.playerHQ.render(ctx);
    if (this.selection.selectedHQ) this.selection.selectedHQ.renderSelected(ctx);
    for (const b of w.buildings) b.render(ctx, false);

    this.selection.renderRings(ctx); // 선택 링은 유닛 아래.
    for (const wk of w.allWorkers) wk.render(ctx);
    for (const u of w.units) u.render(ctx);
    this.groups.renderBadges(ctx); // 부대 번호 뱃지는 유닛 위.
    w.combat.render(ctx); // 포탑 투사체.
    w.effects.render(ctx); // 처치 파티클.
    this.selection.renderDragBox(ctx);
    if (this.attackMove && this.input.isInside) renderAttackMoveCursor(ctx, this.input.x, this.input.y);

    renderConquestHud(ctx, {
      crystal: w.crystal,
      popUsed: w.popUsed,
      popMax: w.popMax,
      secondsToAttack: w.secondsToAttack,
      unitCount: w.playerUnits.length,
      difficulty: this.difficulty,
    });
    renderMinimap(ctx, this.minimapData());
    renderConquestOverlay(ctx, w.phase);
  }

  // 미니맵에 넘길 좌표 묶음(양 진영 구조물·유닛). render에서만 조립하는 읽기 전용 스냅샷.
  private minimapData(): MinimapData {
    const w = this.world;
    const playerStructures = [{ cx: w.playerHQ.cx, cy: w.playerHQ.cy }];
    const enemyStructures = [{ cx: w.enemyHQ.cx, cy: w.enemyHQ.cy }];
    for (const b of w.buildings) {
      if (b.destroyed) continue;
      (b.side === 'player' ? playerStructures : enemyStructures).push({ cx: b.cx, cy: b.cy });
    }
    const enemyUnits = w.units.filter((u) => u.side === 'enemy' && !u.dead);
    return {
      rocks: w.grid.rocks, // 맵 지형 바위(D7.4) — 미니맵에 회색 점으로 표시.
      crystals: w.crystals,
      playerStructures,
      enemyStructures,
      playerMobs: [...w.playerUnits, ...w.workers],
      enemyMobs: [...enemyUnits, ...w.enemyAI.workers],
    };
  }
}

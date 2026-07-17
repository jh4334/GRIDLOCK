// 정복 모드 조율자 — 월드(모델)와 입력·UI를 잇는다. 공용 모듈(core/input, ui/controls,
// grid 좌표 유틸)을 재사용하고 디펜스 모드와 상태를 공유하지 않는다.
//
// App이 소유하는 루프가 update/render를 호출한다(App은 conquest 활성 시에만 호출). 입력은
// 자체 MouseInput/Keyboard로 받되 active 플래그로 비활성 시 무시한다(모드 전환 시 상대 모드 정리).
// update(dt)/render(ctx) 엄격 분리: 상태 변경은 update·명령 핸들러에서만, render는 읽기 전용.

import conquestData from '../data/conquest.json';
import { MouseInput, Keyboard } from '../core/input';
import { AudioEngine } from '../core/audio';
import { TILE, pixelToCell, cellToPixel } from '../game/grid';
import { Controls } from '../ui/controls';
import { ConquestWorld } from './conquestWorld';
import { ConquestSelection } from './conquestSelection';
import { ConquestMenu } from './conquestMenu';
import { renderConquestHud, renderConquestOverlay } from './conquestHud';
import type { BuildKind } from './building';
import type { ConquestPhase } from './conquestWorld';

const SPEEDS = [1, 2, 3];
const BUILD_LABELS: Record<BuildKind, string> = { barracks: '배럭', turret: '포탑', depot: '보급고' };
const GHOST_OK = 'rgba(90, 220, 120, 0.35)';
const GHOST_BAD = 'rgba(230, 70, 70, 0.35)';

export interface ConquestDeps {
  onExit: () => void; // 타이틀 복귀(App이 정복 모드를 정리하고 타이틀을 그린다).
}

export class ConquestGame {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private readonly input: MouseInput;
  private readonly keyboard = new Keyboard();
  private readonly audio = new AudioEngine();
  private readonly controls: Controls;
  private readonly menu: ConquestMenu;
  private readonly selection = new ConquestSelection();

  private world = new ConquestWorld();
  private placeKind: BuildKind | null = null;
  private hoverCell: { cx: number; cy: number } | null = null;
  private speed = 1;
  private active = false;

  // UI 갱신 캐시(값이 바뀔 때만 DOM 재구성 → 깜빡임 방지).
  private lastCrystal = -1;
  private lastHqSig = '';
  private lastPhase: ConquestPhase = 'playing';

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, deps: ConquestDeps) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.input = new MouseInput(canvas);

    this.controls = new Controls({
      speeds: SPEEDS,
      rootId: 'conquest-controls',
      showNextWave: false,
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

    this.bindInput();
    this.setUiVisible(false);
  }

  // ── 모드 진입/정리 ───────────────────────────────────────────
  activate(): void {
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
    this.world = new ConquestWorld(this.audio);
    this.selection.reset();
    this.placeKind = null;
    this.hoverCell = null;
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
    this.menu.setActiveBuilding(this.placeKind);
    if (this.placeKind) this.selection.clear();
  }

  // ── 입력 배선(active + playing일 때만 처리) ──────────────────
  private bindInput(): void {
    this.input.onClick((x, y) => {
      if (!this.canInteract()) return;
      if (this.placeKind) this.tryPlace(x, y);
      else this.doSelect(x, y);
    });
    this.input.onRightClick((x, y) => {
      if (!this.canInteract()) return;
      if (this.placeKind) {
        this.placeKind = null;
        this.menu.setActiveBuilding(null);
        return;
      }
      if (this.selection.hasUnits) this.world.commandUnits(this.selection.selectedUnits, x, y);
      else if (this.selection.hasWorkers) this.commandWorkers(x, y);
    });
    this.input.onDrag({
      onStart: (x, y) => this.canInteract() && this.selection.beginDrag(x, y),
      onMove: (box) => this.canInteract() && this.selection.updateDrag(box),
      onEnd: (box) => {
        if (!this.canInteract()) return this.selection.cancelDrag();
        this.selection.endDrag(box, this.world.playerUnits, this.world.workers);
      },
    });
    this.keyboard.on('escape', () => {
      if (!this.active) return;
      if (this.placeKind) {
        this.placeKind = null;
        this.menu.setActiveBuilding(null);
      } else {
        this.selection.clear();
      }
    });
  }

  private canInteract(): boolean {
    return this.active && this.world.phase === 'playing';
  }

  private doSelect(x: number, y: number): void {
    this.selection.clickSelect(x, y, this.world.playerUnits, this.world.workers, this.world.playerHQ);
  }

  private commandWorkers(x: number, y: number): void {
    const { cx, cy } = pixelToCell(x, y);
    const crystal = this.world.crystals.find((c) => c.cx === cx && c.cy === cy && !c.depleted);
    for (const w of this.selection.selectedWorkers) {
      if (crystal) w.commandHarvest(crystal, this.world.grid);
      else if (this.world.grid.isWalkable(cx, cy)) w.commandMove(cx, cy, this.world.grid);
    }
  }

  private tryPlace(x: number, y: number): void {
    if (!this.placeKind) return;
    const { cx, cy } = pixelToCell(x, y);
    const kind = this.placeKind;
    if (this.world.startBuild(kind, cx, cy)) {
      if (this.world.crystal < this.world.buildSpec(kind).cost) this.toggleBuild(kind);
    }
  }

  // ── update ───────────────────────────────────────────────────
  update(dt: number): void {
    if (!this.active) return;
    this.audio.resetFrame();
    this.updateHover();
    this.selection.prune(this.world.playerUnits, this.world.workers);
    for (let i = 0; i < this.speed; i++) this.world.update(dt);
    this.syncPhase();
    this.syncUi();
  }

  private updateHover(): void {
    if (this.placeKind && this.input.isInside && this.world.phase === 'playing') {
      const { cx, cy } = pixelToCell(this.input.x, this.input.y);
      this.hoverCell = this.world.grid.inBounds(cx, cy) ? { cx, cy } : null;
    } else {
      this.hoverCell = null;
    }
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
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const w = this.world;

    w.grid.render(ctx);
    this.renderGhost(ctx);
    for (const c of w.crystals) c.render(ctx);
    w.enemyHQ.render(ctx);
    w.playerHQ.render(ctx);
    if (this.selection.selectedHQ) this.selection.selectedHQ.renderSelected(ctx);
    for (const b of w.buildings) b.render(ctx, false);

    this.selection.renderRings(ctx); // 선택 링은 유닛 아래.
    for (const wk of w.allWorkers) wk.render(ctx);
    for (const u of w.units) u.render(ctx);
    w.combat.render(ctx); // 포탑 투사체.
    w.effects.render(ctx); // 처치 파티클.
    this.selection.renderDragBox(ctx);

    renderConquestHud(ctx, {
      crystal: w.crystal,
      popUsed: w.popUsed,
      popMax: w.popMax,
      secondsToAttack: w.secondsToAttack,
    });
    renderConquestOverlay(ctx, w.phase);
  }

  private renderGhost(ctx: CanvasRenderingContext2D): void {
    if (!this.placeKind || !this.hoverCell) return;
    const { cx, cy } = this.hoverCell;
    const spec = this.world.buildSpec(this.placeKind);
    const ok = this.world.canBuildAt(cx, cy) && this.world.crystal >= spec.cost && this.world.workers.length > 0;
    const { x, y } = cellToPixel(cx, cy);
    ctx.fillStyle = ok ? GHOST_OK : GHOST_BAD;
    ctx.fillRect(x, y, TILE, TILE);
  }
}

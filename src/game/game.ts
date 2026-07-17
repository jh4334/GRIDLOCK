// 게임 조립·조율. main.ts는 부트스트랩만 하고, 상태 소유와 update/render 조율은 여기서 한다.
// (M3에서 설치/판매/선택 로직이 커져 main.ts 한 파일에 두면 관심사가 뒤섞이므로 조율 클래스로 분리.)

import { GameLoop } from '../core/loop';
import { MouseInput, Keyboard } from '../core/input';
import { FpsCounter } from '../debug/fps';
import { renderFlowField } from '../debug/flowField';
import { DebugSpawner } from '../debug/spawnKeys';
import { Grid, TILE, cellToPixel, pixelToCell } from './grid';
import { Economy } from './economy';
import { computeFlowField, FlowField } from '../systems/pathfinding';
import { isCellPlaceable, isPathClear } from '../systems/placement';
import { CombatSystem } from '../systems/combat';
import { Enemy, createEnemy } from '../entities/enemy';
import { Tower, towerSpec, TowerKind, TOWER_INSET } from '../entities/tower';
import towersData from '../data/towers.json';
import economyData from '../data/economy.json';
import { Hud } from '../ui/hud';
import { BuildMenu } from '../ui/buildMenu';
import { Controls } from '../ui/controls';
import { renderOverlay } from '../ui/overlay';
import { WaveManager } from './waves';
import type { GameState } from './state';
import { DebugCheats, renderHitboxes } from '../debug/cheats';

// 시각 상수(밸런스 아님).
const COLOR_HOVER = 'rgba(255, 255, 255, 0.18)';
const COLOR_GHOST_OK = 'rgba(90, 220, 120, 0.35)'; // 설치 가능 칸
const COLOR_GHOST_BAD = 'rgba(230, 70, 70, 0.35)'; // 설치 불가 칸
const COLOR_REJECT = '#ff4040'; // 봉쇄 거부 플래시
const GHOST_ALPHA = 0.5; // 고스트 타워 반투명도
const REJECT_FLASH_TIME = 0.3; // 거부 플래시 지속(초)

// 배속 옵션(구조 상수 — 서브스텝 반복 횟수). 밸런스 수치 아님.
const SPEEDS = [1, 2, 3];

interface Flash {
  cx: number;
  cy: number;
  timer: number;
}
interface Ghost {
  cx: number;
  cy: number;
  valid: boolean;
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
  private readonly combat = new CombatSystem();
  private readonly controls: Controls;
  private readonly waveManager: WaveManager;

  private flowField: FlowField;
  private enemies: Enemy[] = [];
  private towers: Tower[] = [];

  private state: GameState = 'playing';
  private speed = 1; // 배속(서브스텝 반복 횟수). update가 게임 월드를 이 횟수만큼 갱신.

  private hoverCell: { cx: number; cy: number } | null = null;
  private showFlowDebug = false;
  private showHitbox = false; // H 치트로 토글하는 히트박스 오버레이.

  private placeKind: TowerKind | null = null; // 설치 모드 대상(없으면 비설치 모드).
  private selectedTower: Tower | null = null; // 선택된 타워(판매 대상).
  private ghost: Ghost | null = null; // update가 계산, render가 읽기만.
  private flash: Flash | null = null; // 봉쇄 거부 피드백.
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

    // 웨이브 스포너 — 스폰 시점의 flowField를 클로저로 주입(설치/판매로 바뀌어도 최신값 사용).
    this.waveManager = new WaveManager({
      spawn: (kind, hpMult) => this.enemies.push(createEnemy(kind, this.flowField, hpMult)),
      onWaveClear: (_wave, bonus) => this.economy.addGold(bonus),
      onVictory: () => {
        this.state = 'won';
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
      towers: (Object.keys(towersData) as TowerKind[]).map((kind) => ({
        kind,
        name: towerSpec(kind).name,
        cost: towerSpec(kind).cost,
      })),
      onSelectTower: (kind) => this.toggleTower(kind),
      onSell: () => this.sellSelected(),
    });
    this.buildMenu.updateAffordability(this.economy.gold);

    this.input.onClick((x, y) => this.handleClick(x, y));
    this.keyboard.on('d', () => {
      this.showFlowDebug = !this.showFlowDebug;
    });
    this.keyboard.on('escape', () => this.handleEscape());
    this.keyboard.on('x', () => this.sellSelected());
    this.keyboard.on('r', () => this.restart()); // 승리/패배 후 다시 시작.
  }

  start(): void {
    new GameLoop({ update: (dt) => this.update(dt), render: () => this.render() }).start();
  }

  // ── 모드 전환 ────────────────────────────────────────────────
  private toggleTower(kind: TowerKind): void {
    if (this.placeKind === kind) {
      this.exitPlaceMode();
      return;
    }
    this.placeKind = kind;
    this.deselect(); // 설치 모드 진입 시 타워 선택 해제(상호 배타).
    this.buildMenu.setActiveTower(kind);
  }

  private exitPlaceMode(): void {
    this.placeKind = null;
    this.ghost = null;
    this.buildMenu.setActiveTower(null);
  }

  private handleEscape(): void {
    if (this.placeKind) {
      this.exitPlaceMode();
      return;
    }
    this.deselect();
  }

  private selectTower(t: Tower): void {
    this.selectedTower = t;
    this.buildMenu.showSell(this.refundOf(t));
  }

  private deselect(): void {
    if (!this.selectedTower) return;
    this.selectedTower = null;
    this.buildMenu.showSell(null);
  }

  private refundOf(t: Tower): number {
    return Math.round(t.invested * economyData.sellRefundRate);
  }

  // ── 클릭 처리 ────────────────────────────────────────────────
  private handleClick(px: number, py: number): void {
    const { cx, cy } = pixelToCell(px, py);
    if (!this.grid.inBounds(cx, cy)) return;

    if (this.placeKind) {
      this.tryPlace(this.placeKind, cx, cy);
      return;
    }
    // 비설치 모드: 타워 칸이면 선택, 빈 곳이면 해제.
    const t = this.towerAt(cx, cy);
    if (t) this.selectTower(t);
    else this.deselect();
  }

  private towerAt(cx: number, cy: number): Tower | null {
    return this.towers.find((t) => t.cx === cx && t.cy === cy) ?? null;
  }

  private tryPlace(kind: TowerKind, cx: number, cy: number): void {
    const spec = towerSpec(kind);
    if (this.economy.gold < spec.cost) return; // 골드 부족(버튼도 비활성이라 보통 도달 안 함).
    if (!isCellPlaceable(this.grid, this.enemies, cx, cy)) return; // 기본 조건 불가 → 무시.
    if (!isPathClear(this.grid, this.enemies, cx, cy)) {
      // 봉쇄 → 설치 거부 + 붉은 플래시.
      this.flash = { cx, cy, timer: REJECT_FLASH_TIME };
      return;
    }

    this.economy.spend(spec.cost);
    this.towers.push(new Tower(kind, cx, cy));
    this.grid.setState(cx, cy, 'tower');
    this.recomputeField(); // 설치 즉시 필드 재계산 + 전 적 reroute.

    // 더 이상 같은 타워를 살 수 없으면 설치 모드 해제(연속 설치 편의 + 혼동 방지).
    if (this.economy.gold < spec.cost) this.exitPlaceMode();
  }

  private sellSelected(): void {
    const t = this.selectedTower;
    if (!t) return;
    const refund = this.refundOf(t);
    this.towers = this.towers.filter((x) => x !== t);
    this.grid.setState(t.cx, t.cy, 'empty');
    this.economy.addGold(refund);
    this.deselect();
    this.recomputeField(); // 판매로 열린 길 반영 + 전 적 reroute.
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
    this.towers = [];
    this.grid.resetCells();
    this.combat.reset();
    this.waveManager.reset();
    this.recomputeField();

    this.state = 'playing';
    this.setSpeed(1);
    this.exitPlaceMode();
    this.deselect();
    this.flash = null;
    this.ghost = null;
    this.showHitbox = false;

    this.lastGold = this.economy.gold;
    this.buildMenu.updateAffordability(this.economy.gold);
    this.controls.showRestart(false);
  }

  // ── update / render ─────────────────────────────────────────
  // FPS·입력(호버/고스트)·플래시는 프레임당 1회, 게임 월드 갱신은 배속만큼 반복한다.
  // (배속은 dt를 키우지 않고 update(dt)를 N회 호출 — 슬로우/쿨다운 타이머 정확도 유지.)
  private update(dt: number): void {
    this.fps.update(dt);

    // 호버 칸.
    if (this.input.isInside) {
      const { cx, cy } = pixelToCell(this.input.x, this.input.y);
      this.hoverCell = this.grid.inBounds(cx, cy) ? { cx, cy } : null;
    } else {
      this.hoverCell = null;
    }

    // 설치 모드 고스트 — 설치 가능 여부(기본 조건)는 update에서 계산, render는 읽기만.
    if (this.placeKind && this.hoverCell) {
      const { cx, cy } = this.hoverCell;
      this.ghost = { cx, cy, valid: isCellPlaceable(this.grid, this.enemies, cx, cy) };
    } else {
      this.ghost = null;
    }

    // 거부 플래시 페이드아웃(실시간 기준 — 타이머 감소만 여기서).
    if (this.flash) {
      this.flash.timer -= dt;
      if (this.flash.timer <= 0) this.flash = null;
    }

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
    this.combat.update(dt, this.towers, this.enemies, this.economy, this.flowField);
    for (const e of this.enemies) if (e.reachedBase) this.economy.loseLife(1);
    this.enemies = this.enemies.filter((e) => !e.dead && !e.reachedBase);

    // 웨이브 진행/완료 판정(스폰도 여기서 발생). 완료 판정은 스폰 이후의 실제 적 수로.
    this.waveManager.update(dt, () => this.enemies.length);

    if (this.economy.isDefeated) this.state = 'lost';
  }

  // 상태 변화에 따른 UI 동기화(프레임당 1회). 골드 변동 시에만 빌드 메뉴 갱신.
  private syncUi(): void {
    if (this.economy.gold !== this.lastGold) {
      this.lastGold = this.economy.gold;
      this.buildMenu.updateAffordability(this.economy.gold);
    }
    // 다음 웨이브 버튼은 진행 중 + 대기 상태 + 남은 웨이브가 있을 때만 활성.
    this.controls.setNextWaveEnabled(this.state === 'playing' && this.waveManager.canStart);
    this.controls.showRestart(this.state !== 'playing');
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 그리드(정적) → 플로우 디버그 → 호버/고스트 → 타워 → 거부 플래시 → 적 → 전투(투사체·폭발) → HUD → FPS.
    this.grid.render(ctx);
    if (this.showFlowDebug) renderFlowField(ctx, this.flowField);

    if (this.ghost) this.renderGhost(ctx, this.ghost);
    else this.renderHover(ctx);

    for (const t of this.towers) t.render(ctx, t === this.selectedTower);
    if (this.flash) this.renderFlash(ctx, this.flash);
    for (const e of this.enemies) e.render(ctx);
    this.combat.render(ctx); // 투사체·폭발은 적 위에 그린다.

    if (this.showHitbox) renderHitboxes(ctx, this.enemies, this.towers); // H 치트.

    this.hud.render(ctx, this.economy, {
      current: this.waveManager.current,
      total: this.waveManager.total,
    });
    // 승리/패배 오버레이는 HUD 위, FPS 아래로 그린다.
    renderOverlay(ctx, this.state, this.waveManager.current, this.waveManager.total);
    this.fps.render(ctx);
  }

  private renderHover(ctx: CanvasRenderingContext2D): void {
    if (!this.hoverCell) return;
    const { x, y } = cellToPixel(this.hoverCell.cx, this.hoverCell.cy);
    ctx.fillStyle = COLOR_HOVER;
    ctx.fillRect(x, y, TILE, TILE);
  }

  private renderGhost(ctx: CanvasRenderingContext2D, g: Ghost): void {
    const { x, y } = cellToPixel(g.cx, g.cy);
    // 설치 가능=초록 / 불가=빨강 칸 표시.
    ctx.fillStyle = g.valid ? COLOR_GHOST_OK : COLOR_GHOST_BAD;
    ctx.fillRect(x, y, TILE, TILE);

    // 반투명 고스트 타워(설치 후 모습과 동일한 여백).
    if (this.placeKind) {
      ctx.save();
      ctx.globalAlpha = GHOST_ALPHA;
      ctx.fillStyle = towerSpec(this.placeKind).color;
      const size = TILE - TOWER_INSET * 2;
      ctx.fillRect(x + TOWER_INSET, y + TOWER_INSET, size, size);
      ctx.restore();
    }
  }

  private renderFlash(ctx: CanvasRenderingContext2D, f: Flash): void {
    const { x, y } = cellToPixel(f.cx, f.cy);
    ctx.save();
    ctx.globalAlpha = Math.max(0, f.timer / REJECT_FLASH_TIME); // 시간에 따라 페이드아웃.
    ctx.fillStyle = COLOR_REJECT;
    ctx.fillRect(x, y, TILE, TILE);
    ctx.restore();
  }
}

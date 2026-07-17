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
import { Enemy, createEnemy } from '../entities/enemy';
import { Tower, towerSpec, TowerKind, TOWER_INSET } from '../entities/tower';
import towersData from '../data/towers.json';
import economyData from '../data/economy.json';
import { Hud } from '../ui/hud';
import { BuildMenu } from '../ui/buildMenu';

// 시각 상수(밸런스 아님).
const COLOR_HOVER = 'rgba(255, 255, 255, 0.18)';
const COLOR_GHOST_OK = 'rgba(90, 220, 120, 0.35)'; // 설치 가능 칸
const COLOR_GHOST_BAD = 'rgba(230, 70, 70, 0.35)'; // 설치 불가 칸
const COLOR_REJECT = '#ff4040'; // 봉쇄 거부 플래시
const GHOST_ALPHA = 0.5; // 고스트 타워 반투명도
const REJECT_FLASH_TIME = 0.3; // 거부 플래시 지속(초)

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

  private flowField: FlowField;
  private enemies: Enemy[] = [];
  private towers: Tower[] = [];

  private hoverCell: { cx: number; cy: number } | null = null;
  private showFlowDebug = false;

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

  // ── update / render ─────────────────────────────────────────
  private update(dt: number): void {
    this.fps.update(dt);
    this.spawner.update(dt);

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

    // 거부 플래시 페이드아웃(타이머 감소만 여기서).
    if (this.flash) {
      this.flash.timer -= dt;
      if (this.flash.timer <= 0) this.flash = null;
    }

    for (const e of this.enemies) e.update(dt, this.flowField);
    for (const e of this.enemies) if (e.reachedBase) this.economy.loseLife(1);
    this.enemies = this.enemies.filter((e) => !e.dead && !e.reachedBase);

    // 골드가 변했을 때만 빌드 메뉴 활성/비활성 갱신(원인 무관하게 일관 유지).
    if (this.economy.gold !== this.lastGold) {
      this.lastGold = this.economy.gold;
      this.buildMenu.updateAffordability(this.economy.gold);
    }
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 그리드(정적) → 플로우 디버그 → 호버/고스트 → 타워 → 거부 플래시 → 적 → HUD → FPS.
    this.grid.render(ctx);
    if (this.showFlowDebug) renderFlowField(ctx, this.flowField);

    if (this.ghost) this.renderGhost(ctx, this.ghost);
    else this.renderHover(ctx);

    for (const t of this.towers) t.render(ctx, t === this.selectedTower);
    if (this.flash) this.renderFlash(ctx, this.flash);
    for (const e of this.enemies) e.render(ctx);

    this.hud.render(ctx, this.economy);
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

// 타워 설치/판매/선택 상호작용 — 마우스 클릭·호버, 설치 모드 고스트, 봉쇄 거부 플래시.
// (M5에서 game.ts가 300줄을 넘어, 순수 이동 리팩토링으로 상호작용 로직만 분리했다. 동작 변화 없음.)
//
// 타워 배열과 선택/설치 모드 상태는 이 클래스가 소유하고, Game이 소유·조율한다.
// 필드 재계산·적 목록은 Game이 소유하므로 콜백/게터로 주입받는다(설치·판매 후 최신값 사용).
// update(dt)/render(ctx) 분리 규칙 유지 — 상태 변경은 update 계열에서만, render는 읽기 전용.

import type { MouseInput } from '../core/input';
import type { Grid } from './grid';
import { TILE, cellToPixel, pixelToCell } from './grid';
import type { Economy } from './economy';
import type { Enemy } from '../entities/enemy';
import { Tower, towerSpec, TowerKind, TOWER_INSET } from '../entities/tower';
import { isCellPlaceable, isPathClear } from '../systems/placement';
import type { BuildMenu } from '../ui/buildMenu';
import economyData from '../data/economy.json';

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

export interface InteractionDeps {
  grid: Grid;
  economy: Economy;
  buildMenu: BuildMenu;
  getEnemies: () => Enemy[]; // Game이 매 프레임 배열을 재할당하므로 게터로 최신값 조회.
  recomputeField: () => void; // 설치/판매 후 플로우필드 재계산 + 전 적 reroute.
}

export class Interaction {
  readonly towers: Tower[] = [];

  private placeKind: TowerKind | null = null; // 설치 모드 대상(없으면 비설치 모드).
  private selectedTower: Tower | null = null; // 선택된 타워(판매 대상).
  private ghost: Ghost | null = null; // updateHover가 계산, render가 읽기만.
  private flash: Flash | null = null; // 봉쇄 거부 피드백.
  private hoverCell: { cx: number; cy: number } | null = null;

  constructor(private deps: InteractionDeps) {}

  // ── 모드 전환 ────────────────────────────────────────────────
  toggleTower(kind: TowerKind): void {
    if (this.placeKind === kind) {
      this.exitPlaceMode();
      return;
    }
    this.placeKind = kind;
    this.deselect(); // 설치 모드 진입 시 타워 선택 해제(상호 배타).
    this.deps.buildMenu.setActiveTower(kind);
  }

  private exitPlaceMode(): void {
    this.placeKind = null;
    this.ghost = null;
    this.deps.buildMenu.setActiveTower(null);
  }

  handleEscape(): void {
    if (this.placeKind) {
      this.exitPlaceMode();
      return;
    }
    this.deselect();
  }

  private selectTower(t: Tower): void {
    this.selectedTower = t;
    this.deps.buildMenu.showSell(this.refundOf(t));
  }

  private deselect(): void {
    if (!this.selectedTower) return;
    this.selectedTower = null;
    this.deps.buildMenu.showSell(null);
  }

  private refundOf(t: Tower): number {
    return Math.round(t.invested * economyData.sellRefundRate);
  }

  // ── 클릭 처리 ────────────────────────────────────────────────
  handleClick(px: number, py: number): void {
    const { cx, cy } = pixelToCell(px, py);
    if (!this.deps.grid.inBounds(cx, cy)) return;

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
    const { grid, economy } = this.deps;
    const enemies = this.deps.getEnemies();
    const spec = towerSpec(kind);
    if (economy.gold < spec.cost) return; // 골드 부족(버튼도 비활성이라 보통 도달 안 함).
    if (!isCellPlaceable(grid, enemies, cx, cy)) return; // 기본 조건 불가 → 무시.
    if (!isPathClear(grid, enemies, cx, cy)) {
      // 봉쇄 → 설치 거부 + 붉은 플래시.
      this.flash = { cx, cy, timer: REJECT_FLASH_TIME };
      return;
    }

    economy.spend(spec.cost);
    this.towers.push(new Tower(kind, cx, cy));
    grid.setState(cx, cy, 'tower');
    this.deps.recomputeField(); // 설치 즉시 필드 재계산 + 전 적 reroute.

    // 더 이상 같은 타워를 살 수 없으면 설치 모드 해제(연속 설치 편의 + 혼동 방지).
    if (economy.gold < spec.cost) this.exitPlaceMode();
  }

  sellSelected(): void {
    const t = this.selectedTower;
    if (!t) return;
    const refund = this.refundOf(t);
    this.towers.splice(this.towers.indexOf(t), 1);
    this.deps.grid.setState(t.cx, t.cy, 'empty');
    this.deps.economy.addGold(refund);
    this.deselect();
    this.deps.recomputeField(); // 판매로 열린 길 반영 + 전 적 reroute.
  }

  // ── update(상태 변경) ────────────────────────────────────────
  // 호버 칸 + 설치 모드 고스트 계산. 설치 가능 여부(기본 조건)는 여기서, render는 읽기만.
  updateHover(input: MouseInput): void {
    if (input.isInside) {
      const { cx, cy } = pixelToCell(input.x, input.y);
      this.hoverCell = this.deps.grid.inBounds(cx, cy) ? { cx, cy } : null;
    } else {
      this.hoverCell = null;
    }

    if (this.placeKind && this.hoverCell) {
      const { cx, cy } = this.hoverCell;
      this.ghost = { cx, cy, valid: isCellPlaceable(this.deps.grid, this.deps.getEnemies(), cx, cy) };
    } else {
      this.ghost = null;
    }
  }

  // 거부 플래시 페이드아웃(실시간 기준 — 타이머 감소만 여기서).
  updateFlash(dt: number): void {
    if (this.flash) {
      this.flash.timer -= dt;
      if (this.flash.timer <= 0) this.flash = null;
    }
  }

  // 재시작 — 타워·선택·설치 모드·피드백 상태를 모두 초기화한다.
  reset(): void {
    this.towers.length = 0;
    this.selectedTower = null;
    this.placeKind = null;
    this.ghost = null;
    this.flash = null;
    this.hoverCell = null;
    this.deps.buildMenu.setActiveTower(null);
    this.deps.buildMenu.showSell(null);
  }

  // ── render(읽기 전용) ────────────────────────────────────────
  // 호버/고스트 → 타워 → 거부 플래시 순으로, 그리기 순서는 Game.render가 조율한다.
  renderHoverOrGhost(ctx: CanvasRenderingContext2D): void {
    if (this.ghost) this.renderGhost(ctx, this.ghost);
    else this.renderHover(ctx);
  }

  renderTowers(ctx: CanvasRenderingContext2D): void {
    for (const t of this.towers) t.render(ctx, t === this.selectedTower);
  }

  renderFlash(ctx: CanvasRenderingContext2D): void {
    const f = this.flash;
    if (!f) return;
    const { x, y } = cellToPixel(f.cx, f.cy);
    ctx.save();
    ctx.globalAlpha = Math.max(0, f.timer / REJECT_FLASH_TIME); // 시간에 따라 페이드아웃.
    ctx.fillStyle = COLOR_REJECT;
    ctx.fillRect(x, y, TILE, TILE);
    ctx.restore();
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
}

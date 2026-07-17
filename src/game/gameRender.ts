// 디펜스 모드 렌더 오케스트레이션 — game.ts가 300줄을 넘어 render 본문을 분리했다(M12).
// 동작 변화 없음: 그리기 순서(그리드 → 디버그 → 호버/고스트 → 타워 → 적 → 유닛 → 전투 →
// 이펙트 → 히트박스 → HUD → 오버레이 → FPS)와 화면흔들림 오프셋을 그대로 옮겼다.
// 읽기 전용(상태 변경 없음) — Game.render가 자신의 참조들을 넘겨 호출한다.

import { renderFlowField } from '../debug/flowField';
import { renderRoad, type RoadPiece } from '../render/roadPath';
import { renderHitboxes } from '../debug/cheats';
import { renderOverlay } from '../ui/overlay';
import type { Grid } from './grid';
import type { Enemy } from '../entities/enemy';
import type { Interaction } from './interaction';
import type { UnitSelection } from './unitSelection';
import type { CombatSystem } from '../systems/combat';
import type { EffectsSystem } from '../systems/effects';
import type { FlowField } from '../systems/pathfinding';
import type { WaveManager } from './waves';
import type { ScreenShake } from './screenShake';
import type { GameFlow } from './flow';
import type { Economy } from './economy';
import type { Hud } from '../ui/hud';
import type { FpsCounter } from '../debug/fps';

export interface DefenseRenderParts {
  canvas: HTMLCanvasElement;
  shake: ScreenShake;
  grid: Grid;
  roadCells: RoadPiece[];
  showFlowDebug: boolean;
  flowField: FlowField;
  interaction: Interaction;
  enemies: Enemy[];
  unitSelection: UnitSelection;
  combat: CombatSystem;
  effects: EffectsSystem;
  showHitbox: boolean;
  hud: Hud;
  economy: Economy;
  waveManager: WaveManager;
  flow: GameFlow;
  fps: FpsCounter;
}

export function renderDefense(ctx: CanvasRenderingContext2D, p: DefenseRenderParts): void {
  ctx.clearRect(0, 0, p.canvas.width, p.canvas.height);

  // 화면흔들림 — 캔버스 전체를 오프셋(계산은 update, 여기선 적용만). translate는 clear 이후.
  ctx.save();
  if (p.shake.active) ctx.translate(p.shake.x, p.shake.y);

  p.grid.render(ctx);
  renderRoad(ctx, p.roadCells); // 바닥 바로 위 — 적이 따르는 현재 최단 경로를 도로 타일로.
  if (p.showFlowDebug) renderFlowField(ctx, p.flowField);

  p.interaction.renderHoverOrGhost(ctx);
  p.interaction.renderTowers(ctx);
  p.interaction.renderFlash(ctx);

  for (const e of p.enemies) e.render(ctx);
  p.unitSelection.renderRings(ctx); // 선택 링은 병사 아래에 깔리도록 먼저 그린다(M11).
  p.interaction.renderUnits(ctx); // 병사·집결지 마커는 적 위에 그린다(M10).
  p.combat.render(ctx); // 투사체·폭발은 적 위에 그린다.
  p.effects.render(ctx); // 데미지 숫자·처치 파티클은 최상단.
  p.unitSelection.renderDragBox(ctx); // 드래그 선택 박스는 최상단 UI 레이어(M11).

  if (p.showHitbox) renderHitboxes(ctx, p.enemies, p.interaction.towers); // H 치트.

  p.hud.render(ctx, p.economy, { current: p.waveManager.current, total: p.waveManager.total });
  // 승리/패배 오버레이는 HUD 위, FPS 아래로 그린다.
  renderOverlay(ctx, p.flow.state, p.waveManager.current, p.waveManager.total, p.flow.best);
  p.fps.render(ctx);

  ctx.restore();
}

// 복수 스폰(D7.3) 라운드로빈 분배 + 스폰별 도로 경로 조립. game.ts가 300줄을 넘어 분리했다.
//
// 플로우필드는 기지 기준 단일이라(스폰이 여러 개여도 그대로 동작), 여기서 다루는 것은
// ① 웨이브/디버그가 스폰한 적을 어느 침입 지점에서 출발시킬지(라운드로빈)와
// ② 스폰마다 스폰→기지 최단 경로 도로 조각을 뽑아 하나로 이어 붙이는 일(겹침은 중첩 렌더라 무해)뿐이다.

import { createEnemy, type Enemy, type EnemyKind } from '../entities/enemy';
import { cellCenter, type Grid } from './grid';
import { computeRoadCells, type RoadPiece } from '../render/roadPath';
import type { FlowField } from '../systems/pathfinding';

export class SpawnControl {
  private cursor = 0; // 다음에 쓸 스폰 인덱스(라운드로빈). 스폰 수가 바뀌어도 modulo로 항상 유효.

  /** 새 맵 진입·재시작 시 순번 초기화. */
  reset(): void {
    this.cursor = 0;
  }

  /** 라운드로빈으로 다음 침입 지점을 골라 그 칸 중심에서 적을 만들어 돌려준다(startPos로 지점 지정). */
  next(grid: Grid, field: FlowField, kind: EnemyKind, hpMultiplier = 1): Enemy {
    const spawns = grid.spawns;
    const s = spawns[this.cursor % spawns.length];
    this.cursor += 1;
    return createEnemy(kind, field, hpMultiplier, cellCenter(s.cx, s.cy));
  }

  /** 스폰별 스폰→기지 도로 조각을 모두 이어 붙인다(겹치는 칸은 중첩 렌더라 무해). */
  roads(grid: Grid, field: FlowField): RoadPiece[] {
    return grid.spawns.flatMap((s) => computeRoadCells(field, s));
  }
}

// D7.1/D7.2 지형 텔레메트리 — rough 감속 실측 + 현재 도로 경로(읽기 전용). 캔버스 밖(Playwright)에서
// ① rough 칸 위에서 감속 중인 적 수·rough 이속 배율로 rough 감속을 확인하고, ② 스폰→기지 도로
// 경로 칸 목록으로 도로가 지형(rock/water)을 우회해 깔리는지 확인한다. 게임 로직은 이 값을 안 읽는다.

import { roughSpeedFactor } from '../game/maps';
import type { RoadPiece } from '../render/roadPath';

interface TerrainTelemetry {
  roughSlowed: number; // 이번 프레임 rough 위에서 감속 중인 적 수.
  factor: number; // 적용 중인 rough 이속 배율(maps.json roughSpeedFactor).
  road: [number, number][]; // 현재 도로 경로 칸([cx,cy] 목록) — 지형 우회 검증용(D7.2).
}

/** 매 프레임 window에 rough 감속 적 수·배율·도로 경로를 발행한다(지형 데모 전용). */
export function publishTerrainTelemetry(roughSlowed: number, road: RoadPiece[] = []): void {
  const factor = roughSpeedFactor();
  const cells = road.map((p) => [p.cx, p.cy] as [number, number]);
  (window as unknown as { __gridlockTerrain?: TerrainTelemetry }).__gridlockTerrain = { roughSlowed, factor, road: cells };
}

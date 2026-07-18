// D7.1 지형 텔레메트리 — rough 감속 실측용(읽기 전용). 캔버스 밖(Playwright)에서 현재 rough
// 칸 위에서 감속 중인 적 수와 rough 이속 배율을 읽어, rough 지형이 실제로 적을 느리게 하는지
// 확인한다. 게임 로직은 이 값을 참조하지 않는다(스트레스 텔레메트리와 동일한 패턴).

import { roughSpeedFactor } from '../game/maps';

interface TerrainTelemetry {
  roughSlowed: number; // 이번 프레임 rough 위에서 감속 중인 적 수.
  factor: number; // 적용 중인 rough 이속 배율(maps.json roughSpeedFactor).
}

/** 매 프레임 window에 rough 감속 적 수와 배율을 발행한다(rough 실측 데모 전용). */
export function publishTerrainTelemetry(roughSlowed: number): void {
  const factor = roughSpeedFactor();
  (window as unknown as { __gridlockTerrain?: TerrainTelemetry }).__gridlockTerrain = { roughSlowed, factor };
}

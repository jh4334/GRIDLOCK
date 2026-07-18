// 디펜스 맵 정의 접근기(D4.4→D7.1) — 밸런스/지형 데이터는 src/data/maps.json이 소유하고,
// 여기서는 맵 id로 지형 좌표·이름을 읽어 주는 얇은 래퍼만 둔다(코드에 매직넘버 금지).
//
// 지형 3종(D7.1):
//   rock  — 통행×·건설× (isWalkable false)
//   water — 통행×·건설× (isWalkable false, 시각만 물 타일로 구분)
//   rough — 통행○·건설○이되 적 이속 roughSpeedFactor 배(전략 지형)
// Grid.setMap에 지형을 주입하면 정적 레이어에 그려지고, isWalkable/isCellPlaceable이
// rock·water는 벽으로, rough는 통행·설치 가능한 감속 지형으로 취급한다.

import mapsData from '../data/maps.json';
import type { MapId } from '../core/storage';

// [cx, cy] 쌍. maps.json terrain.{rock,water,rough} 각 항목과 1:1.
export type TerrainCell = [number, number];

// 한 맵의 지형 3종 좌표 묶음(정적, 게임 중 불변).
export interface MapTerrain {
  rock: TerrainCell[];
  water: TerrainCell[];
  rough: TerrainCell[];
}

/** 맵 id의 지형 좌표 묶음. 미정의 id·필드면 빈 배열(안전 폴백). */
export function mapTerrain(id: MapId): MapTerrain {
  const t = mapsData.maps[id]?.terrain;
  return {
    rock: (t?.rock ?? []) as TerrainCell[],
    water: (t?.water ?? []) as TerrainCell[],
    rough: (t?.rough ?? []) as TerrainCell[],
  };
}

/** 전체 맵 목록(JSON 정의 순서). 타이틀 버튼을 데이터로 생성하는 데 쓴다(D7.2). */
export function mapList(): { id: MapId; name: string }[] {
  return (Object.keys(mapsData.maps) as MapId[]).map((id) => ({ id, name: mapsData.maps[id].name }));
}

/** rough 칸 위 적 이속 배율(밸런스 수치, maps.json 최상위). 프로스트 슬로우와 곱연산. */
export function roughSpeedFactor(): number {
  return mapsData.roughSpeedFactor;
}

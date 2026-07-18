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
import type { Cell } from './grid';

// [cx, cy] 쌍. maps.json terrain.{rock,water,rough}·spawns 각 항목과 1:1.
export type TerrainCell = [number, number];

// 한 맵의 지형 3종 좌표 묶음(정적, 게임 중 불변).
export interface MapTerrain {
  rock: TerrainCell[];
  water: TerrainCell[];
  rough: TerrainCell[];
}

// 스폰이 정의되지 않은 맵(대부분)의 기본 침입 지점 — 좌측 중앙 단일 스폰(D7.3).
const DEFAULT_SPAWNS: TerrainCell[] = [[0, 7]];

// JSON 정의 맵만 담은 조회용 사전(random·daily 등 절차 생성 id는 여기 없다 → undefined 폴백).
type FixedMap = { name: string; spawns?: number[][]; terrain?: { rock?: number[][]; water?: number[][]; rough?: number[][] } };
const FIXED_MAPS = mapsData.maps as unknown as Record<string, FixedMap>;

/** 맵 id의 지형 좌표 묶음. 미정의 id(절차 생성 포함)·필드면 빈 배열(안전 폴백). */
export function mapTerrain(id: MapId): MapTerrain {
  const t = FIXED_MAPS[id]?.terrain;
  return {
    rock: (t?.rock ?? []) as TerrainCell[],
    water: (t?.water ?? []) as TerrainCell[],
    rough: (t?.rough ?? []) as TerrainCell[],
  };
}

/**
 * 맵 id의 침입 지점 목록(D7.3) — 복수 스폰 지원. maps.json에 spawns가 없으면 기본 단일 스폰.
 * 기지는 단일 유지(BASE 상수)라 여기선 다루지 않는다.
 */
export function mapSpawns(id: MapId): Cell[] {
  const raw = FIXED_MAPS[id]?.spawns ?? DEFAULT_SPAWNS;
  return raw.map(([cx, cy]) => ({ cx, cy }));
}

/**
 * 전체 맵 목록(JSON 정의 순서). 타이틀 버튼을 데이터로 생성하는 데 쓴다(D7.2).
 * 끝에 절차 생성 맵 2종(랜덤·오늘의 맵, D7.5)을 덧붙인다 — JSON에 없어 지형은 mapGen이 만든다.
 */
export function mapList(): { id: MapId; name: string }[] {
  const keys = Object.keys(mapsData.maps) as (keyof typeof mapsData.maps)[];
  const fixed = keys.map((id) => ({ id: id as MapId, name: mapsData.maps[id].name }));
  return [...fixed, { id: 'random' as MapId, name: '랜덤' }, { id: 'daily' as MapId, name: '오늘의 맵' }];
}

/** rough 칸 위 적 이속 배율(밸런스 수치, maps.json 최상위). 프로스트 슬로우와 곱연산. */
export function roughSpeedFactor(): number {
  return mapsData.roughSpeedFactor;
}

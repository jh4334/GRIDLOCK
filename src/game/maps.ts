// 디펜스 맵 정의 접근기(D4.4) — 밸런스/지형 데이터는 src/data/maps.json이 소유하고,
// 여기서는 맵 id로 바위 좌표·이름을 읽어 주는 얇은 래퍼만 둔다(코드에 매직넘버 금지).
//
// 바위(rock) 칸은 건설·통행·판매 불가. Grid.setMap에 좌표 배열을 주입하면 정적 레이어에
// 그려지고 isWalkable/isCellPlaceable이 벽으로 취급한다. 최고기록은 맵 구분 없이 공용.

import mapsData from '../data/maps.json';
import type { MapId } from '../core/storage';

// [cx, cy] 쌍의 배열. maps.json의 rocks 필드와 1:1.
export type RockCell = [number, number];

/** 맵 id의 바위 좌표 배열. 미정의 id면 빈 배열(안전 폴백). */
export function mapRocks(id: MapId): RockCell[] {
  return (mapsData.maps[id]?.rocks ?? []) as RockCell[];
}

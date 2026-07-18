// D7.5 랜덤 맵 생성기 텔레메트리 — 캔버스 밖(Playwright)에서 시드 절차 생성을 직접 검증할 수 있게
// window에 생성 함수를 1회 노출한다. E2E는 이걸로 ① 같은 시드 재현성(deep-equal) ② 연속 시드
// 도달성(BFS)을 어서션한다. 게임 로직은 이 노출을 참조하지 않는다(읽기 전용 훅).

import { generateMap } from '../game/mapGen';
import type { MapTerrain } from '../game/maps';
import type { Cell } from '../game/grid';

type GenResult = { terrain: MapTerrain; spawns: Cell[] };

/** window.__gridlockGen(seed) 로 결정적 생성 결과({terrain,spawns})를 얻게 노출한다. */
export function exposeMapGen(): void {
  (window as unknown as { __gridlockGen?: (seed: number) => GenResult }).__gridlockGen = (seed) => generateMap(seed);
}

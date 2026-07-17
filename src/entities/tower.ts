// 타워 엔티티 — 한 칸을 차지하는 벽 겸 공격 유닛. M3는 설치·판매만, 전투는 M4.
//
// 수치는 전부 data/towers.json에서 로딩(코드에 매직넘버 금지). range/fireRate/damage
// 등 전투 필드는 지금 저장만 해 두고 M4 combat 시스템에서 사용한다.

import towersData from '../data/towers.json';
import { TILE, cellToPixel } from '../game/grid';

export type TowerKind = keyof typeof towersData;

export interface TowerSpec {
  name: string;
  cost: number;
  range: number; // px
  fireRate: number; // 회/s
  damage: number;
  color: string;
  projectileSpeed: number; // px/s
  projectileRadius: number; // px (투사체 크기 + 명중 여유)
  projectileColor: string;
  splashRadius?: number; // 캐논 전용
  slowFactor?: number; // 프로스트 전용 — 이속 감소 비율
  slowDuration?: number; // 프로스트 전용 — 초
}

/** 종류별 스펙 조회. */
export function towerSpec(kind: TowerKind): TowerSpec {
  return towersData[kind] as TowerSpec;
}

// 칸 안쪽 여백(시각 상수) — 격자선이 보이도록 칸을 꽉 채우지 않고 살짝 줄인다.
// 고스트 미리보기도 같은 여백을 써서 설치 후 모습과 일치시킨다.
export const TOWER_INSET = 4;
const COLOR_SELECT_RING = '#ffe066';

export class Tower {
  readonly kind: TowerKind;
  readonly spec: TowerSpec;
  readonly cx: number;
  readonly cy: number;
  // 누적 투자액 — 판매 환급(invested × sellRefundRate) 계산용. M7 업그레이드 시 증가.
  invested: number;
  // 발사 쿨다운(초). 0 이하면 발사 가능. combat 시스템이 감소·갱신한다.
  cooldown = 0;

  constructor(kind: TowerKind, cx: number, cy: number) {
    this.kind = kind;
    this.spec = towerSpec(kind);
    this.cx = cx;
    this.cy = cy;
    this.invested = this.spec.cost;
  }

  // 렌더는 상태를 읽기만 한다(변경 없음). selected면 선택 링을 덧그린다.
  render(ctx: CanvasRenderingContext2D, selected: boolean): void {
    const { x, y } = cellToPixel(this.cx, this.cy);
    const size = TILE - TOWER_INSET * 2;
    ctx.fillStyle = this.spec.color;
    ctx.fillRect(x + TOWER_INSET, y + TOWER_INSET, size, size);

    if (selected) {
      ctx.save();
      ctx.strokeStyle = COLOR_SELECT_RING;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2.5, y + 2.5, TILE - 5, TILE - 5);
      ctx.restore();
    }
  }
}

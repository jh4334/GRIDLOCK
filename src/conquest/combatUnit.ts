// 정복 전투 유닛 — 진영(side) 태그를 가진 근접 전투 병사. 플레이어·적이 완전히 같은 클래스로
// 대칭이다(색만 진영별로 다르다). 타겟팅·교전 판정은 conquestCombat 시스템이 담당하고,
// 이 엔티티는 위치·스탯·이동(경로 추종)·렌더만 소유한다(update/render 분리).
//
// Combatant: 공격 대상이 될 수 있는 것의 공통 계약(유닛·건물·본진 모두 구현). 근접 유닛은
// 사거리 내 적 Combatant를 향해 이동해 접촉 시 공격한다. 수치는 conquest.json에서 주입.

import { pixelToCell } from '../game/grid';
import { drawTrooper } from '../render/unitSprites';
import { drawHpBar } from '../render/hpbar';
import { ALLY_CYAN, FOE_ORANGE } from '../render/palette';
import type { Side } from './hq';
import type { Building } from './building';

export type { Side };
export type Pt = { x: number; y: number };

// 데미지를 받을 수 있는 대상의 공통 계약 — 유닛/건물/HQ가 구조적으로 구현한다.
export interface Combatant {
  readonly side: Side;
  readonly x: number;
  readonly y: number;
  readonly radius: number; // 접촉·명중 판정용 반경(px).
  hp: number;
  readonly dead: boolean; // 파괴/사망(hp<=0).
  readonly structure: boolean; // true면 이동 없는 고정 구조물(건물/HQ).
}

export interface UnitStats {
  hp: number;
  damage: number;
  attackRate: number; // 근접 공속(회/s).
  speed: number; // px/s.
  radius: number; // px.
  color: string;
}

// 유닛 렌더 상수(밸런스 아님, 시각 상수).
const HP_BAR_H = 3;
const HP_BAR_GAP = 6;

export class CombatUnit implements Combatant {
  readonly side: Side;
  readonly speed: number;
  readonly radius: number;
  readonly damage: number;
  readonly attackRate: number;
  readonly color: string;
  readonly structure = false;

  x: number;
  y: number;
  hp: number;
  readonly maxHp: number;

  dead = false;
  facing = 0; // 이동 방향각(rad) — moveToward가 갱신, render가 쉐브론 회전에 사용.
  attackCooldown = 0; // 다음 공격까지 남은 시간(초). combat이 감소·갱신.

  // 명령 경로(A* 칸 중심 웨이포인트). 앞에서부터 소비. 비면 도착.
  path: Pt[] = [];
  // 명령받은 구조물/유닛 타겟(공격 이동). 없으면 대기 지점을 지킨다.
  orderedTarget: Combatant | null = null;
  // 공격 이동(A키) 중 여부 — true면 이동 중에도 전체 engageRadius로 적 유닛·건물을 감지·교전한다.
  // 일반 이동 명령은 false라 감지 반경이 절반이고 건물을 무시해 목적지까지 관통한다.
  attackMove = false;
  // 대기(방어) 지점 — 소속 배럭 집결지. 명령이 없으면 이곳으로 복귀.
  guardX: number;
  guardY: number;
  // 소속 배럭(리스폰 회계용 역참조). 배럭 파괴 후에도 대기 지점은 유지된다.
  readonly home: Building | null;

  constructor(side: Side, x: number, y: number, stats: UnitStats, home: Building | null) {
    this.side = side;
    this.x = x;
    this.y = y;
    this.hp = stats.hp;
    this.maxHp = stats.hp;
    this.damage = stats.damage;
    this.attackRate = stats.attackRate;
    this.speed = stats.speed;
    this.radius = stats.radius;
    this.color = stats.color;
    this.home = home;
    this.guardX = x;
    this.guardY = y;
  }

  get cell(): { cx: number; cy: number } {
    return pixelToCell(this.x, this.y);
  }

  /** 명령 경로·대기 지점 지정. */
  setGuard(x: number, y: number): void {
    this.guardX = x;
    this.guardY = y;
  }

  /** 목표점으로 이번 프레임만큼 직선 이동. 도착하면 true. */
  moveToward(tx: number, ty: number, dt: number): boolean {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.speed * dt;
    if (d > 0) this.facing = Math.atan2(dy, dx); // 이동 방향으로 쉐브론 회전(렌더용).
    if (d <= step || d === 0) {
      this.x = tx;
      this.y = ty;
      return true;
    }
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
    return false;
  }

  /** 명령 경로를 따라 이동. 경로를 다 소비하면(=도착) true. */
  followPath(dt: number): boolean {
    if (this.path.length === 0) return true;
    const wp = this.path[0];
    if (this.moveToward(wp.x, wp.y, dt)) this.path.shift();
    return this.path.length === 0;
  }

  // 읽기 전용 렌더 — 진영 코어 + 방향 쉐브론 스프라이트 + HP바.
  render(ctx: CanvasRenderingContext2D): void {
    drawTrooper(ctx, this.side === 'player' ? 'ally' : 'foe', this.x, this.y, this.facing, this.radius);
    drawHpBar(
      ctx,
      this.x - this.radius,
      this.y - this.radius - HP_BAR_GAP - HP_BAR_H,
      this.radius * 2,
      HP_BAR_H,
      this.hp / this.maxHp,
      this.side === 'player' ? ALLY_CYAN : FOE_ORANGE,
    );
  }
}

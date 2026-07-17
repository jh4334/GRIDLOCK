// 정복 부대지정(Ctrl+숫자) — 선택한 전투 유닛·일꾼을 1~9번 부대로 묶어 두고, 숫자키로 다시
// 불러온다. 부대는 전투 유닛/일꾼을 함께 담을 수 있고(선택과 동일 자료), 부대원이 죽으면
// prune에서 자동 제외한다. 상태 변경은 assign/prune에서만, renderBadges는 읽기 전용.

import type { CombatUnit } from './combatUnit';
import type { Worker } from './worker';

// 부대 = 전투 유닛 배열 + 일꾼 배열(선택 상태와 같은 형태). 재선택 시 그대로 선택에 넘긴다.
interface Group {
  units: CombatUnit[];
  workers: Worker[];
}

// 뱃지(부대 번호) 시각 상수 — 밸런스 아님.
const BADGE_R = 6;
const BADGE_BG = 'rgba(18, 32, 46, 0.9)';
const BADGE_FG = '#ffe066';

export class ConquestControlGroups {
  private groups = new Map<number, Group>();

  /** 새 판 시작 시 모든 부대 해제. */
  reset(): void {
    this.groups.clear();
  }

  /** 현재 선택을 n번 부대로 지정(기존 부대원은 교체). 살아있는 대상만 담는다. */
  assign(n: number, units: CombatUnit[], workers: Worker[]): void {
    const alive = { units: units.filter((u) => !u.dead), workers: workers.filter((w) => !w.dead) };
    if (alive.units.length === 0 && alive.workers.length === 0) {
      this.groups.delete(n);
      return;
    }
    this.groups.set(n, alive);
  }

  /** n번 부대의 살아있는 멤버(전투 유닛·일꾼). 없으면 null. */
  members(n: number): Group | null {
    const g = this.groups.get(n);
    if (!g) return null;
    return { units: g.units, workers: g.workers };
  }

  /** 죽은 부대원 제외 — 매 프레임 호출. 빈 부대는 삭제. */
  prune(): void {
    for (const [n, g] of this.groups) {
      g.units = g.units.filter((u) => !u.dead);
      g.workers = g.workers.filter((w) => !w.dead);
      if (g.units.length === 0 && g.workers.length === 0) this.groups.delete(n);
    }
  }

  /** 소속 부대 번호 뱃지를 유닛 위에 작게 그린다(읽기 전용). 여러 부대 소속이면 최소 번호 표기. */
  renderBadges(ctx: CanvasRenderingContext2D): void {
    const label = new Map<CombatUnit | Worker, number>();
    for (const n of [...this.groups.keys()].sort((a, b) => a - b)) {
      const g = this.groups.get(n)!;
      for (const u of g.units) if (!u.dead && !label.has(u)) label.set(u, n);
      for (const w of g.workers) if (!w.dead && !label.has(w)) label.set(w, n);
    }
    if (label.size === 0) return;
    ctx.save();
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [m, n] of label) {
      const bx = m.x + m.radius;
      const by = m.y - m.radius;
      ctx.fillStyle = BADGE_BG;
      ctx.beginPath();
      ctx.arc(bx, by, BADGE_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = BADGE_FG;
      ctx.fillText(String(n), bx, by + 0.5);
    }
    ctx.restore();
  }
}

// 디버그 스폰 키(임시) — 웨이브 시스템(M5)이 들어오기 전까지 숫자키로 적을 소환한다.
//   1=runner  2=grunt  3=tanker  4=swarm 12기  5=boss
// 여러 기를 한 번에 넣으면 겹치므로 STAGGER 간격으로 하나씩 큐에서 흘려보낸다.
// (STAGGER는 밸런스가 아닌 디버그 편의 상수.)

import type { Keyboard } from '../core/input';
import type { EnemyKind } from '../entities/enemy';

const STAGGER = 0.15; // 초. 연속 스폰 간격.
const SWARM_COUNT = 12; // 스웜 무리 크기(DESIGN.md).

export class DebugSpawner {
  private queue: EnemyKind[] = [];
  private timer = 0;

  constructor(keyboard: Keyboard, private spawn: (kind: EnemyKind) => void) {
    keyboard.on('1', () => this.enqueue('runner', 1));
    keyboard.on('2', () => this.enqueue('grunt', 1));
    keyboard.on('3', () => this.enqueue('tanker', 1));
    keyboard.on('4', () => this.enqueue('swarm', SWARM_COUNT));
    keyboard.on('5', () => this.enqueue('boss', 1));
  }

  private enqueue(kind: EnemyKind, count: number): void {
    for (let i = 0; i < count; i++) this.queue.push(kind);
  }

  update(dt: number): void {
    if (this.queue.length === 0) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      const kind = this.queue.shift()!;
      this.spawn(kind);
      this.timer = STAGGER;
    }
  }
}

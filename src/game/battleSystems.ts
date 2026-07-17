// 전투 시스템 구성 — combat(투사체) + melee(근접) 생성과 이펙트/사운드/화면흔들림 배선을
// game.ts에서 분리(M10 리팩토링). 두 시스템은 좌표·값만 넘기고, 이펙트/오디오 연결은 여기서 한다.
// 동작 변화 없음 — 생성 배선을 옮겼을 뿐, 콜백 내용·호출 시점은 그대로다.

import { CombatSystem } from '../systems/combat';
import { MeleeSystem } from '../systems/melee';
import type { EffectsSystem } from '../systems/effects';
import type { AudioEngine } from '../core/audio';
import type { ScreenShake } from './screenShake';
import type { DecalField } from '../render/decals';

export interface BattleHooks {
  effects: EffectsSystem;
  audio: AudioEngine;
  shake: ScreenShake;
  decals: DecalField; // 적 사망 지점 잔해 데칼(D2.5).
}

/** combat + melee를 생성하고 이펙트/사운드/화면흔들림 훅을 배선해 돌려준다. */
export function createBattleSystems(h: BattleHooks): { combat: CombatSystem; melee: MeleeSystem } {
  const combat = new CombatSystem({
    onFire: (kind) => h.audio.fire(kind),
    onDamage: (x, y, amount) => {
      h.effects.spawnDamage(x, y, amount);
      h.audio.hit();
    },
    onKill: (x, y, color) => {
      h.effects.spawnKill(x, y, color);
      h.decals.spawn(x, y); // 사망 지점에 어두운 궤적 잔해를 남긴다.
      h.audio.kill();
    },
    onCannonHit: () => {
      h.shake.trigger();
      h.audio.boom();
    },
  });

  // 근접 전투(병사↔적) — 처치·사망 이펙트를 combat과 같은 훅 방식으로 배선(M10).
  const melee = new MeleeSystem({
    onEnemyKilled: (x, y, color) => {
      h.effects.spawnKill(x, y, color);
      h.decals.spawn(x, y); // 근접 처치도 동일하게 잔해를 남긴다.
      h.audio.kill();
    },
    onSoldierKilled: (x, y, color) => {
      h.effects.spawnKill(x, y, color); // 병사는 시체 없이 파티클만.
    },
  });

  return { combat, melee };
}

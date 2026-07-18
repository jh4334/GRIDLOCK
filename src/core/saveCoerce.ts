// 저장 필드 정규화(D7.5에서 storage.ts 300줄 규칙을 지키려 분리) — 파싱된 임의 값(손상 가능)을
// 각 필드의 정상값으로 강제하는 순수 함수 모음. 손상/형식 불일치면 기본값(null/0/'classic' 등)으로
// 되돌린다. storage.ts의 normalize/migrate가 이 함수들을 조합해 SaveData를 만든다.

import mapsData from '../data/maps.json';
import conquestData from '../data/conquest.json';
import type { BestRecord, AudioSettings, DailyRecord, DifficultyId, MapId, ConquestMapId } from './storage';

export function coerceBest(x: unknown): BestRecord | null {
  if (
    typeof x !== 'object' ||
    x === null ||
    typeof (x as BestRecord).wave !== 'number' ||
    typeof (x as BestRecord).lives !== 'number' ||
    typeof (x as BestRecord).cleared !== 'boolean'
  ) {
    return null;
  }
  const r = x as BestRecord;
  return { wave: r.wave, lives: r.lives, cleared: r.cleared };
}

export function coerceEndless(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function coerceAudio(x: unknown): AudioSettings | null {
  if (
    typeof x !== 'object' ||
    x === null ||
    typeof (x as AudioSettings).volume !== 'number' ||
    typeof (x as AudioSettings).muted !== 'boolean'
  ) {
    return null;
  }
  const s = x as AudioSettings;
  return { volume: Math.min(1, Math.max(0, s.volume)), muted: s.muted };
}

export function coerceDifficulty(x: unknown): DifficultyId {
  return x === 'easy' || x === 'normal' || x === 'hard' ? x : 'normal';
}

export function coerceMap(x: unknown): MapId {
  if (x === 'random' || x === 'daily') return x; // 절차 생성 맵(JSON에 없음, D7.5).
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(mapsData.maps, x)
    ? (x as MapId)
    : 'classic';
}

export function coerceDaily(x: unknown): DailyRecord | null {
  if (
    typeof x !== 'object' ||
    x === null ||
    typeof (x as DailyRecord).seed !== 'number' ||
    typeof (x as DailyRecord).wave !== 'number' ||
    typeof (x as DailyRecord).cleared !== 'boolean'
  ) {
    return null;
  }
  const r = x as DailyRecord;
  return { seed: r.seed, wave: r.wave, cleared: r.cleared };
}

export function coerceConquestMap(x: unknown): ConquestMapId {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(conquestData.maps, x)
    ? (x as ConquestMapId)
    : 'standard';
}

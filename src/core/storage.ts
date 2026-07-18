// localStorage 저장/불러오기 — 백엔드 없음(DESIGN.md).
// 사파리 프라이빗 모드 등 localStorage 접근 자체가 예외를 던지는 환경에서도
// 게임이 죽지 않도록 모든 접근을 try/catch로 감싼다(실패 시 조용히 무시).
//
// ── 저장 스키마 v2(D5.2) ──────────────────────────────────────────
// 예전에는 항목마다 별도 키(gridlock.best/endless/audio/difficulty/map)로 흩어져 있었다.
// v2부터는 단일 `gridlock.save` 키에 버전 필드가 붙은 하나의 객체로 통합한다:
//   { v: 2, best, endlessBest, audio, difficulty, map }
// 부팅 후 첫 접근 시 `gridlock.save`가 없고 구버전 개별 키가 하나라도 있으면 1회
// 마이그레이션한다(각 필드 독립 승계 → 없는 필드는 기본값, 통합 저장 후 구키 삭제).
// 공개 API(loadBest/saveBest/…)의 시그니처는 그대로 유지하고, 내부에서만 v2 객체를
// read-modify-write 한다. 손상된 v2 객체는 크래시 없이 기본값으로 재초기화한다.
//
// "더 좋은 기록"의 정의(isBetter):
//   1) 클리어(승리)한 기록이 클리어 못한 기록보다 무조건 낫다.
//   2) 같은 클리어 여부면 더 높은 도달 웨이브가 낫다.
//   3) 웨이브도 같으면 남은 라이프가 많은 쪽이 낫다.

export interface BestRecord {
  wave: number; // 도달 웨이브(승리 시 총 웨이브 수).
  lives: number; // 종료 시점 남은 라이프.
  cleared: boolean; // 20웨이브 클리어(승리) 여부.
}

export interface AudioSettings {
  volume: number; // 0~1 마스터 음량 배율.
  muted: boolean;
}

/** 오늘의 맵 최고기록(D7.5) — 시드별. 같은 시드일 때만 비교·갱신한다. */
export interface DailyRecord {
  seed: number; // YYYYMMDD.
  wave: number; // 도달 웨이브(클리어 시 총 웨이브 수).
  cleared: boolean; // 클리어(승리) 여부.
}

import mapsData from '../data/maps.json';
import conquestData from '../data/conquest.json';
import { coerceBest, coerceEndless, coerceAudio, coerceDifficulty, coerceMap, coerceDaily, coerceConquestMap } from './saveCoerce';

export type DifficultyId = 'easy' | 'normal' | 'hard';
// 디펜스 맵 id — maps.json의 키 목록에서 파생(데이터 주도, D7.2). 맵 추가 시 JSON만 고치면 된다.
// 'random'(진입 시 새 시드)·'daily'(오늘의 맵, 시드=날짜)는 절차 생성 맵이라 JSON에 없고 여기서 합류(D7.5).
export type MapId = keyof typeof mapsData.maps | 'random' | 'daily';
// 정복 맵 id — conquest.json maps 키에서 파생(데이터 주도, D7.4).
export type ConquestMapId = keyof typeof conquestData.maps;

/** 정복 맵 목록(정의 순서, id·이름) — 타이틀 버튼을 데이터로 생성. */
export function conquestMapList(): { id: ConquestMapId; name: string }[] {
  return (Object.keys(conquestData.maps) as ConquestMapId[]).map((id) => ({ id, name: conquestData.maps[id].name }));
}

/** 통합 저장 객체(v2). null/기본값은 "해당 항목 미기록"을 뜻한다. */
export interface SaveData {
  v: 2;
  best: BestRecord | null;
  endlessBest: number;
  audio: AudioSettings | null;
  difficulty: DifficultyId;
  map: MapId;
  conquestMap: ConquestMapId;
  daily: DailyRecord | null; // 오늘의 맵 최고기록(시드별, D7.5).
}

const SAVE_KEY = 'gridlock.save';
const SCHEMA_VERSION = 2 as const;

// 마이그레이션 대상 구버전 개별 키(v1).
const LEGACY_KEYS = {
  best: 'gridlock.best',
  endless: 'gridlock.endless',
  audio: 'gridlock.audio',
  difficulty: 'gridlock.difficulty',
  map: 'gridlock.map',
} as const;

function defaults(): SaveData {
  return { v: SCHEMA_VERSION, best: null, endlessBest: 0, audio: null, difficulty: 'normal', map: 'classic', conquestMap: 'standard', daily: null };
}

/** 파싱된 임의 값 → 정상 SaveData(필드별로 정규화, 손상 필드는 기본값). */
function normalize(parsed: unknown): SaveData {
  const o = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>;
  return {
    v: SCHEMA_VERSION,
    best: coerceBest(o.best),
    endlessBest: coerceEndless(o.endlessBest),
    audio: coerceAudio(o.audio),
    difficulty: coerceDifficulty(o.difficulty),
    map: coerceMap(o.map),
    conquestMap: coerceConquestMap(o.conquestMap),
    daily: coerceDaily(o.daily),
  };
}

// ── v1 → v2 마이그레이션 ──────────────────────────────────────────
// 구버전 키를 각기 독립된 try로 읽어(한 필드가 깨져도 나머지는 승계) v2 객체를 만든다.
// 하나라도 승계했으면 통합 저장 후 구키를 전부 삭제한다. 승계 대상이 없으면 아무것도 쓰지 않는다.
function migrateLegacy(): SaveData {
  const data = defaults();
  let migrated = false;

  const read = (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const readJson = (key: string): unknown => {
    const raw = read(key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  };

  const bestRaw = read(LEGACY_KEYS.best);
  if (bestRaw !== null) { data.best = coerceBest(readJson(LEGACY_KEYS.best)); migrated = true; }

  const endlessRaw = read(LEGACY_KEYS.endless);
  if (endlessRaw !== null) { data.endlessBest = coerceEndless(endlessRaw); migrated = true; }

  const audioRaw = read(LEGACY_KEYS.audio);
  if (audioRaw !== null) { data.audio = coerceAudio(readJson(LEGACY_KEYS.audio)); migrated = true; }

  const diffRaw = read(LEGACY_KEYS.difficulty);
  if (diffRaw !== null) { data.difficulty = coerceDifficulty(diffRaw); migrated = true; }

  const mapRaw = read(LEGACY_KEYS.map);
  if (mapRaw !== null) { data.map = coerceMap(mapRaw); migrated = true; }

  if (migrated) {
    writeSave(data);
    for (const key of Object.values(LEGACY_KEYS)) {
      try {
        localStorage.removeItem(key);
      } catch {
        // 삭제 실패는 무시 — 다음 부팅 때 gridlock.save가 우선하므로 값 유실은 없다.
      }
    }
  }
  return data;
}

// ── v2 객체 read/write ────────────────────────────────────────────
/** 통합 저장 객체를 읽는다. 없으면 구버전 마이그레이션, 손상/예외면 기본값. */
function readSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw !== null) return normalize(JSON.parse(raw));
    return migrateLegacy();
  } catch {
    return defaults();
  }
}

/** 통합 저장 객체를 쓴다. 예외(프라이빗 모드 등)는 조용히 무시. */
function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // 저장 실패는 게임 진행에 영향 없음 — 무시.
  }
}

/** 일부 필드만 갱신(read-modify-write). 나머지 필드는 보존된다. */
function patchSave(partial: Partial<SaveData>): void {
  const next: SaveData = { ...readSave(), ...partial, v: SCHEMA_VERSION };
  writeSave(next);
}

// ── 디펜스 최고기록 ───────────────────────────────────────────────
/** 저장된 최고기록을 읽는다. 없거나 손상/예외면 null. */
export function loadBest(): BestRecord | null {
  return readSave().best;
}

/** 최고기록 저장. 예외(프라이빗 모드 등)는 조용히 무시. */
export function saveBest(record: BestRecord): void {
  patchSave({ best: { wave: record.wave, lives: record.lives, cleared: record.cleared } });
}

/** candidate가 prev보다 더 좋은 기록이면 true. prev가 없으면 항상 true. */
export function isBetter(candidate: BestRecord, prev: BestRecord | null): boolean {
  if (!prev) return true;
  if (candidate.cleared !== prev.cleared) return candidate.cleared;
  if (candidate.wave !== prev.wave) return candidate.wave > prev.wave;
  return candidate.lives > prev.lives;
}

/** 기록 갱신 시도 — 더 좋으면 저장 후 그 기록을, 아니면 기존 최고기록을 반환. */
export function updateBest(candidate: BestRecord): BestRecord {
  const prev = loadBest();
  if (isBetter(candidate, prev)) {
    saveBest(candidate);
    return candidate;
  }
  return prev as BestRecord; // isBetter가 false면 prev는 non-null.
}

// ── 엔드리스 최고 웨이브(D4.3) ────────────────────────────────────
/** 저장된 엔드리스 최고 웨이브를 읽는다. 없거나 손상/예외면 0. */
export function loadEndlessBest(): number {
  return readSave().endlessBest;
}

/** 도달 웨이브가 기존 기록보다 크면 저장하고, 최종 최고 웨이브를 반환. */
export function updateEndlessBest(wave: number): number {
  const prev = loadEndlessBest();
  if (wave <= prev) return prev;
  const next = Math.floor(wave);
  patchSave({ endlessBest: next });
  return next;
}

// ── 사운드 옵션(D2.6) ─────────────────────────────────────────────
/** 저장된 사운드 옵션을 읽는다. 없거나 손상/예외면 null. */
export function loadAudio(): AudioSettings | null {
  return readSave().audio;
}

/** 사운드 옵션 저장. 예외(프라이빗 모드 등)는 조용히 무시. */
export function saveAudio(settings: AudioSettings): void {
  patchSave({ audio: { volume: Math.min(1, Math.max(0, settings.volume)), muted: settings.muted } });
}

// ── 정복 AI 난이도(D3.3) ──────────────────────────────────────────
/** 저장된 정복 난이도를 읽는다. 없거나 손상/예외면 'normal'. */
export function loadDifficulty(): DifficultyId {
  return readSave().difficulty;
}

/** 정복 난이도 저장. 예외(프라이빗 모드 등)는 조용히 무시. */
export function saveDifficulty(id: DifficultyId): void {
  patchSave({ difficulty: id });
}

// ── 디펜스 맵 선택(D4.4) ──────────────────────────────────────────
/** 저장된 디펜스 맵을 읽는다. 없거나 손상/예외면 'classic'. */
export function loadMapId(): MapId {
  return readSave().map;
}

/** 디펜스 맵 저장. 예외(프라이빗 모드 등)는 조용히 무시. */
export function saveMapId(id: MapId): void {
  patchSave({ map: id });
}

// ── 정복 맵 선택(D7.4) ────────────────────────────────────────────
/** 저장된 정복 맵을 읽는다. 없거나 손상/예외면 'standard'. */
export function loadConquestMap(): ConquestMapId {
  return readSave().conquestMap;
}

/** 정복 맵 저장. 예외(프라이빗 모드 등)는 조용히 무시. */
export function saveConquestMap(id: ConquestMapId): void {
  patchSave({ conquestMap: id });
}

// ── 오늘의 맵 최고기록(D7.5) ──────────────────────────────────────
/** 저장된 오늘의 맵 기록을 읽는다. 없거나 손상/예외면 null(시드 비교는 호출부에서). */
export function loadDaily(): DailyRecord | null {
  return readSave().daily;
}

/**
 * 오늘의 맵 기록 갱신 — 저장된 기록이 같은 시드일 때만 비교(더 좋으면 갱신), 다른 시드(새 날)면
 * 새 기록으로 덮어쓴다. "더 좋음"은 디펜스 최고기록과 동일 기준(클리어 우선 → 높은 웨이브).
 */
export function updateDaily(seed: number, wave: number, cleared: boolean): DailyRecord {
  const next: DailyRecord = { seed, wave, cleared };
  const prev = loadDaily();
  if (prev && prev.seed === seed) {
    const better = prev.cleared !== cleared ? cleared : wave > prev.wave;
    if (!better) return prev;
  }
  patchSave({ daily: next });
  return next;
}

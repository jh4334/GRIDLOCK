// localStorage 최고기록 저장/불러오기 — 백엔드 없음(DESIGN.md).
// 사파리 프라이빗 모드 등 localStorage 접근 자체가 예외를 던지는 환경에서도
// 게임이 죽지 않도록 모든 접근을 try/catch로 감싼다(실패 시 조용히 무시).
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

const KEY = 'gridlock.best';

/** 저장된 최고기록을 읽는다. 없거나 손상/예외면 null. */
export function loadBest(): BestRecord | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as BestRecord).wave === 'number' &&
      typeof (parsed as BestRecord).lives === 'number' &&
      typeof (parsed as BestRecord).cleared === 'boolean'
    ) {
      const r = parsed as BestRecord;
      return { wave: r.wave, lives: r.lives, cleared: r.cleared };
    }
    return null;
  } catch {
    return null;
  }
}

/** 최고기록 저장. 예외(프라이빗 모드 등)는 조용히 무시. */
export function saveBest(record: BestRecord): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    // 저장 실패는 게임 진행에 영향 없음 — 무시.
  }
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

// ── 사운드 옵션(D2.6) ─────────────────────────────────────────────
// 음량(0~1)·음소거를 gridlock.audio에 저장·복원한다(loadBest와 동일한 try/catch 패턴).

export interface AudioSettings {
  volume: number; // 0~1 마스터 음량 배율.
  muted: boolean;
}

const AUDIO_KEY = 'gridlock.audio';

/** 저장된 사운드 옵션을 읽는다. 없거나 손상/예외면 null. */
export function loadAudio(): AudioSettings | null {
  try {
    const raw = localStorage.getItem(AUDIO_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as AudioSettings).volume === 'number' &&
      typeof (parsed as AudioSettings).muted === 'boolean'
    ) {
      const s = parsed as AudioSettings;
      return { volume: Math.min(1, Math.max(0, s.volume)), muted: s.muted };
    }
    return null;
  } catch {
    return null;
  }
}

/** 사운드 옵션 저장. 예외(프라이빗 모드 등)는 조용히 무시. */
export function saveAudio(settings: AudioSettings): void {
  try {
    localStorage.setItem(AUDIO_KEY, JSON.stringify(settings));
  } catch {
    // 저장 실패는 게임 진행에 영향 없음 — 무시.
  }
}

// ── 정복 AI 난이도(D3.3) ──────────────────────────────────────────
// 타이틀에서 고른 정복 난이도(쉬움/보통/어려움)를 gridlock.difficulty에 저장·복원한다.
// 값이 없거나 손상/예외면 기본값 'normal'(보통) — 현행 밸런스.

export type DifficultyId = 'easy' | 'normal' | 'hard';

const DIFFICULTY_KEY = 'gridlock.difficulty';

/** 저장된 정복 난이도를 읽는다. 없거나 손상/예외면 'normal'. */
export function loadDifficulty(): DifficultyId {
  try {
    const raw = localStorage.getItem(DIFFICULTY_KEY);
    if (raw === 'easy' || raw === 'normal' || raw === 'hard') return raw;
  } catch {
    // 접근 예외는 무시하고 기본값으로.
  }
  return 'normal';
}

/** 정복 난이도 저장. 예외(프라이빗 모드 등)는 조용히 무시. */
export function saveDifficulty(id: DifficultyId): void {
  try {
    localStorage.setItem(DIFFICULTY_KEY, id);
  } catch {
    // 저장 실패는 게임 진행에 영향 없음 — 무시.
  }
}

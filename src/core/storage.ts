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

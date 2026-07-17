// 스프라이트 캐시·팩토리 — 벡터 아트를 로드 시(첫 요청 시) 오프스크린 캔버스에 1회
// 프리렌더하고, 매 프레임은 drawImage만 한다(성능: 벡터 재그리기 금지, 60fps 유지).
//
// ── 이미지 교체 가능 구조 ────────────────────────────────────────
// getSprite(key)는 CanvasImageSource를 돌려준다. 추후 실제 PNG 에셋을 쓰려면
//   const img = new Image(); img.src = '...'; img.onload = () => setSprite(key, img);
// 처럼 같은 key로 setSprite만 호출하면 된다 — 그리는 쪽(엔티티) 코드는 그대로다.
// defineSprite로 등록한 벡터 빌더는 setSprite가 없을 때의 기본값(폴백)일 뿐이다.

export type SpriteBuilder = () => CanvasImageSource;

const cache = new Map<string, CanvasImageSource>();
const builders = new Map<string, SpriteBuilder>();

/** 벡터 폴백 빌더 등록 — 실제 이미지가 setSprite로 들어오기 전까지 쓰인다. 지연 실행(첫 요청 시 1회). */
export function defineSprite(key: string, build: SpriteBuilder): void {
  builders.set(key, build);
}

/** 실제 이미지(PNG 등)로 key를 덮어쓴다 — 벡터 폴백을 교체한다. 코드 변경 없이 아트 스왑. */
export function setSprite(key: string, image: CanvasImageSource): void {
  cache.set(key, image);
}

/** key의 스프라이트(프리렌더된 CanvasImageSource)를 조회. 첫 요청 시 벡터 빌더로 1회 생성해 캐시. */
export function getSprite(key: string): CanvasImageSource {
  const cached = cache.get(key);
  if (cached) return cached;
  const build = builders.get(key);
  if (!build) throw new Error(`스프라이트 미등록: ${key}`);
  const made = build();
  cache.set(key, made);
  return made;
}

/** 등록 여부(선택적 스프라이트 분기용). */
export function hasSprite(key: string): boolean {
  return cache.has(key) || builders.has(key);
}

/** 오프스크린 캔버스 + 2D 컨텍스트 생성 헬퍼(프리렌더용). */
export function createSpriteCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w));
  canvas.height = Math.max(1, Math.ceil(h));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('오프스크린 Canvas 2D context를 얻을 수 없습니다.');
  return { canvas, ctx };
}

/**
 * 프리렌더 스프라이트를 (x, y) 중심에 angle(rad) 회전해서 그린다. 매 프레임 호출용 —
 * 벡터 재계산 없이 drawImage 변환만 한다. scale로 크기 보정(기본 1).
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  key: string,
  x: number,
  y: number,
  angle = 0,
  scale = 1,
): void {
  const s = getSprite(key);
  const w = (s as HTMLCanvasElement).width * scale;
  const h = (s as HTMLCanvasElement).height * scale;
  if (angle === 0) {
    ctx.drawImage(s, x - w / 2, y - h / 2, w, h);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(s, -w / 2, -h / 2, w, h);
  ctx.restore();
}

// ── 애니메이션 클록 ──────────────────────────────────────────────
// 포털 회전·리액터 펄스 등 시간 기반 연출용 공용 시계. update 단계에서 tickClock(dt)로
// 진행시키고(App.update), render에서 animTime()으로 읽기만 한다(update/render 분리 준수).
let clock = 0;

/** 애니메이션 시계 진행(초). App.update가 프레임당 1회 호출. */
export function tickClock(dt: number): void {
  clock += dt;
}

/** 현재 애니메이션 시계값(초). render에서 읽기 전용으로 사용. */
export function animTime(): number {
  return clock;
}

// ── 결정적 의사난수(좌표 해시) ──────────────────────────────────
// Math.random 대신 좌표로 재현 가능한 값을 만든다(회로 패턴 변주 — 매 로드 동일).
/** 정수 좌표(cx, cy)를 0~1 사이 결정적 난수로. */
export function hash01(cx: number, cy: number, salt = 0): number {
  let h = (cx * 374761393 + cy * 668265263 + salt * 2246822519) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

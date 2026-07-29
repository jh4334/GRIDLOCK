// 렌더 뷰포트(D9.2) — 논리 좌표계와 물리 백스토어를 분리한다.
//
// 배경: 캔버스 백스토어가 960×672 고정이라 DPR 2 이상(레티나 데스크톱·모바일)에서는
// 1 논리 px가 2~3 물리 px로 늘어나 텍스트·선이 흐릿하다. 백스토어를 DPR 배로 키우고
// 렌더 루트에서 한 번만 ctx.scale을 걸면, 그리는 쪽 좌표는 전부 960×672 그대로 두고
// 결과만 물리 해상도로 올라간다.
//
// 규약:
//   - 게임 로직·렌더 코드는 오직 논리 좌표(VIEW_W×VIEW_H)만 쓴다. canvas.width/height는
//     물리 픽셀 수라 화면 크기로 쓰면 안 되고(DPR 배), 이 모듈의 VIEW_W/VIEW_H를 쓴다.
//   - 배율 적용은 렌더 계층에서만 한다(update는 관여 없음 — CLAUDE.md update/render 분리).
//   - DPR은 부팅 시 1회만 읽는다(리사이즈·모니터 이동 재설정은 범위 밖).
//   - DPR 1에서는 scale=1이라 백스토어·변환 모두 종전과 동일하다(무변화 보장).

import { COLS, ROWS, TILE } from '../game/grid';

// 논리 화면 크기 = 그리드 전체 크기(20×14×48 = 960×672). 구조 상수라 코드에 둔다(grid.ts와 동일 근거).
export const VIEW_W = COLS * TILE;
export const VIEW_H = ROWS * TILE;

// 백스토어 상한 배율. 3배(최신 모바일)까지 키우면 픽셀 수가 9배가 되어 메모리·필레이트가
// 손해라 2배에서 끊는다 — 2배만으로도 텍스트 가독성 개선분은 대부분 얻는다.
const MAX_SCALE = 2;

let scale = 1;

/**
 * 부팅 시 1회 — 백스토어를 논리 크기×DPR로 확장한다.
 * CSS 표시 크기는 스타일시트(#game-canvas: width 960px + max-width 100%)가 담당하므로
 * 여기서는 백스토어만 만진다.
 */
export function setupViewport(canvas: HTMLCanvasElement): number {
  const dpr = window.devicePixelRatio || 1;
  scale = Math.min(MAX_SCALE, Math.max(1, dpr));
  canvas.width = Math.round(VIEW_W * scale);
  canvas.height = Math.round(VIEW_H * scale);
  return scale;
}

/**
 * 렌더 루트에서 매 프레임 1회 — 변환을 논리 좌표계로 리셋한다.
 * (프레임 도중 save/translate가 어긋나도 다음 프레임이 여기서 복구된다.)
 */
export function applyViewportTransform(ctx: CanvasRenderingContext2D): void {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  // 픽셀아트 유지 — 배율이 걸리면 프리렌더 스프라이트·정적 레이어가 drawImage로 s배 확대되는데,
  // 기본값(보간 켜짐)이면 경계가 뭉개져 아트 톤이 바뀐다. 최근접으로 두면 확대 결과가
  // 변경 전(CSS image-rendering: pixelated로 브라우저가 하던 최근접 확대)과 같은 모양이 되고,
  // 벡터로 그리는 텍스트·도형만 물리 해상도의 이득을 본다. 배율 1에서는 건드리지 않는다(무변화).
  if (scale > 1) ctx.imageSmoothingEnabled = false;
}

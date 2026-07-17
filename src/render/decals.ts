// 적 사망 잔해 데칼 — 적이 죽은 자리에 어두운 궤적 자국을 남긴다. 최대 MAX개 링버퍼(가득 차면
// 가장 오래된 것을 덮어쓴다)로 담고, FADE_TIME에 걸쳐 서서히 사라진다. 바닥/도로 위·엔티티 아래
// 레이어(그리기 순서는 gameRender가 조율).
//
// 스탬프는 어둡게 틴트한 스프라이트를 1회 프리렌더하고 매 프레임 drawImage만 한다(60fps 유지).
// 에셋 로드 전엔 아래 벡터 폴백(어두운 반투명 원)이 쓰이고, assetLoader가 tracksSmall을 어둡게
// 구워 같은 key로 setSprite하면 궤적 스탬프로 교체된다.
//
// update(dt)가 수명을 줄이고 render(ctx)는 읽기 전용(CLAUDE.md update/render 분리). 잔해는 월드
// 시간 기반이라 update는 배속 서브스텝(updateWorld) 안에서 호출된다 → 배속에도 페이드가 일관된다.

import { createSpriteCanvas, defineSprite, getSprite, hash01 } from './sprites';

const MAX = 30; // 링버퍼 최대 데칼 수(시각 상수).
const FADE_TIME = 20; // 완전히 사라지기까지의 시간(초).
const MAX_ALPHA = 0.7; // 갓 생긴 데칼의 최대 불투명도.
const SIZE = 28; // 스탬프 지름(px). assetLoader의 bakeDecal 크기와 맞춘다.

/** 잔해 스탬프 스프라이트 key(assetLoader가 어둡게 구운 tracksSmall로 교체). */
export const DECAL_KEY = 'fx/decal/tracks';
/** assetLoader가 폴백과 동일한 크기로 굽도록 공유하는 스탬프 한 변(px). */
export const DECAL_SIZE = SIZE;

// 벡터 폴백(에셋 로드 전) — 어두운 반투명 원.
defineSprite(DECAL_KEY, () => {
  const { canvas, ctx } = createSpriteCanvas(SIZE, SIZE);
  const c = SIZE / 2;
  const g = ctx.createRadialGradient(c, c, 1, c, c, c);
  g.addColorStop(0, 'rgba(8, 10, 14, 0.6)');
  g.addColorStop(1, 'rgba(8, 10, 14, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
});

interface Decal {
  x: number;
  y: number;
  angle: number; // 스탬프 회전(변주용) — 결정적 해시로 정한다.
  life: number; // 남은 수명(초). FADE_TIME → 0.
}

export class DecalField {
  private decals: Decal[] = [];
  private cursor = 0; // 링버퍼 쓰기 위치(가득 차면 여기부터 덮어쓴다).
  private seed = 0; // 각도 변주용 결정적 카운터.

  /** 적 사망 지점에 잔해 스탬프를 남긴다(가득 차면 가장 오래된 것을 교체). */
  spawn(x: number, y: number): void {
    const angle = hash01(Math.round(x), Math.round(y), this.seed++) * Math.PI * 2;
    const d: Decal = { x, y, angle, life: FADE_TIME };
    if (this.decals.length < MAX) {
      this.decals.push(d);
    } else {
      this.decals[this.cursor] = d;
      this.cursor = (this.cursor + 1) % MAX;
    }
  }

  // 수명 감소만(제거는 링버퍼 덮어쓰기가 담당). 만료된 슬롯은 render에서 건너뛴다.
  update(dt: number): void {
    for (const d of this.decals) {
      if (d.life > 0) d.life -= dt;
    }
  }

  // 어두운 궤적 스탬프를 수명 비율만큼 페이드시켜 그린다. 읽기 전용.
  render(ctx: CanvasRenderingContext2D): void {
    const img = getSprite(DECAL_KEY);
    const h = SIZE / 2;
    ctx.save();
    for (const d of this.decals) {
      if (d.life <= 0) continue;
      ctx.globalAlpha = Math.min(1, d.life / FADE_TIME) * MAX_ALPHA;
      ctx.translate(d.x, d.y);
      ctx.rotate(d.angle);
      ctx.drawImage(img, -h, -h, SIZE, SIZE);
      ctx.rotate(-d.angle);
      ctx.translate(-d.x, -d.y);
    }
    ctx.restore();
  }

  /** 재시작 — 잔해를 모두 비운다. */
  reset(): void {
    this.decals.length = 0;
    this.cursor = 0;
    this.seed = 0;
  }
}

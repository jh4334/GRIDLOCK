// 이펙트 시스템(M6 주스 패스) — 수명 기반 이펙트 풀. 배열에 담고 매 프레임 끝 filter로 정리한다.
//   1) 데미지 팝업: 명중 지점에서 데미지 숫자가 살짝 위로 떠오르며 페이드아웃
//   2) 처치 파티클: 적 사망 지점에서 적 색상 조각이 사방으로 튀며 감속·페이드
//
// update(dt)에서만 상태를 변경하고 render(ctx)는 읽기 전용(CLAUDE.md 규칙).
// 배속 시 이펙트도 같은 배율로 진행되도록 update는 updateWorld 서브스텝 안에서 호출된다.
// 지속시간·파티클 수·크기는 밸런스가 아니라 시각 상수이므로 코드 상수로 둔다.

// 데미지 팝업(시각 상수).
const DAMAGE_LIFE = 0.6; // 표시 지속(초).
const DAMAGE_RISE = 26; // 수명 동안 떠오르는 총 픽셀 거리.
const DAMAGE_FONT = 13; // px.
const DAMAGE_COLOR = '#ffd98a'; // 앰버 계열(NEON GRID 팔레트).
const DAMAGE_JITTER = 8; // 겹침 방지용 가로 흔들림 폭(px).

// 처치 파티클(시각 상수).
const KILL_LIFE = 0.5; // 조각 수명(초).
const KILL_COUNT_MIN = 6;
const KILL_COUNT_MAX = 10;
const KILL_SPEED_MIN = 45; // 초기 속도(px/s).
const KILL_SPEED_MAX = 130;
const KILL_DRAG = 3.2; // 감속 계수(클수록 빨리 멈춤).
const KILL_GRAVITY = 90; // 약한 중력(px/s²) — 조각이 살짝 떨어지는 맛.
const KILL_SIZE = 3; // 조각 한 변(px).

interface DamagePopup {
  x: number;
  y: number;
  amount: number;
  timer: number; // 남은 시간(초). DAMAGE_LIFE에서 0으로.
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  timer: number; // 남은 시간(초).
}

export class EffectsSystem {
  private popups: DamagePopup[] = [];
  private particles: Particle[] = [];

  /** 데미지 숫자 팝업 생성(명중 지점). 캐논 스플래시는 적마다 개별 호출된다. */
  spawnDamage(x: number, y: number, amount: number): void {
    this.popups.push({
      x: x + (Math.random() * DAMAGE_JITTER - DAMAGE_JITTER / 2),
      y: y - 6,
      amount: Math.max(0, Math.round(amount)),
      timer: DAMAGE_LIFE,
    });
  }

  /** 처치 파티클 폭발(적 사망 지점, 적 색상 조각 6~10개가 사방으로). */
  spawnKill(x: number, y: number, color: string): void {
    const n = KILL_COUNT_MIN + Math.floor(Math.random() * (KILL_COUNT_MAX - KILL_COUNT_MIN + 1));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = KILL_SPEED_MIN + Math.random() * (KILL_SPEED_MAX - KILL_SPEED_MIN);
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, color, timer: KILL_LIFE });
    }
  }

  // 수명 감소·이동(감속·중력). 프레임 끝에서 죽은 이펙트를 일괄 제거.
  update(dt: number): void {
    const riseRate = DAMAGE_RISE / DAMAGE_LIFE;
    for (const p of this.popups) {
      p.y -= riseRate * dt;
      p.timer -= dt;
    }
    if (this.popups.some((p) => p.timer <= 0)) this.popups = this.popups.filter((p) => p.timer > 0);

    const drag = Math.max(0, 1 - KILL_DRAG * dt); // 지수 감속 근사.
    for (const q of this.particles) {
      q.vx *= drag;
      q.vy = q.vy * drag + KILL_GRAVITY * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.timer -= dt;
    }
    if (this.particles.some((q) => q.timer <= 0)) this.particles = this.particles.filter((q) => q.timer > 0);
  }

  // 파티클(적 위) → 데미지 숫자(맨 위) 순으로 그린다. 읽기 전용.
  render(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    // 처치 파티클 — 가산 발광(lighter)으로 네온 파편 느낌.
    ctx.globalCompositeOperation = 'lighter';
    for (const q of this.particles) {
      ctx.globalAlpha = Math.max(0, q.timer / KILL_LIFE);
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - KILL_SIZE / 2, q.y - KILL_SIZE / 2, KILL_SIZE, KILL_SIZE);
    }
    ctx.globalCompositeOperation = 'source-over';

    ctx.font = `bold ${DAMAGE_FONT}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of this.popups) {
      const label = String(p.amount);
      ctx.globalAlpha = Math.max(0, p.timer / DAMAGE_LIFE);
      ctx.fillStyle = '#000'; // 가독성용 그림자.
      ctx.fillText(label, p.x + 1, p.y + 1);
      ctx.fillStyle = DAMAGE_COLOR;
      ctx.fillText(label, p.x, p.y);
    }

    ctx.restore();
  }

  /** 재시작 — 진행 중인 팝업·파티클을 모두 비운다. */
  reset(): void {
    this.popups.length = 0;
    this.particles.length = 0;
  }
}

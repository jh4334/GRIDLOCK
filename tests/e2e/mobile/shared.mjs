// 모바일 스위트 공용 헬퍼(D9.5) — mobile.mjs가 324줄로 300줄 제한을 넘어 스테이지별로 나누면서
// 세 스테이지가 함께 쓰는 것들만 여기 모았다: 실행 환경 상수, 밸런스 데이터 로드, 탭/대기 유틸,
// 캔버스 논리→화면 좌표 환산, 그리고 레이아웃·터치 타깃 감사(assertScreen).
//
// 입력은 전부 실제 터치 이벤트(touchscreen.tap / locator.tap)만 쓴다 — 마우스 이벤트를 섞으면
// 터치 경로가 아니라 데스크톱 경로를 검증하게 되어 D8/D9의 회귀를 못 잡는다.
// 판정 근거는 캔버스 밖에서 관찰 가능한 것뿐이다: DOM 사각형(레이아웃·터치 타깃),
// window.__gridlockBalance(골드·웨이브), window.__gridlockConquest(선택 수·아군 좌표),
// window.__gridlockHudMetrics(캔버스에 그린 시드 줄의 실측 폰트·잉크 높이, D9.5).

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GAME_W, TILE } from '../titleCoords.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const OUT = join(HERE, '..', 'out');
export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173/';
export const PW_CHROMIUM = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';

export const VIEWPORT = { width: 390, height: 844 }; // iPhone 12/13/14 논리 해상도.
export const MIN_TARGET = 44; // D8.4 최소 터치 타깃(px).
export const MIN_INK = 12; // D9.3/D9.5 최소 가독 잉크 높이(화면상 px).

// 밸런스 수치는 코드에 박지 않고 데이터에서 읽는다(CLAUDE.md).
const towers = JSON.parse(await readFile(join(HERE, '../../../src/data/towers.json'), 'utf8'));
const conquest = JSON.parse(await readFile(join(HERE, '../../../src/data/conquest.json'), 'utf8'));
export const ARROW_COST = towers.towers.arrow.cost;
export const DEPOT_COST = conquest.buildings.depot.cost;
export const BARRACKS_COST = conquest.buildings.barracks.cost;
export const WORKER_COST = conquest.hq.workerCost;

// 실패 지점을 stderr 한 줄로 남기기 위한 현재 단계. 스테이지 모듈이 setStage로 갱신한다.
const state = { stage: 'init' };
export const setStage = (s) => {
  state.stage = s;
};
export const currentStage = () => state.stage;

export const log = (m) => process.stdout.write(`[mobile] ${m}\n`);
export function check(cond, msg) {
  if (!cond) throw new Error(msg);
}

// 모바일에선 캔버스가 CSS로 축소되므로 논리 좌표(960×672)를 boundingBox 비율로 환산한다.
export async function canvasMapper(page) {
  const box = await page.locator('#game-canvas').boundingBox();
  const s = box.width / GAME_W;
  const pt = (x, y) => [box.x + x * s, box.y + y * s];
  const cell = (cx, cy) => pt(cx * TILE + TILE / 2, cy * TILE + TILE / 2);
  return { box, s, pt, cell };
}

export const vis = (page, sel) => page.locator(sel).locator('visible=true').first();
export const balance = (page) => page.evaluate(() => window.__gridlockBalance ?? null);
export const conq = (page) => page.evaluate(() => window.__gridlockConquest ?? null);
export const savedMap = (page) =>
  page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('gridlock.save') ?? '{}');
    } catch {
      return {};
    }
  });
export const shot = (page, name) => page.screenshot({ path: join(OUT, `mobile-${name}.png`) });

export async function waitUntil(page, predicate, timeout = 30000, interval = 250) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await predicate()) return true;
    if (Date.now() >= deadline) return false;
    await page.waitForTimeout(interval);
  }
}

export async function tap(page, xy, wait = 200) {
  await page.touchscreen.tap(...xy);
  await page.waitForTimeout(wait);
}

/** 캔버스에 그린 시드 줄의 화면상 크기(px) — 논리 실측값을 캔버스 축소비로 환산(D9.5). */
export async function seedTextScreenSize(page, text) {
  const m = await page.evaluate((t) => window.__gridlockHudMetrics?.(t) ?? null, text);
  check(m !== null, '시드 줄 실측 훅(window.__gridlockHudMetrics)이 노출되지 않음');
  const perLogical = m.cssW / GAME_W; // 논리 px → CSS(화면) px.
  return { ...m, screenFontPx: m.fontPx * perLogical, screenInkPx: m.inkPx * perLogical };
}

// ── 레이아웃 + 터치 타깃 감사 ─────────────────────────────────────
// 보이는 button 전부의 사각형을 재서 (1) 44px 미달, (2) 버튼끼리 겹침,
// (3) 뷰포트 가로 오버플로를 한 번에 수집한다.
const auditScreen = (page, label) =>
  page.evaluate(
    ({ label, MIN }) => {
      const shown = (el) => {
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const name = (el) => {
        const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
        return `${el.tagName.toLowerCase()}${cls}[${(el.textContent || '').trim().slice(0, 12)}]`;
      };
      const buttons = [...document.querySelectorAll('button')].filter(shown).map((el) => {
        const r = el.getBoundingClientRect();
        return { name: name(el), x: r.x, y: r.y, w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
      });
      const overlaps = [];
      for (let i = 0; i < buttons.length; i++)
        for (let j = i + 1; j < buttons.length; j++) {
          const a = buttons[i], b = buttons[j];
          if (a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5)
            overlaps.push(`${a.name} × ${b.name}`);
        }
      const clientW = document.documentElement.clientWidth;
      return {
        label,
        count: buttons.length,
        small: buttons.filter((b) => b.w < MIN || b.h < MIN).map((b) => `${b.name} ${b.w}×${b.h}`),
        overlaps,
        scrollW: document.documentElement.scrollWidth,
        clientW,
        overflowing: [...document.querySelectorAll('body *')]
          .filter((el) => shown(el) && el.getBoundingClientRect().right > clientW + 0.5)
          .map(name),
      };
    },
    { label, MIN: MIN_TARGET },
  );

export async function assertScreen(page, label, { minButtons = 1 } = {}) {
  setStage(`audit-${label}`);
  const a = await auditScreen(page, label);
  check(a.clientW === VIEWPORT.width, `${label}: 뷰포트 폭이 ${a.clientW}px(기대 ${VIEWPORT.width})`);
  check(a.scrollW === a.clientW, `${label}: 가로 스크롤 발생(scrollWidth ${a.scrollW} > ${a.clientW})`);
  check(a.overflowing.length === 0, `${label}: 뷰포트를 넘는 요소 ${a.overflowing.length}건 — ${a.overflowing.join(', ')}`);
  check(a.count >= minButtons, `${label}: 보이는 버튼이 ${a.count}개(기대 ${minButtons}개 이상) — 화면 전환 실패 의심`);
  check(a.small.length === 0, `${label}: ${MIN_TARGET}px 미달 터치 타깃 ${a.small.length}건 — ${a.small.join(', ')}`);
  check(a.overlaps.length === 0, `${label}: 버튼 겹침 ${a.overlaps.length}건 — ${a.overlaps.join(', ')}`);
  log(`${label}: 버튼 ${a.count}개 전부 ${MIN_TARGET}px 이상·겹침 없음, scrollWidth ${a.scrollW}=clientWidth, 오버플로 0`);
  return a;
}

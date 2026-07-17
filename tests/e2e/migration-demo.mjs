// GRIDLOCK 저장 스키마 v2 마이그레이션 데모 (D5.2) — 구버전 개별 키(gridlock.best/endless/
// audio/difficulty/map)가 부팅 1회에 단일 gridlock.save(v2)로 통합되고, 구키는 삭제되며,
// 값이 유실 없이 승계됨을 localStorage + DOM 이중으로 검증한다.
//
// 흐름:
//   1) 페이지를 한번 열어 오리진을 확보한 뒤, gridlock.save를 지우고 구버전 키 5개를 심는다
//      (best=웨이브 20 클리어/라이프 5, endless=25, audio 음량 37%, difficulty=hard, map=canyon).
//   2) 리로드 → 앱 부팅이 첫 저장 접근에서 마이그레이션을 수행.
//   3) 판정: gridlock.save가 v2 객체로 존재하고 다섯 값을 모두 승계, 구키 5개는 전부 삭제됨.
//      DOM: 음량 슬라이더가 승계값 37을 반영(loadAudio 경유 확인).
//   4) 회귀: 2차 리로드해도 값이 그대로 유지(멱등)됨을 확인.
//
// 실패 시 어느 단계에서 깨졌는지 stderr 한 줄 + 비-0 종료(runner가 감지).

import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173/';
const PW_CHROMIUM = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';

// 심을 구버전 값(v1 포맷 그대로: best/audio는 JSON, endless/difficulty/map은 원시 문자열).
const LEGACY = {
  best: JSON.stringify({ wave: 20, lives: 5, cleared: true }),
  endless: '25',
  audio: JSON.stringify({ volume: 0.37, muted: false }),
  difficulty: 'hard',
  map: 'canyon',
};

let stage = 'init';

function check(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: PW_CHROMIUM });
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  try {
    await runMigration(page);
    stage = 'page-errors';
    check(errors.length === 0, `페이지 런타임 오류 ${errors.length}건: ${errors.join(' | ')}`);
  } finally {
    await browser.close();
  }
}

async function runMigration(page) {
  // ── 1) 오리진 확보 후 구버전 상태 심기 ──
  stage = 'seed-legacy';
  await page.goto(BASE_URL);
  await page.waitForTimeout(300);
  await page.evaluate((legacy) => {
    localStorage.removeItem('gridlock.save');
    localStorage.setItem('gridlock.best', legacy.best);
    localStorage.setItem('gridlock.endless', legacy.endless);
    localStorage.setItem('gridlock.audio', legacy.audio);
    localStorage.setItem('gridlock.difficulty', legacy.difficulty);
    localStorage.setItem('gridlock.map', legacy.map);
  }, LEGACY);

  // ── 2) 리로드 → 부팅 시 1회 마이그레이션 ──
  stage = 'reload-migrate';
  await page.reload();
  await page.waitForTimeout(1100); // 에셋 로드 + 부팅 저장 접근 대기.

  // ── 3) localStorage 판정: v2 통합 + 값 승계 + 구키 삭제 ──
  stage = 'assert-storage';
  const store = await page.evaluate(() => ({
    save: localStorage.getItem('gridlock.save'),
    best: localStorage.getItem('gridlock.best'),
    endless: localStorage.getItem('gridlock.endless'),
    audio: localStorage.getItem('gridlock.audio'),
    difficulty: localStorage.getItem('gridlock.difficulty'),
    map: localStorage.getItem('gridlock.map'),
  }));

  check(store.save !== null, 'gridlock.save가 생성되지 않음(마이그레이션 미수행)');
  const save = JSON.parse(store.save);
  check(save.v === 2, `스키마 버전이 2가 아님(실제 ${save.v})`);
  check(save.best && save.best.wave === 20 && save.best.cleared === true && save.best.lives === 5,
    `best 승계 실패: ${JSON.stringify(save.best)}`);
  check(save.endlessBest === 25, `endlessBest 승계 실패(기대 25, 실제 ${save.endlessBest})`);
  check(save.audio && Math.abs(save.audio.volume - 0.37) < 1e-6 && save.audio.muted === false,
    `audio 승계 실패: ${JSON.stringify(save.audio)}`);
  check(save.difficulty === 'hard', `difficulty 승계 실패(기대 hard, 실제 ${save.difficulty})`);
  check(save.map === 'canyon', `map 승계 실패(기대 canyon, 실제 ${save.map})`);

  check(store.best === null, '구키 gridlock.best가 삭제되지 않음');
  check(store.endless === null, '구키 gridlock.endless가 삭제되지 않음');
  check(store.audio === null, '구키 gridlock.audio가 삭제되지 않음');
  check(store.difficulty === null, '구키 gridlock.difficulty가 삭제되지 않음');
  check(store.map === null, '구키 gridlock.map가 삭제되지 않음');

  // ── 3b) DOM 판정: 음량 슬라이더가 승계값 37을 반영(loadAudio 경유) ──
  stage = 'assert-dom';
  const sliderVal = await page.evaluate(() => {
    const el = document.querySelector('.volume-slider');
    return el ? el.value : null;
  });
  check(sliderVal === '37', `음량 슬라이더가 승계값 37을 반영하지 않음(실제 ${sliderVal})`);

  await page.screenshot({ path: join(OUT, 'migration-demo.png') });

  // ── 4) 멱등성 회귀: 다시 리로드해도 값 유지 ──
  stage = 'assert-idempotent';
  await page.reload();
  await page.waitForTimeout(700);
  const again = await page.evaluate(() => localStorage.getItem('gridlock.save'));
  const save2 = JSON.parse(again);
  check(save2.v === 2 && save2.best.wave === 20 && save2.endlessBest === 25 &&
    save2.difficulty === 'hard' && save2.map === 'canyon',
    `2차 리로드 후 값이 변형됨: ${again}`);
}

main().catch((err) => {
  process.stderr.write(`[migration-demo] FAIL @ ${stage}: ${err.message}\n`);
  process.exit(1);
});

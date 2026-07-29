// 정복 모드 터치 회귀(D8.5) + 컨트롤 바 명령 버튼(D9.4) 검증.
//   conquestStage    — 터치 진입 → 일꾼 생산 → 탭 이동 명령 → 건설 2탭 확정.
//   commandBarStage  — 부대 버튼 저장 배지·호출, 공격이동 토글 + 명령 1회.
// 관찰 훅은 이미 DOM에 있다: .attack-move-btn[data-active], .group-btn[data-count].

import {
  assertScreen,
  BARRACKS_COST,
  canvasMapper,
  check,
  conq,
  DEPOT_COST,
  log,
  setStage,
  shot,
  tap,
  vis,
  waitUntil,
  WORKER_COST,
} from './shared.mjs';
import { MOBILE_CONQUEST_TAB, TILE, mobileDiffCenter } from '../titleCoords.mjs';

const HQ_CELL = [2, 11]; // 'standard' 맵 플레이어 HQ(conquest.json maps.standard.hq.player).
const CRYSTAL_CELL = [4, 9]; // 플레이어 본진 크리스탈 첫 칸.
const BUILD_CELL = [4, 12]; // 건설 실험용 빈 칸(HQ 아래).
const ATTACK_CELL = [9, 11]; // 공격이동 목표 — 아군·자원·건물이 없는 빈 칸.

// compact 타이틀은 섹션 탭이다 — 비활성(정복) 탭 1탭 = 섹션 전환(진입 아님), 재탭 = 진입.
async function enterConquest(page, url) {
  await page.goto(url);
  await page.waitForTimeout(1200);
  const t0 = await canvasMapper(page);
  await tap(page, t0.pt(...MOBILE_CONQUEST_TAB), 250);
  check((await conq(page)) === null, '정복 탭 첫 탭에서 바로 진입됨 — 섹션 전환 규칙 위반');
  await tap(page, t0.pt(...mobileDiffCenter(0)), 150); // 쉬움 = 적 첫 공격이 늦어 검증 구간 간섭 최소.
  await tap(page, t0.pt(...MOBILE_CONQUEST_TAB), 800);
  const m = await canvasMapper(page);
  check((await conq(page)) !== null, '정복 진입 실패(텔레메트리 없음)');
  return m;
}

// HQ 탭 → 일꾼 1기 생산 → x3 배속. 두 스테이지가 같은 시작 지점을 쓴다.
async function produceWorker(page, cell) {
  await tap(page, cell(...HQ_CELL), 250);
  const workerBtn = () => vis(page, 'button:has-text("일꾼 생산")');
  check(await workerBtn().isVisible(), 'HQ 탭으로 HQ가 선택되지 않음(일꾼 생산 패널 없음)');
  await workerBtn().tap();
  await vis(page, '.speed-btn:has-text("x3")').tap();
  check(await waitUntil(page, async () => ((await conq(page))?.workers.length ?? 0) >= 1, 20000), '일꾼이 스폰되지 않음');
}

/** 터치 진입 → 일꾼 생산 → 탭 이동 명령 → 건설 2탭 확정(D8.5). */
export async function conquestStage(page, url) {
  setStage('conquest-enter');
  const { pt, cell } = await enterConquest(page, url);
  await assertScreen(page, 'conquest', { minButtons: 6 });
  await shot(page, '11-conquest');

  setStage('conquest-worker');
  await produceWorker(page, cell);
  await shot(page, '12-conquest-worker');
  log(`HQ 탭 선택 + 일꾼 생산 OK(${WORKER_COST}💎)`);

  // 일꾼 탭 = 단일 선택 → 빈 땅 탭 = 이동 명령(우클릭 대체). 좌표가 목표에 가까워지면 명령 성립.
  setStage('conquest-move');
  const w0 = (await conq(page)).workers[0];
  await tap(page, pt(w0.x, w0.y), 250);
  check((await conq(page)).selectedWorkers === 1, '일꾼 탭 단일 선택 실패');
  const dest = { x: 8 * TILE + TILE / 2, y: 12 * TILE + TILE / 2 };
  const gap = (w) => Math.hypot(w.x - dest.x, w.y - dest.y);
  const before = gap((await conq(page)).workers[0]);
  await tap(page, cell(8, 12), 2000);
  const after = gap((await conq(page)).workers[0]);
  check(after < before - 20, `빈 땅 탭 이동 명령 미동작(목표거리 ${before.toFixed(0)}→${after.toFixed(0)})`);
  check((await conq(page)).selectedWorkers === 1, '명령 후 선택이 유지되지 않음');
  await shot(page, '13-conquest-move');
  log(`탭 이동 명령 OK — 목표거리 ${before.toFixed(0)}→${after.toFixed(0)}, 선택 유지`);

  // 건설 2탭 확정(보급고) — 디펜스와 같은 규칙.
  setStage('conquest-build');
  await vis(page, '.tower-btn:has-text("보급고")').tap();
  await page.waitForTimeout(200);
  const cBefore = (await conq(page)).crystal;
  await tap(page, cell(...BUILD_CELL), 500);
  const cPending = (await conq(page)).crystal;
  check(cPending >= cBefore, `건설 첫 탭에서 이미 차감됨(${cBefore}→${cPending}) — 2탭 확정 규칙 위반`);
  await shot(page, '14-conquest-build-pending');
  await tap(page, cell(...BUILD_CELL), 500);
  const cAfter = (await conq(page)).crystal;
  check(cAfter <= cPending - DEPOT_COST, `건설 재탭 확정 실패(크리스탈 ${cPending}→${cAfter}, 기대 -${DEPOT_COST})`);
  await shot(page, '15-conquest-build-confirmed');
  log(`건설 2탭 확정 OK — 첫 탭 ${cBefore}→${cPending}(불변), 재탭 ${cPending}→${cAfter}(-${DEPOT_COST})`);
}

/**
 * D9.5 — 정복 컨트롤 바(D9.4)의 터치 경로. 부대 버튼은 "선택 중이면 저장, 없으면 호출"이고
 * 공격이동은 유닛 선택이 있을 때만 켜지므로, 배럭을 지어 전투 유닛을 확보한 뒤 검증한다.
 */
export async function commandBarStage(page, url) {
  setStage('cmd-enter');
  const { pt, cell } = await enterConquest(page, url);

  const attackBtn = () => vis(page, '.attack-move-btn');
  const groupBtn = (n) => vis(page, `.group-btn[data-group="${n}"]`);
  const attr = (loc, name) => loc.getAttribute(name);

  // 선택이 없는 초기 상태 — 공격이동은 비활성, 부대 배지는 전부 0.
  setStage('cmd-initial');
  check((await attr(attackBtn(), 'data-active')) === 'false', '초기 상태에서 공격이동이 이미 켜져 있음');
  check(await attackBtn().isDisabled(), '유닛 선택이 없는데 공격이동 버튼이 활성');
  for (const n of [1, 2, 3]) check((await attr(groupBtn(n), 'data-count')) === '0', `부대 ${n} 초기 배지가 0이 아님`);

  // 전투 유닛 확보 — 일꾼 생산 → 채집으로 배럭 비용 마련 → 배럭 2탭 건설.
  setStage('cmd-worker');
  await produceWorker(page, cell);
  const w0 = (await conq(page)).workers[0];
  await tap(page, pt(w0.x, w0.y), 200);
  await tap(page, cell(...CRYSTAL_CELL), 400); // 크리스탈 탭 = 채집 명령.
  check(
    await waitUntil(page, async () => (await conq(page)).crystal >= BARRACKS_COST, 90000),
    `채집으로 배럭 비용(${BARRACKS_COST}💎)을 모으지 못함`,
  );

  setStage('cmd-barracks');
  await vis(page, '.tower-btn:has-text("배럭")').tap();
  await page.waitForTimeout(200);
  await tap(page, cell(...BUILD_CELL), 400);
  await tap(page, cell(...BUILD_CELL), 400);
  check(await waitUntil(page, async () => (await conq(page)).units.length >= 1, 60000), '배럭 완성 후 전투 유닛이 배치되지 않음');
  await page.waitForTimeout(800); // 배치 직후 이동이 끝나도록 잠깐 안정화.
  log(`배럭 건설 완료 — 전투 유닛 ${(await conq(page)).units.length}기 확보`);

  // 부대 저장 — 유닛 탭 선택 후 부대 1 버튼 = 저장(배지 갱신).
  setStage('cmd-group-assign');
  const u0 = (await conq(page)).units[0];
  await tap(page, pt(u0.x, u0.y), 300);
  const picked = (await conq(page)).selectedUnits;
  check(picked === 1, `전투 유닛 탭 단일 선택 실패(선택 ${picked}기)`);
  await groupBtn(1).tap();
  check(await waitUntil(page, async () => (await attr(groupBtn(1), 'data-count')) === '1', 5000), '부대 버튼 탭이 선택을 저장하지 않음(배지 0)');
  await shot(page, '16-conquest-group-saved');

  // 선택 해제(HQ 탭 = 유닛 선택 해제) → 부대 1 버튼 = 호출.
  setStage('cmd-group-recall');
  await tap(page, cell(...HQ_CELL), 300);
  check((await conq(page)).selectedUnits === 0, 'HQ 탭으로 유닛 선택이 해제되지 않음');
  await groupBtn(1).tap();
  check(await waitUntil(page, async () => (await conq(page)).selectedUnits === 1, 5000), '부대 버튼 탭 호출로 저장된 유닛이 선택되지 않음');
  check((await attr(groupBtn(1), 'data-count')) === '1', '호출 후 부대 배지가 사라짐');
  log('부대 버튼 OK — 선택 중 탭 = 저장(배지 1), 선택 없을 때 탭 = 호출');

  // 공격이동 토글 — 켜기 → 끄기 → 다시 켜기.
  setStage('cmd-attack-toggle');
  check(await attackBtn().isEnabled(), '유닛 선택 중인데 공격이동 버튼이 비활성');
  await attackBtn().tap();
  check(await waitUntil(page, async () => (await attr(attackBtn(), 'data-active')) === 'true', 5000), '공격이동 버튼 탭으로 대기 상태가 켜지지 않음');
  await shot(page, '17-conquest-attack-armed');
  await attackBtn().tap();
  check(await waitUntil(page, async () => (await attr(attackBtn(), 'data-active')) === 'false', 5000), '공격이동 재탭으로 토글 해제되지 않음');
  await attackBtn().tap();
  check(await waitUntil(page, async () => (await attr(attackBtn(), 'data-active')) === 'true', 5000), '공격이동 재진입 실패');

  // 공격이동 명령 1회 — 목표 지점 탭으로 대기가 풀리고 유닛이 그쪽으로 움직인다.
  setStage('cmd-attack-command');
  const target = { x: ATTACK_CELL[0] * TILE + TILE / 2, y: ATTACK_CELL[1] * TILE + TILE / 2 };
  const gap = (u) => Math.hypot(u.x - target.x, u.y - target.y);
  const idx = (await conq(page)).units.findIndex((u) => Math.hypot(u.x - u0.x, u.y - u0.y) < TILE);
  const pick = (t) => t.units[idx >= 0 ? idx : 0];
  const before = gap(pick(await conq(page)));
  await tap(page, cell(...ATTACK_CELL), 2200);
  check((await attr(attackBtn(), 'data-active')) === 'false', '공격이동 명령 후에도 대기 상태가 남아 있음');
  const after = gap(pick(await conq(page)));
  check(after < before - 20, `공격이동 명령 미동작(목표거리 ${before.toFixed(0)}→${after.toFixed(0)})`);
  await shot(page, '18-conquest-attack-moved');
  log(`공격이동 OK — 토글 on/off/on 후 명령 1회로 목표거리 ${before.toFixed(0)}→${after.toFixed(0)}`);
}

// 맵 썸네일(D7.6) — 각 맵 지형을 120×84 오프스크린 캔버스에 6px/칸으로 미니 렌더한다.
// 타이틀은 매 프레임 렌더되므로 벡터 미니맵을 매번 그리면 낭비 → 여기서 id별로 1회 굽고 캐시한다
// (매 프레임 재렌더 금지). 오늘의 맵은 시드가 바뀌면(날짜 변경) 키가 달라져 자동 재생성된다.
//
// 색은 단순 사각형/점으로 충분(spec): rock 회색·water 청색·rough 갈색, 스폰 주황·기지 청.
// 정복 맵은 지형(rock)+크리스탈(민트)+양 본진(청/적)을 찍는다. 랜덤은 물음표+주사위 느낌.

import { COLS, ROWS, BASE, type Cell } from '../game/grid';
import { mapTerrain, mapSpawns, type MapTerrain } from '../game/maps';
import { generateMap } from '../game/mapGen';
import { createSpriteCanvas } from '../render/sprites';
import type { MapId, ConquestMapId } from '../core/storage';
import conquestData from '../data/conquest.json';

export const THUMB_W = 120;
export const THUMB_H = 84;
const CELL = 6; // COLS(20)×6=120, ROWS(14)×6=84 — 칸당 6px.

const C_DEF_BASE = '#2e4a24'; // 디펜스 초원 톤.
const C_CONQ_BASE = '#6f5c38'; // 정복 사막 톤.
const C_ROCK = '#6b7178';
const C_WATER = '#1c4f7a';
const C_ROUGH = '#5a4a38';
const C_SPAWN = '#ff8a3a'; // 주황 스폰.
const C_BASE = '#39d5ff'; // 청 기지.
const C_CRYSTAL = '#4dd6c0'; // 민트 크리스탈.
const C_HQ_ALLY = '#39d5ff';
const C_HQ_ENEMY = '#ff4d6a';

// id별 캐시(고정 맵은 id, 오늘의 맵은 시드까지 키에 포함해 날짜 변경 시 재생성).
const cache = new Map<string, HTMLCanvasElement>();

function fillCell(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(cx * CELL, cy * CELL, CELL, CELL);
}

function dot(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string, r = 2.4): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx * CELL + CELL / 2, cy * CELL + CELL / 2, r, 0, Math.PI * 2);
  ctx.fill();
}

// 지형 3종(rough 밑 → water/rock 위) + 스폰·기지 점. 디펜스·정복 공용.
function paintTerrain(ctx: CanvasRenderingContext2D, t: MapTerrain): void {
  for (const [x, y] of t.rough) fillCell(ctx, x, y, C_ROUGH);
  for (const [x, y] of t.water) fillCell(ctx, x, y, C_WATER);
  for (const [x, y] of t.rock) fillCell(ctx, x, y, C_ROCK);
}

// 디펜스 맵 썸네일 1장 굽기 — 지형 + 스폰(주황) + 기지(청).
function buildDefenseThumb(terrain: MapTerrain, spawns: Cell[]): HTMLCanvasElement {
  const { canvas, ctx } = createSpriteCanvas(THUMB_W, THUMB_H);
  ctx.fillStyle = C_DEF_BASE;
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);
  paintTerrain(ctx, terrain);
  for (const s of spawns) dot(ctx, s.cx, s.cy, C_SPAWN);
  dot(ctx, BASE.cx, BASE.cy, C_BASE);
  return canvas;
}

// 랜덤 맵 썸네일 — 실제 지형이 아니라 "?" + 주사위 점 느낌(진입 시 새 시드라 미리보기 불가).
function buildRandomThumb(): HTMLCanvasElement {
  const { canvas, ctx } = createSpriteCanvas(THUMB_W, THUMB_H);
  const g = ctx.createLinearGradient(0, 0, 0, THUMB_H);
  g.addColorStop(0, '#243a5a');
  g.addColorStop(1, '#1a2740');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);
  // 주사위 5점(가운데 + 네 모서리).
  ctx.fillStyle = 'rgba(120, 170, 230, 0.5)';
  for (const [dx, dy] of [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]]) {
    ctx.beginPath();
    ctx.arc(THUMB_W / 2 + dx * 26, THUMB_H / 2 + dy * 18, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#8fd0ff';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', THUMB_W / 2, THUMB_H / 2 + 2);
  return canvas;
}

/** 디펜스 맵 썸네일(캐시). random=물음표, daily=오늘 시드로 실제 생성, 나머지=고정 지형. */
export function defenseThumbnail(id: MapId, todaySeedVal: number): HTMLCanvasElement {
  const key = id === 'daily' ? `daily:${todaySeedVal}` : `def:${id}`;
  const hit = cache.get(key);
  if (hit) return hit;

  let made: HTMLCanvasElement;
  if (id === 'random') {
    made = buildRandomThumb();
  } else if (id === 'daily') {
    const g = generateMap(todaySeedVal);
    made = buildDefenseThumb(g.terrain, g.spawns);
  } else {
    made = buildDefenseThumb(mapTerrain(id), mapSpawns(id));
  }
  cache.set(key, made);
  return made;
}

// 정복 맵 썸네일 1장 굽기 — 지형(rock) + 크리스탈(민트) + 양 본진(청/적).
type ConquestMapDef = {
  hq: { player: number[]; enemy: number[] };
  terrain?: { rock?: number[][] };
  crystals: { player?: number[][]; enemy?: number[][]; center?: number[][] };
};

function buildConquestThumb(def: ConquestMapDef): HTMLCanvasElement {
  const { canvas, ctx } = createSpriteCanvas(THUMB_W, THUMB_H);
  ctx.fillStyle = C_CONQ_BASE;
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);
  for (const [x, y] of def.terrain?.rock ?? []) fillCell(ctx, x, y, C_ROCK);
  for (const group of [def.crystals.player, def.crystals.enemy, def.crystals.center]) {
    for (const [x, y] of group ?? []) dot(ctx, x, y, C_CRYSTAL, 2);
  }
  dot(ctx, def.hq.player[0], def.hq.player[1], C_HQ_ALLY, 3);
  dot(ctx, def.hq.enemy[0], def.hq.enemy[1], C_HQ_ENEMY, 3);
  return canvas;
}

/** 정복 맵 썸네일(캐시). conquest.json의 맵 지형·크리스탈·본진 좌표로 미니 렌더. */
export function conquestThumbnail(id: ConquestMapId): HTMLCanvasElement {
  const key = `conq:${id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = conquestData.maps[id] as unknown as ConquestMapDef;
  const made = buildConquestThumb(def);
  cache.set(key, made);
  return made;
}

// COLS/ROWS를 참조해 CELL 상수가 캔버스 크기와 일치함을 컴파일 타임 근처에서 강제(구조 상수 회귀 방지).
void (COLS * CELL === THUMB_W && ROWS * CELL === THUMB_H);

// 부트스트랩 — 캔버스/컨텍스트를 확보해 Game에 넘기고 루프를 시작한다.
// 상태 소유와 update/render 조율은 game/game.ts가 담당한다.

import { Game } from './game/game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D context를 얻을 수 없습니다.');

new Game(canvas, ctx).start();

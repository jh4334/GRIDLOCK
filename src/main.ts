// 부트스트랩 — 캔버스/컨텍스트를 확보해 App에 넘기고 루프를 시작한다.
// 타이틀에서 디펜스/정복 모드를 고르고, 모드 조율은 App(app.ts)이 담당한다.

import { App } from './app';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D context를 얻을 수 없습니다.');

new App(canvas, ctx).start();

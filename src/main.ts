// 부트스트랩 — 캔버스/컨텍스트를 확보해 App에 넘기고 루프를 시작한다.
// 타이틀에서 디펜스/정복 모드를 고르고, 모드 조율은 App(app.ts)이 담당한다.

import { App } from './app';
import { loadKenneyAssets } from './render/assetLoader';
import { exposeMapGen } from './debug/mapGenTelemetry';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('Canvas 2D context를 얻을 수 없습니다.');

// App을 먼저 만들어 즉시 실행(벡터 폴백) — 그 뒤 실제 Kenney 스킨을 비동기 로드해 교체한다.
// Grid/ConquestGrid가 생성자에서 onAssetsReady를 등록하므로, 로드 완료 시 바닥이 타일로 재빌드된다.
const app = new App(canvas, ctx);
app.start();
exposeMapGen(); // D7.5 — 랜덤 맵 생성기를 window에 노출(E2E 재현성·도달성 검증용).
void loadKenneyAssets();

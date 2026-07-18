// App — 최상위 조율자. 하나의 캔버스/루프를 타이틀·디펜스·정복 세 화면이 공유한다.
// 타이틀에서 모드를 고르면 해당 모드를 활성화하고, 모드의 '타이틀로'가 다시 App으로 복귀한다.
// 모드 전환 시 상대 모드를 정리(deactivate)해 상태가 섞이지 않게 한다.
//
// 입력: 타이틀 버튼 클릭만 App이 처리하고(자체 MouseInput), 디펜스/정복은 각자 입력을
// 소유하되 active 플래그로 비활성 시 무시한다. update/render는 활성 모드에만 위임한다.

import { GameLoop } from './core/loop';
import { MouseInput } from './core/input';
import { AudioEngine } from './core/audio';
import { loadAudio, saveAudio, loadDifficulty, saveDifficulty, loadMapId, saveMapId, loadConquestMap, saveConquestMap, loadDaily, type DifficultyId, type MapId, type ConquestMapId } from './core/storage';
import { Game } from './game/game';
import { ConquestGame } from './conquest/conquestGame';
import { mapTerrain, mapSpawns } from './game/maps';
import { generateMap, todaySeed, randomSeed } from './game/mapGen';
import { renderTitle, hitTitleButton, hitDifficultyButton, hitMapButton, hitConquestMapButton } from './ui/title';
import { tickClock } from './render/sprites';

type Mode = 'title' | 'defense' | 'conquest';

export class App {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly titleInput: MouseInput;
  private readonly audio: AudioEngine;
  private readonly game: Game;
  private readonly conquest: ConquestGame;
  private mode: Mode = 'title';
  private difficulty: DifficultyId = loadDifficulty(); // 정복 난이도(타이틀에서 선택, 하이라이트·저장).
  private mapId: MapId = loadMapId(); // 디펜스 맵(평원/협곡) — 타이틀에서 선택, 진입 시 적용(D4.4).
  private conquestMap: ConquestMapId = loadConquestMap(); // 정복 맵(표준/능선/사분면) — 타이틀에서 선택, 진입 시 적용(D7.4).

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;

    // 두 모드가 하나의 사운드 엔진을 공유한다 — 음량·음소거가 모드 간 어긋나지 않게.
    // 저장값을 복원해 초기화하고, 이후 변경(슬라이더·버튼·M키)은 localStorage에 즉시 저장한다.
    this.audio = new AudioEngine(loadAudio() ?? undefined);
    this.audio.subscribe(() => saveAudio({ volume: this.audio.volume, muted: this.audio.isMuted }));

    this.game = new Game(canvas, ctx, { onExit: () => this.toTitle('defense'), audio: this.audio });
    this.conquest = new ConquestGame(canvas, ctx, { onExit: () => this.toTitle('conquest'), audio: this.audio });

    // 타이틀 입력은 각 모드 입력보다 뒤에 등록한다 — 모드 진입 클릭이 방금 활성화된 모드에서
    // 다시 처리되지 않도록(모드 입력은 아직 비활성일 때 먼저 지나가고, 그다음 여기서 활성화).
    this.titleInput = new MouseInput(canvas);

    // 타이틀 화면 버튼 클릭 → 모드 진입(타이틀 상태에서만).
    this.titleInput.onClick((x, y) => {
      if (this.mode !== 'title') return;
      // 하위 선택 버튼(난이도·맵)이 모드 버튼 아래에 있으므로 먼저 판정한다(선택만 바꾸고 진입 안 함).
      const diff = hitDifficultyButton(canvas.width, canvas.height, x, y);
      if (diff) {
        this.difficulty = diff;
        saveDifficulty(diff);
        return;
      }
      const map = hitMapButton(canvas.width, canvas.height, x, y);
      if (map) {
        this.mapId = map;
        saveMapId(map);
        return;
      }
      const cmap = hitConquestMapButton(canvas.width, canvas.height, x, y);
      if (cmap) {
        this.conquestMap = cmap;
        saveConquestMap(cmap);
        return;
      }
      const hit = hitTitleButton(canvas.width, canvas.height, x, y);
      if (hit === 'defense') this.enterDefense();
      else if (hit === 'conquest') this.enterConquest();
    });
  }

  start(): void {
    new GameLoop({ update: (dt) => this.update(dt), render: () => this.render() }).start();
  }

  private enterDefense(): void {
    this.mode = 'defense';
    // 랜덤·오늘의 맵은 시드로 절차 생성한다(D7.5). 랜덤=진입 시 새 시드, 오늘의 맵=날짜 시드(하루 동일).
    // 시드는 activate 시점에 Game에 고정되어, 재시작해도 같은 맵을 유지한다.
    if (this.mapId === 'random' || this.mapId === 'daily') {
      const seed = this.mapId === 'daily' ? todaySeed() : randomSeed();
      const g = generateMap(seed);
      this.game.activate(g.terrain, g.spawns, { seed, mode: this.mapId });
    } else {
      this.game.activate(mapTerrain(this.mapId), mapSpawns(this.mapId)); // 고정 맵의 지형·스폰을 주입해 진입(재시작은 같은 맵 유지, D7.3).
    }
  }

  private enterConquest(): void {
    this.mode = 'conquest';
    this.conquest.activate();
  }

  // 활성 모드가 '타이틀로'를 누르면 그 모드를 정리하고 타이틀로 복귀.
  private toTitle(from: Mode): void {
    if (from === 'defense') this.game.deactivate();
    else if (from === 'conquest') this.conquest.deactivate();
    this.mode = 'title';
  }

  private update(dt: number): void {
    tickClock(dt); // 스프라이트 애니메이션 공용 시계(포털·리액터·크리스탈 펄스) 진행.
    if (this.mode === 'defense') this.game.update(dt);
    else if (this.mode === 'conquest') this.conquest.update(dt);
  }

  private render(): void {
    if (this.mode === 'defense') this.game.render();
    else if (this.mode === 'conquest') this.conquest.render();
    else renderTitle(this.ctx, this.game.best, this.difficulty, this.mapId, this.conquestMap, this.game.endlessBest, loadDaily(), todaySeed()); // 타이틀(최고기록 + 난이도 + 디펜스/정복 맵 + 오늘의 맵 기록).
  }
}

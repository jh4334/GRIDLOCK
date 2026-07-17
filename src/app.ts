// App — 최상위 조율자. 하나의 캔버스/루프를 타이틀·디펜스·정복 세 화면이 공유한다.
// 타이틀에서 모드를 고르면 해당 모드를 활성화하고, 모드의 '타이틀로'가 다시 App으로 복귀한다.
// 모드 전환 시 상대 모드를 정리(deactivate)해 상태가 섞이지 않게 한다.
//
// 입력: 타이틀 버튼 클릭만 App이 처리하고(자체 MouseInput), 디펜스/정복은 각자 입력을
// 소유하되 active 플래그로 비활성 시 무시한다. update/render는 활성 모드에만 위임한다.

import { GameLoop } from './core/loop';
import { MouseInput } from './core/input';
import { Game } from './game/game';
import { ConquestGame } from './conquest/conquestGame';
import { renderTitle, hitTitleButton } from './ui/title';

type Mode = 'title' | 'defense' | 'conquest';

export class App {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly titleInput: MouseInput;
  private readonly game: Game;
  private readonly conquest: ConquestGame;
  private mode: Mode = 'title';

  constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;

    this.game = new Game(canvas, ctx, { onExit: () => this.toTitle('defense') });
    this.conquest = new ConquestGame(canvas, ctx, { onExit: () => this.toTitle('conquest') });

    // 타이틀 입력은 각 모드 입력보다 뒤에 등록한다 — 모드 진입 클릭이 방금 활성화된 모드에서
    // 다시 처리되지 않도록(모드 입력은 아직 비활성일 때 먼저 지나가고, 그다음 여기서 활성화).
    this.titleInput = new MouseInput(canvas);

    // 타이틀 화면 버튼 클릭 → 모드 진입(타이틀 상태에서만).
    this.titleInput.onClick((x, y) => {
      if (this.mode !== 'title') return;
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
    this.game.activate();
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
    if (this.mode === 'defense') this.game.update(dt);
    else if (this.mode === 'conquest') this.conquest.update(dt);
  }

  private render(): void {
    if (this.mode === 'defense') this.game.render();
    else if (this.mode === 'conquest') this.conquest.render();
    else renderTitle(this.ctx, this.game.best); // 타이틀(디펜스 최고기록 표시).
  }
}

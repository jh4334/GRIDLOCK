// 정복 전용 빌드 메뉴(HTML) — #conquest-menu 컨테이너를 관리한다. 디펜스 빌드 메뉴와
// 별도 DOM이라 표시 충돌이 없다(같은 CSS 클래스를 재사용해 외형은 통일).
//
// 구성: 건물 버튼(배럭/포탑/보급고, 이름+비용) + HQ 선택 시 나타나는 일꾼 생산 패널.
// 상태(선택 건물·자원·큐)는 코디네이터가 계산해 넘겨주고, 이 메뉴는 클릭 콜백과 표시만 담당.

import type { BuildKind } from './building';

interface BuildButtonInfo {
  kind: BuildKind;
  name: string;
  cost: number;
}

export interface HqPanelInfo {
  workerCost: number;
  queue: number;
  queueMax: number;
  canProduce: boolean; // 자원·인구·큐 여유가 모두 충족될 때만 true.
}

interface ConquestMenuConfig {
  buildings: BuildButtonInfo[];
  onSelectBuilding: (kind: BuildKind) => void;
  onProduceWorker: () => void;
}

export class ConquestMenu {
  private readonly root: HTMLElement;
  private readonly buttons = new Map<BuildKind, HTMLButtonElement>();
  private readonly costs = new Map<BuildKind, number>();
  private readonly panelSlot: HTMLDivElement;
  private readonly onProduceWorker: () => void;

  constructor(config: ConquestMenuConfig) {
    this.onProduceWorker = config.onProduceWorker;
    const root = document.getElementById('conquest-menu');
    if (!root) throw new Error('#conquest-menu 컨테이너를 찾을 수 없습니다.');
    this.root = root;

    const row = document.createElement('div');
    row.className = 'tower-buttons';
    for (const info of config.buildings) {
      const btn = document.createElement('button');
      btn.className = 'tower-btn';
      btn.innerHTML = `<span class="t-name">${info.name}</span><span class="t-cost">${info.cost}💎</span>`;
      btn.addEventListener('click', () => config.onSelectBuilding(info.kind));
      row.appendChild(btn);
      this.buttons.set(info.kind, btn);
      this.costs.set(info.kind, info.cost);
    }
    root.appendChild(row);

    this.panelSlot = document.createElement('div');
    this.panelSlot.className = 'tower-panel-slot';
    root.appendChild(this.panelSlot);
  }

  setVisible(show: boolean): void {
    this.root.style.display = show ? '' : 'none';
  }

  /** 선택된 건물 버튼만 하이라이트. null이면 전부 해제. */
  setActiveBuilding(kind: BuildKind | null): void {
    for (const [k, btn] of this.buttons) btn.classList.toggle('active', k === kind);
  }

  /** 크리스탈이 부족한 건물 버튼을 비활성화. */
  updateAffordability(crystal: number): void {
    for (const [k, btn] of this.buttons) {
      const afford = crystal >= (this.costs.get(k) ?? 0);
      btn.disabled = !afford;
      btn.classList.toggle('unaffordable', !afford);
    }
  }

  /** HQ 선택 시 일꾼 생산 패널 표시. null이면 숨김. */
  showHqPanel(info: HqPanelInfo | null): void {
    this.panelSlot.replaceChildren();
    if (info === null) return;

    const panel = document.createElement('div');
    panel.className = 'tower-panel';

    const title = document.createElement('div');
    title.className = 'tp-title';
    title.textContent = '본진 (HQ)';
    panel.appendChild(title);

    const stats = document.createElement('div');
    stats.className = 'tp-stats';
    stats.innerHTML = `<span>생산 대기 ${info.queue}/${info.queueMax}</span>`;
    panel.appendChild(stats);

    const actions = document.createElement('div');
    actions.className = 'tp-actions';
    const btn = document.createElement('button');
    btn.className = 'upgrade-btn';
    btn.textContent = `일꾼 생산 (${info.workerCost}💎)`;
    btn.disabled = !info.canProduce;
    btn.addEventListener('click', () => this.onProduceWorker());
    actions.appendChild(btn);
    panel.appendChild(actions);

    this.panelSlot.appendChild(panel);
  }
}

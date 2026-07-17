// 캔버스 아래 HTML 빌드 메뉴 — 타워 버튼(이름+비용) + 선택 시 타워 정보 패널.
// 캔버스 밖 UI는 DOM으로 처리한다(DESIGN.md). 설치 모드·선택 상태는 Game이 소유하고,
// 이 메뉴는 클릭을 콜백으로 알리고 표시(하이라이트/비활성/정보 패널)만 갱신한다.
//
// 정보 패널(M7): 이름+레벨, 공격력/사거리/공속, 업그레이드 버튼(최대 레벨/골드 부족 처리),
// 판매 버튼. 상태(스탯·비용·가격 여유)는 Game/Interaction이 계산해 넘겨준다.

import type { TowerKind } from '../entities/tower';

interface TowerButtonInfo {
  kind: TowerKind;
  name: string;
  cost: number;
}

// 선택된 타워의 정보 패널에 표시할 값(전부 계산 완료 상태로 전달받는다).
export interface TowerPanelInfo {
  name: string;
  level: number;
  maxLevel: number;
  damage: number;
  range: number;
  fireRate: number;
  upgradeCost: number | null; // null = 최대 레벨(업그레이드 버튼 비활성 + "최대 레벨").
  canAffordUpgrade: boolean; // 골드 충분 여부(업그레이드 버튼 활성 조건).
  refund: number; // 판매 시 환급 골드.
}

interface BuildMenuConfig {
  towers: TowerButtonInfo[];
  onSelectTower: (kind: TowerKind) => void;
  onUpgrade: () => void;
  onSell: () => void;
}

export class BuildMenu {
  private readonly buttons = new Map<TowerKind, HTMLButtonElement>();
  private readonly costs = new Map<TowerKind, number>();
  private readonly panelSlot: HTMLDivElement;
  private readonly root: HTMLElement;
  private readonly onUpgrade: () => void;
  private readonly onSell: () => void;

  constructor(config: BuildMenuConfig) {
    this.onUpgrade = config.onUpgrade;
    this.onSell = config.onSell;

    const root = document.getElementById('build-menu');
    if (!root) throw new Error('#build-menu 컨테이너를 찾을 수 없습니다.');
    this.root = root;

    const row = document.createElement('div');
    row.className = 'tower-buttons';
    for (const info of config.towers) {
      const btn = document.createElement('button');
      btn.className = 'tower-btn';
      btn.innerHTML =
        `<span class="t-name">${info.name}</span>` + `<span class="t-cost">${info.cost}G</span>`;
      btn.addEventListener('click', () => config.onSelectTower(info.kind));
      row.appendChild(btn);
      this.buttons.set(info.kind, btn);
      this.costs.set(info.kind, info.cost);
    }
    root.appendChild(row);

    // 정보 패널 자리 — 타워 선택 시에만 채워진다.
    this.panelSlot = document.createElement('div');
    this.panelSlot.className = 'tower-panel-slot';
    root.appendChild(this.panelSlot);
  }

  /** 빌드 메뉴 전체 표시/숨김 — menu 상태에선 숨긴다. */
  setVisible(show: boolean): void {
    this.root.style.display = show ? '' : 'none';
  }

  /** 설치 모드 대상 버튼만 하이라이트. null이면 전부 해제. */
  setActiveTower(kind: TowerKind | null): void {
    for (const [k, btn] of this.buttons) btn.classList.toggle('active', k === kind);
  }

  /** 골드로 살 수 없는 타워 버튼을 비활성(회색)화 — 클릭도 막힌다. */
  updateAffordability(gold: number): void {
    for (const [k, btn] of this.buttons) {
      const afford = gold >= (this.costs.get(k) ?? 0);
      btn.disabled = !afford;
      btn.classList.toggle('unaffordable', !afford);
    }
  }

  /** 선택된 타워의 정보 패널 표시. null이면 숨김. */
  showTowerPanel(info: TowerPanelInfo | null): void {
    this.panelSlot.replaceChildren();
    if (info === null) return;

    const panel = document.createElement('div');
    panel.className = 'tower-panel';

    const title = document.createElement('div');
    title.className = 'tp-title';
    title.textContent = `${info.name}  Lv.${info.level}/${info.maxLevel}`;
    panel.appendChild(title);

    const stats = document.createElement('div');
    stats.className = 'tp-stats';
    stats.innerHTML =
      `<span>공격력 ${info.damage}</span>` +
      `<span>사거리 ${info.range}</span>` +
      `<span>공속 ${info.fireRate}/s</span>`;
    panel.appendChild(stats);

    const actions = document.createElement('div');
    actions.className = 'tp-actions';

    const upBtn = document.createElement('button');
    upBtn.className = 'upgrade-btn';
    if (info.upgradeCost === null) {
      upBtn.textContent = '최대 레벨';
      upBtn.disabled = true;
    } else {
      upBtn.textContent = `업그레이드 (${info.upgradeCost}G)`;
      upBtn.disabled = !info.canAffordUpgrade;
      upBtn.addEventListener('click', () => this.onUpgrade());
    }
    actions.appendChild(upBtn);

    const sellBtn = document.createElement('button');
    sellBtn.className = 'sell-btn';
    sellBtn.textContent = `판매 (+${info.refund}G)`;
    sellBtn.addEventListener('click', () => this.onSell());
    actions.appendChild(sellBtn);

    panel.appendChild(actions);
    this.panelSlot.appendChild(panel);
  }
}

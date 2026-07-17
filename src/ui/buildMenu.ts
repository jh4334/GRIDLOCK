// 캔버스 아래 HTML 빌드 메뉴 — 타워 버튼(이름+비용) + 선택 시 판매 버튼.
// 캔버스 밖 UI는 DOM으로 처리한다(DESIGN.md). 설치 모드·선택 상태는 Game이 소유하고,
// 이 메뉴는 클릭을 콜백으로 알리고 표시(하이라이트/비활성/판매 버튼)만 갱신한다.

import type { TowerKind } from '../entities/tower';

interface TowerButtonInfo {
  kind: TowerKind;
  name: string;
  cost: number;
}

interface BuildMenuConfig {
  towers: TowerButtonInfo[];
  onSelectTower: (kind: TowerKind) => void;
  onSell: () => void;
}

export class BuildMenu {
  private readonly buttons = new Map<TowerKind, HTMLButtonElement>();
  private readonly costs = new Map<TowerKind, number>();
  private readonly sellSlot: HTMLDivElement;
  private readonly onSell: () => void;

  constructor(config: BuildMenuConfig) {
    this.onSell = config.onSell;

    const root = document.getElementById('build-menu');
    if (!root) throw new Error('#build-menu 컨테이너를 찾을 수 없습니다.');

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

    // 판매 버튼 자리 — 선택 시에만 채워진다.
    this.sellSlot = document.createElement('div');
    this.sellSlot.className = 'sell-slot';
    root.appendChild(this.sellSlot);
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

  /** 선택된 타워의 판매 버튼 표시. null이면 숨김. */
  showSell(refund: number | null): void {
    this.sellSlot.replaceChildren();
    if (refund === null) return;
    const btn = document.createElement('button');
    btn.className = 'sell-btn';
    btn.textContent = `판매 (+${refund}G)`;
    btn.addEventListener('click', () => this.onSell());
    this.sellSlot.appendChild(btn);
  }
}

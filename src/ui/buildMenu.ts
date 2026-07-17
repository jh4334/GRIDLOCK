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
// 배럭 선택 시 표시할 병사 정보(M10). 존재하면 공격력/사거리/공속 대신 이 값을 보여준다.
export interface SoldierPanelInfo {
  alive: number; // 현재 생존 병사 수.
  count: number; // 유지 목표 병사 수.
  respawning: number; // 리스폰 대기 중인 병사 수.
  hp: number; // 병사 최대 HP(레벨 반영).
  damage: number; // 병사 공격력(레벨 반영).
}

// 4레벨 스페셜 분기 버튼 정보(D4.2). 선택 가능 시 2개가 전달된다.
export interface SpecialOption {
  id: string;
  name: string;
  desc: string;
}

export interface TowerPanelInfo {
  name: string;
  level: number;
  maxLevel: number;
  damage: number;
  range: number;
  fireRate: number;
  soldier?: SoldierPanelInfo; // 배럭 전용 — 있으면 병사 스탯 패널로 렌더.
  upgradeCost: number | null; // null = 최대 레벨(업그레이드 버튼 비활성 + "최대 레벨").
  canAffordUpgrade: boolean; // 골드 충분 여부(업그레이드 버튼 활성 조건).
  refund: number; // 판매 시 환급 골드.
  // ── 4레벨 스페셜 분기(D4.2) ──
  specials?: SpecialOption[]; // 선택 가능할 때만(최대 레벨·미선택). 있으면 분기 버튼 2개 렌더.
  specialCost?: number; // 분기 선택 비용(specials 있을 때).
  canAffordSpecial?: boolean; // 골드 충분 여부(분기 버튼 활성 조건).
  chosenSpecial?: SpecialOption | null; // 이미 선택된 분기 — 표시만.
}

interface BuildMenuConfig {
  towers: TowerButtonInfo[];
  onSelectTower: (kind: TowerKind) => void;
  onUpgrade: () => void;
  onSell: () => void;
  onSpecial: (id: string) => void; // 4레벨 스페셜 분기 선택(D4.2).
}

export class BuildMenu {
  private readonly buttons = new Map<TowerKind, HTMLButtonElement>();
  private readonly costs = new Map<TowerKind, number>();
  private readonly panelSlot: HTMLDivElement;
  private readonly root: HTMLElement;
  private readonly onUpgrade: () => void;
  private readonly onSell: () => void;
  private readonly onSpecial: (id: string) => void;

  constructor(config: BuildMenuConfig) {
    this.onUpgrade = config.onUpgrade;
    this.onSell = config.onSell;
    this.onSpecial = config.onSpecial;

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
    if (info.soldier) {
      // 배럭 — 병사 수(생존/목표, 리스폰 대기) + 병사 스탯.
      const s = info.soldier;
      const respawn = s.respawning > 0 ? ` (리스폰 ${s.respawning})` : '';
      stats.innerHTML =
        `<span>병사 ${s.alive}/${s.count}${respawn}</span>` +
        `<span>병사HP ${s.hp}</span>` +
        `<span>공격력 ${s.damage}</span>`;
    } else {
      stats.innerHTML =
        `<span>공격력 ${info.damage}</span>` +
        `<span>사거리 ${info.range}</span>` +
        `<span>공속 ${info.fireRate}/s</span>`;
    }
    panel.appendChild(stats);

    this.appendSpecialSection(panel, info); // 4레벨 스페셜 분기(D4.2) — 선택 UI 또는 선택 표시.

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

  // 4레벨 스페셜 분기(D4.2) — 이미 선택했으면 선택 표시, 선택 가능하면 분기 버튼 2개(이름+소문구),
  // 둘 다 아니면(레벨 미도달 등) 아무것도 그리지 않는다.
  private appendSpecialSection(panel: HTMLElement, info: TowerPanelInfo): void {
    if (info.chosenSpecial) {
      const chosen = document.createElement('div');
      chosen.className = 'tp-special-chosen';
      chosen.textContent = `특화: ${info.chosenSpecial.name}`;
      chosen.title = info.chosenSpecial.desc;
      panel.appendChild(chosen);
      return;
    }
    if (!info.specials || info.specials.length === 0) return;

    const label = document.createElement('div');
    label.className = 'tp-special-label';
    label.textContent = `특화 선택 (${info.specialCost}G)`;
    panel.appendChild(label);

    const row = document.createElement('div');
    row.className = 'tp-special-row';
    for (const s of info.specials) {
      const btn = document.createElement('button');
      btn.className = 'special-btn';
      btn.innerHTML = `<span class="s-name">${s.name}</span><span class="s-desc">${s.desc}</span>`;
      btn.title = s.desc;
      btn.disabled = !info.canAffordSpecial;
      btn.addEventListener('click', () => this.onSpecial(s.id));
      row.appendChild(btn);
    }
    panel.appendChild(row);
  }
}

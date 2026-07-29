// 정복 컨트롤 바의 명령 버튼 묶음(D9.4) — "공격이동" 토글 + 부대 버튼 1·2·3.
// 터치엔 A키·Ctrl+숫자가 없어 키보드 전용이던 두 기능을 DOM 버튼으로 노출한다. 데스크톱에도
// 그대로 보이며(마우스 클릭 = 같은 함수), 기존 키·우클릭 흐름은 건드리지 않는다.
//
// 동작은 전부 conquestActions에 있고 이 파일은 DOM 생성 + 표시 갱신만 한다.
// update()는 코디네이터의 syncUi에서 호출되며(렌더 아님) 서명이 바뀔 때만 DOM을 만진다.
// 컨테이너는 #conquest-controls의 자식이라 바 전체 표시/숨김(Controls.setBarVisible)에 따라간다.

import { toggleAttackMove, tapGroup, type ConquestActionDeps } from './conquestActions';

const GROUPS = [1, 2, 3]; // 터치로 노출할 부대 번호(키보드는 1~9 그대로).

export class ConquestCommandBar {
  private readonly deps: ConquestActionDeps;
  private readonly attackBtn: HTMLButtonElement;
  private readonly groupBtns: HTMLButtonElement[] = [];
  private lastSig = ''; // 표시 상태 서명 — 값이 바뀔 때만 DOM 갱신(깜빡임·불필요한 리플로 방지).

  constructor(deps: ConquestActionDeps, rootId = 'conquest-controls') {
    this.deps = deps;
    const root = document.getElementById(rootId);
    if (!root) throw new Error(`#${rootId} 컨테이너를 찾을 수 없습니다.`);

    const box = document.createElement('div');
    box.className = 'conquest-cmd';

    this.attackBtn = document.createElement('button');
    this.attackBtn.className = 'attack-move-btn';
    this.attackBtn.textContent = '공격이동';
    this.attackBtn.title = '공격 이동(A) — 켠 뒤 목표 지점을 탭/클릭';
    this.attackBtn.addEventListener('click', () => toggleAttackMove(this.deps));
    box.appendChild(this.attackBtn);

    for (const n of GROUPS) {
      const btn = document.createElement('button');
      btn.className = 'group-btn';
      btn.dataset.group = String(n);
      btn.textContent = String(n);
      btn.title = `부대 ${n} — 선택 중이면 저장(Ctrl+${n}), 선택이 없으면 호출(${n})`;
      btn.addEventListener('click', () => tapGroup(this.deps, n));
      box.appendChild(btn);
      this.groupBtns.push(btn);
    }

    root.appendChild(box);
    this.update();
  }

  /** 버튼 활성/하이라이트/부대 인원 배지 갱신. 상태는 읽기만 한다(변경은 액션에서만). */
  update(): void {
    const d = this.deps;
    const live = d.canInteract();
    const attackMove = d.isAttackMove();
    const canAttack = live && d.selection.hasUnits;
    const hasSelection = d.selection.hasUnits || d.selection.hasWorkers;
    const counts = GROUPS.map((n) => d.groups.size(n));

    const sig = `${live}|${attackMove}|${canAttack}|${hasSelection}|${counts.join(',')}`;
    if (sig === this.lastSig) return;
    this.lastSig = sig;

    this.attackBtn.disabled = !canAttack;
    this.attackBtn.classList.toggle('active', attackMove);
    // 공격 이동 대기 여부를 DOM에도 남긴다(E2E가 캔버스 밖에서 관찰할 수 있게).
    this.attackBtn.dataset.active = String(attackMove);

    GROUPS.forEach((n, i) => {
      const btn = this.groupBtns[i];
      const count = counts[i];
      // 저장된 부대는 인원 배지("1 (4)"), 빈 부대는 번호만 + 흐리게.
      btn.textContent = count > 0 ? `${n} (${count})` : String(n);
      btn.dataset.count = String(count);
      btn.classList.toggle('empty', count === 0);
      // 빈 부대는 저장할 선택이 있을 때만 의미가 있다(선택 없이 누르면 호출할 부대가 없음).
      btn.disabled = !live || (count === 0 && !hasSelection);
    });
  }
}

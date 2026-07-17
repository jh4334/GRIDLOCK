// 웨이브 프리뷰(HTML) — 다음 웨이브 구성(적 종류별 아이콘 + ×수)을 컨트롤 바에 표시한다.
// 아이콘은 기존 적 벡터 스프라이트(enemy/<kind>)를 20px 소형 캔버스에 축소해 재사용한다.
// 에셋 로드 전이면 getSprite가 벡터 폴백을 그리므로 자연히 대응된다(별도 분기 불필요).
//
// DOM 재구성은 구성이 실제로 바뀔 때만(lastKey 비교) — 매 프레임 갱신 금지(waves.ts 참조).

import { getSprite } from '../render/sprites';
import '../render/enemySprites'; // enemy/<kind> 벡터 빌더 등록 보장(사이드이펙트 import).
import type { WaveComposition } from '../game/waves';

const ICON = 20; // 아이콘 캔버스 한 변(px).

export class WavePreview {
  readonly el: HTMLElement;
  private lastKey = '';

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'wave-preview';
    this.el.style.display = 'none';
  }

  /** 구성 갱신 — 종류·수가 이전과 같으면 DOM을 건드리지 않는다. 빈 배열이면 숨긴다. */
  set(comp: WaveComposition[]): void {
    const key = comp.map((c) => `${c.kind}:${c.count}`).join(',');
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.el.textContent = '';
    if (comp.length === 0) {
      this.el.style.display = 'none';
      return;
    }
    this.el.style.display = '';
    for (const { kind, count } of comp) {
      const item = document.createElement('div');
      item.className = 'wp-item';
      const canvas = document.createElement('canvas');
      canvas.width = ICON;
      canvas.height = ICON;
      canvas.className = 'wp-icon';
      const cx = canvas.getContext('2d');
      if (cx) cx.drawImage(getSprite(`enemy/${kind}`), 0, 0, ICON, ICON);
      const label = document.createElement('span');
      label.className = 'wp-count';
      label.textContent = `×${count}`;
      item.append(canvas, label);
      this.el.appendChild(item);
    }
  }
}

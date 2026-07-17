// 골드·라이프 관리. 시작값은 data/economy.json에서 로딩(코드에 매직넘버 금지).

import economyData from '../data/economy.json';

export class Economy {
  gold: number;
  lives: number;

  constructor() {
    this.gold = economyData.startGold;
    this.lives = economyData.startLives;
  }

  addGold(amount: number): void {
    this.gold += amount;
  }

  /** 골드가 충분하면 차감하고 true. 부족하면 false. */
  spend(amount: number): boolean {
    if (this.gold < amount) return false;
    this.gold -= amount;
    return true;
  }

  /** 라이프 감소(0 미만으로는 내려가지 않음). */
  loseLife(amount = 1): void {
    this.lives = Math.max(0, this.lives - amount);
  }

  get isDefeated(): boolean {
    return this.lives <= 0;
  }
}

import { GameEvent, GameEvents } from "./events";
import { Rules } from "./config";

export enum Currency {
  Coin,
  Diamond,
}
export class Wallet {
  coins = 0;
  diamonds = 0;
  revision = 0;
  constructor(private readonly events: GameEvents) {}
  add(currency: Currency, amount: number) {
    if (
      (currency !== Currency.Coin && currency !== Currency.Diamond) ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      !Number.isSafeInteger(
        (currency === Currency.Coin ? this.coins : this.diamonds) + amount,
      )
    )
      throw new Error("Currency amount must be a positive safe integer");
    if (currency === Currency.Coin) this.coins += amount;
    else this.diamonds += amount;
    this.revision++;
    this.events.emit(GameEvent.Pickup, currency);
  }
  reset() {
    this.coins = this.diamonds = 0;
    this.revision++;
  }
  spend(currency: Currency, amount: number) {
    if (
      (currency !== Currency.Coin && currency !== Currency.Diamond) ||
      !Number.isSafeInteger(amount) ||
      amount <= 0
    )
      return false;
    const balance = currency === Currency.Coin ? this.coins : this.diamonds;
    if (balance < amount) return false;
    if (currency === Currency.Coin) this.coins -= amount;
    else this.diamonds -= amount;
    this.revision++;
    this.events.emit(GameEvent.WalletChanged);
    return true;
  }
}

export class Health {
  lives = 3;
  immunity = 0;
  constructor(private readonly events: GameEvents) {}
  heal(amount = 1) {
    if (!Number.isSafeInteger(amount) || amount <= 0)
      throw new Error("Healing must be a positive safe integer");
    if (this.lives <= 0 || this.lives >= 3) return false;
    this.lives = Math.min(3, this.lives + amount);
    this.events.emit(GameEvent.Heal, this.lives);
    return true;
  }
  damage() {
    if (this.immunity > 0 || this.lives <= 0) return false;
    this.lives--;
    this.immunity = Rules.immunitySeconds;
    this.events.emit(GameEvent.Hit, this.lives);
    if (!this.lives) this.events.emit(GameEvent.Death);
    return true;
  }
  step(dt: number) {
    this.immunity = this.immunity - dt < 1e-9 ? 0 : this.immunity - dt;
  }
  reset() {
    this.lives = 3;
    this.immunity = 0;
  }
}

import { GameEvent, GameEvents } from "./events";

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
}

export interface BonusDefinition {
  readonly id: number;
  readonly duration: number;
  readonly speedFactor?: number;
  readonly jumpFactor?: number;
  readonly shield?: boolean;
}
/** Extension point only: no bonus drops or player bonuses are enabled by default. */
export class BonusSystem {
  private readonly definitions = new Map<number, BonusDefinition>();
  readonly ids = new Int16Array(8).fill(-1);
  readonly remaining = new Float32Array(8);
  speedFactor = 1;
  jumpFactor = 1;
  shield = false;
  constructor(private readonly events: GameEvents) {}
  register(definition: BonusDefinition) {
    if (
      !Number.isInteger(definition.id) ||
      definition.id < 0 ||
      definition.id > 32767 ||
      !Number.isFinite(definition.duration) ||
      definition.duration <= 0 ||
      !Number.isFinite(definition.speedFactor ?? 1) ||
      !Number.isFinite(definition.jumpFactor ?? 1) ||
      (definition.speedFactor ?? 1) <= 0 ||
      (definition.jumpFactor ?? 1) <= 0
    )
      throw new Error("Invalid bonus definition");
    if (this.definitions.has(definition.id)) throw new Error("Duplicate bonus");
    this.definitions.set(definition.id, Object.freeze({ ...definition }));
  }
  activate(id: number) {
    const definition = this.definitions.get(id);
    if (!definition) return false;
    let slot = this.ids.indexOf(id);
    if (slot < 0) slot = this.ids.indexOf(-1);
    if (slot < 0) return false;
    this.ids[slot] = id;
    this.remaining[slot] = definition.duration;
    this.recompute();
    this.events.emit(GameEvent.BonusChanged, id);
    return true;
  }
  step(dt: number) {
    let changed = false;
    for (let i = 0; i < this.ids.length; i++) {
      if (this.ids[i] < 0) continue;
      this.remaining[i] -= dt;
      if (this.remaining[i] <= 0) {
        this.ids[i] = -1;
        changed = true;
      }
    }
    if (changed) {
      this.recompute();
      this.events.emit(GameEvent.BonusChanged);
    }
  }
  private recompute() {
    this.speedFactor = this.jumpFactor = 1;
    this.shield = false;
    for (let i = 0; i < this.ids.length; i++) {
      const definition = this.definitions.get(this.ids[i]);
      if (!definition) continue;
      this.speedFactor *= definition.speedFactor ?? 1;
      this.jumpFactor *= definition.jumpFactor ?? 1;
      this.shield ||= definition.shield ?? false;
    }
    this.speedFactor = Math.max(0.25, Math.min(2, this.speedFactor));
    this.jumpFactor = Math.max(0.5, Math.min(1.5, this.jumpFactor));
  }
  reset() {
    this.ids.fill(-1);
    this.remaining.fill(0);
    this.recompute();
  }
}

export class Health {
  lives = 3;
  immunity = 0;
  constructor(private readonly events: GameEvents) {}
  damage() {
    if (this.immunity > 0 || this.lives <= 0) return false;
    this.lives--;
    this.immunity = 1.25;
    this.events.emit(GameEvent.Hit, this.lives);
    if (!this.lives) this.events.emit(GameEvent.Death);
    return true;
  }
  step(dt: number) {
    this.immunity = Math.max(0, this.immunity - dt);
  }
  reset() {
    this.lives = 3;
    this.immunity = 0;
  }
}

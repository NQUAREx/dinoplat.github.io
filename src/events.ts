export enum GameEvent {
  Start,
  Jump,
  Land,
  Step,
  Hit,
  Death,
  Pickup,
  BonusChanged,
  Duck,
  Dive,
  Heal,
  Collected,
  WalletChanged,
}
export type EventListener = (value: number, amount: number) => void;

/** Subscribers are installed once. Emit numeric payloads without frame garbage. */
export class GameEvents {
  private readonly listeners = Array.from(
    { length: GameEvent.WalletChanged + 1 },
    () => new Set<EventListener>(),
  );
  on(type: GameEvent, listener: EventListener) {
    this.listeners[type].add(listener);
    return () => {
      this.listeners[type].delete(listener);
    };
  }
  emit(type: GameEvent, value = 0, amount = 1) {
    for (const listener of this.listeners[type]) listener(value, amount);
  }
  dispose() {
    for (const listeners of this.listeners) listeners.clear();
  }
}

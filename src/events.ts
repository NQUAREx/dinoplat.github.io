export enum GameEvent {
  Start,
  Jump,
  Land,
  Step,
  Hit,
  Death,
  Pickup,
  BonusChanged,
}
export type EventListener = (value: number) => void;

/** Subscribers are installed once. Emit numeric payloads without frame garbage. */
export class GameEvents {
  private readonly listeners = Array.from(
    { length: 8 },
    () => new Set<EventListener>(),
  );
  on(type: GameEvent, listener: EventListener) {
    this.listeners[type].add(listener);
    return () => {
      this.listeners[type].delete(listener);
    };
  }
  emit(type: GameEvent, value = 0) {
    for (const listener of this.listeners[type]) listener(value);
  }
  dispose() {
    for (const listeners of this.listeners) listeners.clear();
  }
}

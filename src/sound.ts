import { GameEvent, GameEvents } from "./events";

/** One reusable synthesized voice; no audio files, streaming or per-step nodes. */
export class GameSound {
  enabled = true;
  private context?: AudioContext;
  private oscillator?: OscillatorNode;
  private gain?: GainNode;
  private readonly off: (() => void)[];
  constructor(events: GameEvents) {
    this.off = [
      events.on(GameEvent.Jump, () => this.play(560, 900, 0.12)),
      events.on(GameEvent.Land, () => this.play(170, 100, 0.05)),
      events.on(GameEvent.Hit, () => this.play(180, 70, 0.18)),
      events.on(GameEvent.Death, () => this.play(240, 45, 0.35)),
      events.on(GameEvent.Pickup, () => this.play(900, 1400, 0.08)),
    ];
  }
  unlock() {
    if (!this.enabled) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.gain = this.context.createGain();
        this.gain.gain.value = 0;
        this.gain.connect(this.context.destination);
        this.oscillator = this.context.createOscillator();
        this.oscillator.type = "square";
        this.oscillator.connect(this.gain);
        this.oscillator.start();
      }
      void this.context.resume().catch(() => {});
    } catch {
      /* Sound is optional; unsupported Web Audio must not stop play. */
    }
  }
  private play(from: number, to: number, duration: number) {
    if (
      !this.enabled ||
      !this.context ||
      !this.gain ||
      !this.oscillator ||
      this.context.state !== "running"
    )
      return;
    const now = this.context.currentTime;
    const frequency = this.oscillator.frequency,
      volume = this.gain.gain;
    frequency.cancelScheduledValues(now);
    frequency.setValueAtTime(from, now);
    frequency.exponentialRampToValueAtTime(to, now + duration);
    volume.cancelScheduledValues(now);
    volume.setValueAtTime(0, now);
    volume.linearRampToValueAtTime(0.035, now + 0.004);
    volume.exponentialRampToValueAtTime(0.0001, now + duration);
    volume.setValueAtTime(0, now + duration + 0.005);
  }
  stop() {
    if (!this.context || !this.gain) return;
    this.gain.gain.cancelScheduledValues(this.context.currentTime);
    this.gain.gain.setValueAtTime(0, this.context.currentTime);
  }
  suspend() {
    this.stop();
    if (this.context && this.context.state !== "closed")
      void this.context.suspend().catch(() => {});
  }
  stats() {
    return {
      enabled: this.enabled,
      state: this.context?.state ?? "uninitialized",
      voices: this.oscillator ? 1 : 0,
      gain: this.gain?.gain.value ?? 0,
    };
  }
  dispose() {
    for (const off of this.off) off();
    this.stop();
    this.oscillator?.stop();
    this.oscillator?.disconnect();
    this.gain?.disconnect();
    if (this.context) void this.context.close().catch(() => {});
  }
}

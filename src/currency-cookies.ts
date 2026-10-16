import { GameEvent, type GameEvents } from "./events";
import type { Wallet } from "./progression";

/** Project-scoped cookie; no frame polling. Coalesce pickups in one JS task. */
export class CurrencyCookies {
  static readonly cookieName = "dinoplat3d-wallet-v1";
  private readonly off: (() => void)[];
  private pending = false;
  private alive = true;
  private saved = "";
  constructor(
    private readonly wallet: Wallet,
    events: GameEvents,
    private readonly path: string,
  ) {
    try {
      const entry = document.cookie
        .split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith(CurrencyCookies.cookieName + "="));
      if (entry) {
        const value = entry.slice(CurrencyCookies.cookieName.length + 1);
        const match = /^1\.(\d+)\.(\d+)$/.exec(value);
        if (match) {
          const coins = Number(match[1]),
            diamonds = Number(match[2]);
          if (Number.isSafeInteger(coins) && Number.isSafeInteger(diamonds)) {
            wallet.coins = coins;
            wallet.diamonds = diamonds;
            wallet.revision++;
            this.saved = value;
          }
        }
      }
    } catch {
      /* Cookie access may be blocked by privacy settings. */
    }
    const changed = () => {
      if (!this.pending) {
        this.pending = true;
        queueMicrotask(this.flushPending);
      }
    };
    this.off = [
      events.on(GameEvent.Pickup, changed),
      events.on(GameEvent.WalletChanged, changed),
    ];
  }
  private readonly flushPending = () => {
    this.pending = false;
    if (this.alive) this.flush();
  };
  flush() {
    const value = `1.${this.wallet.coins}.${this.wallet.diamonds}`;
    if (value === this.saved) return;
    try {
      document.cookie = `${CurrencyCookies.cookieName}=${value}; Path=${this.path}; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
      this.saved = value;
    } catch {
      /* In-memory balances still work if cookies are unavailable. */
    }
  }
  dispose() {
    this.flush();
    this.alive = false;
    for (const off of this.off) off();
  }
}

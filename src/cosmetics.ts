import { Currency, type Wallet } from "./progression";
import additions from "./assets/wardrobe-catalog.json";

export const COSMETIC_CATEGORIES = [
  "dino",
  "hat",
  "boots",
  "watch",
  "gloves",
] as const;
export type CosmeticCategory = (typeof COSMETIC_CATEGORIES)[number];
export interface CosmeticDefinition {
  readonly id: string;
  readonly category: CosmeticCategory;
  readonly name: string;
  readonly price: number;
  readonly currency: Currency;
}
export const COSMETICS: readonly CosmeticDefinition[] = Object.freeze([
  {
    id: "dino-green",
    category: "dino",
    name: "ЛАЙМ",
    price: 0,
    currency: Currency.Coin,
  },
  {
    id: "dino-white",
    category: "dino",
    name: "СНЕЖОК",
    price: 750,
    currency: Currency.Coin,
  },
  {
    id: "dino-pink",
    category: "dino",
    name: "ЗЕФИР",
    price: 60,
    currency: Currency.Diamond,
  },
  {
    id: "dino-gold",
    category: "dino",
    name: "ЗОЛОТОЙ",
    price: 1000,
    currency: Currency.Diamond,
  },
  {
    id: "hat-cap",
    category: "hat",
    name: "КЕПКА",
    price: 240,
    currency: Currency.Coin,
  },
  {
    id: "hat-safari",
    category: "hat",
    name: "САФАРИ",
    price: 360,
    currency: Currency.Coin,
  },
  {
    id: "hat-crown",
    category: "hat",
    name: "КОРОНА",
    price: 75,
    currency: Currency.Diamond,
  },
  {
    id: "boots-red",
    category: "boots",
    name: "КЕДЫ",
    price: 270,
    currency: Currency.Coin,
  },
  {
    id: "boots-blue",
    category: "boots",
    name: "СПРИНТ",
    price: 360,
    currency: Currency.Coin,
  },
  {
    id: "boots-gold",
    category: "boots",
    name: "ЗОЛОТО",
    price: 60,
    currency: Currency.Diamond,
  },
  ...(additions as CosmeticDefinition[]),
]);
type StorageLike = Pick<Storage, "getItem" | "setItem">;
/** Cosmetic-only inventory: never changes physics, speed or collider metadata. */
export class CosmeticInventory {
  static readonly key = "dinorun-cosmetics-v1";
  readonly owned = new Set<string>(["dino-green"]);
  readonly equipped: Record<CosmeticCategory, string> = {
    dino: "dino-green",
    hat: "",
    boots: "",
    watch: "",
    gloves: "",
  };
  revision = 0;
  private storage?: StorageLike;
  constructor(
    private readonly wallet: Wallet,
    storage?: StorageLike,
  ) {
    try {
      this.storage = storage ?? globalThis.localStorage;
      const saved = JSON.parse(
        this.storage?.getItem(CosmeticInventory.key) ?? "null",
      );
      if (saved?.version !== 1 || !Array.isArray(saved.owned)) return;
      for (const id of saved.owned)
        if (COSMETICS.some((item) => item.id === id)) this.owned.add(id);
      for (const category of COSMETIC_CATEGORIES) {
        const id = saved.equipped?.[category];
        if (
          this.owned.has(id) &&
          COSMETICS.some((item) => item.id === id && item.category === category)
        )
          this.equipped[category] = id;
      }
    } catch {
      /* Optional local storage; default green remains available. */
    }
  }
  choose(id: string): "purchased" | "equipped" | "funds" | "invalid" {
    const item = COSMETICS.find((value) => value.id === id);
    if (!item) return "invalid";
    let purchased = false;
    if (!this.owned.has(id)) {
      if (!this.wallet.spend(item.currency, item.price)) return "funds";
      this.owned.add(id);
      purchased = true;
    }
    this.equipped[item.category] = id;
    this.changed();
    return purchased ? "purchased" : "equipped";
  }
  remove(category: CosmeticCategory) {
    if (category === "dino" || !this.equipped[category]) return;
    this.equipped[category] = "";
    this.changed();
  }
  private changed() {
    this.revision++;
    try {
      this.storage?.setItem(
        CosmeticInventory.key,
        JSON.stringify({
          version: 1,
          owned: [...this.owned],
          equipped: this.equipped,
        }),
      );
    } catch {
      /* In-memory purchases still work without storage. */
    }
  }
}

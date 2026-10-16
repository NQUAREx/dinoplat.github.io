import {
  COSMETICS,
  type CosmeticCategory,
  type CosmeticInventory,
} from "./cosmetics";
import coinIcon from "./assets/icons/coin.png";
import diamondIcon from "./assets/icons/diamond.png";

/** Fixed catalogue cards; touch rails scroll locally without enabling page gestures. */
export class ShopUI {
  private revision = -1;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly abort = new AbortController();
  private readonly sections: HTMLElement[] = [];
  constructor(
    root: HTMLElement,
    private readonly inventory: CosmeticInventory,
    choose: (id: string) => void,
    remove: (category: CosmeticCategory) => void,
  ) {
    for (const category of ["dino", "hat", "boots"] as const) {
      const section = document.createElement("section");
      section.className = "shop-section";
      const heading = document.createElement("div");
      heading.className = "shop-heading";
      const title = document.createElement("h3");
      title.textContent =
        category === "dino" ? "ДИНО" : category === "hat" ? "ШАПКИ" : "БОТИНКИ";
      heading.append(title);
      if (category !== "dino") {
        const clear = document.createElement("button");
        clear.className = "remove-accessory";
        clear.textContent = "СНЯТЬ";
        clear.dataset.remove = category;
        heading.append(clear);
      }
      const rail = document.createElement("div");
      rail.className = "card-rail";
      rail.dataset.rail = category;
      rail.setAttribute("aria-label", title.textContent);
      for (const item of COSMETICS.filter((i) => i.category === category)) {
        const card = document.createElement("button");
        card.className = "shop-card";
        card.dataset.item = item.id;
        const img = document.createElement("img");
        img.src = `${import.meta.env.BASE_URL}shop/${item.id}.webp`;
        img.alt = item.name;
        img.width = 160;
        img.height = 160;
        img.draggable = false;
        const name = document.createElement("strong");
        name.textContent = item.name;
        const price = document.createElement("span");
        price.className = "card-price";
        card.append(img, name, price);
        rail.append(card);
        this.buttons.set(item.id, card);
      }
      const next = document.createElement("button");
      next.className = "rail-next";
      next.textContent = "→";
      next.dataset.next = category;
      next.setAttribute("aria-label", `Листать ${title.textContent}`);
      heading.append(next);
      section.append(heading, rail);
      root.append(section);
      this.sections.push(section);
    }
    let pointer = -1,
      startX = 0,
      startY = 0,
      scrollX = 0,
      scrollY = 0,
      moved = false,
      target: Element | null = null,
      rail: HTMLElement | null = null;
    const options = { signal: this.abort.signal };
    root.addEventListener(
      "pointerdown",
      (event) => {
        if (event.pointerType !== "touch" || !event.isPrimary) return;
        pointer = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        moved = false;
        target = event.target instanceof Element ? event.target : null;
        rail = target?.closest<HTMLElement>(".card-rail") ?? null;
        scrollX = rail?.scrollLeft ?? 0;
        scrollY = root.scrollTop;
        root.setPointerCapture(pointer);
      },
      options,
    );
    root.addEventListener(
      "pointermove",
      (event) => {
        if (event.pointerId !== pointer) return;
        const dx = event.clientX - startX,
          dy = event.clientY - startY;
        moved ||= Math.abs(dx) > 8 || Math.abs(dy) > 8;
        if (moved) {
          if (rail && Math.abs(dx) > Math.abs(dy))
            rail.scrollLeft = scrollX - dx;
          else root.scrollTop = scrollY - dy;
        }
      },
      options,
    );
    root.addEventListener(
      "pointerup",
      (event) => {
        if (event.pointerId !== pointer) return;
        pointer = -1;
        if (moved) return;
        const card = target?.closest<HTMLElement>("[data-item]"),
          clear = target?.closest<HTMLElement>("[data-remove]"),
          next = target?.closest<HTMLElement>("[data-next]");
        if (card) choose(card.dataset.item!);
        if (clear) remove(clear.dataset.remove as CosmeticCategory);
        if (next) {
          const rail = root.querySelector<HTMLElement>(
            `[data-rail="${next.dataset.next}"]`,
          )!;
          rail.scrollLeft =
            rail.scrollLeft >= rail.scrollWidth - rail.clientWidth - 4
              ? 0
              : rail.scrollLeft + 130;
        }
      },
      options,
    );
    for (const event of ["pointercancel", "lostpointercapture"])
      root.addEventListener(
        event,
        () => {
          pointer = -1;
        },
        options,
      );
  }
  update() {
    if (this.revision === this.inventory.revision) return;
    this.revision = this.inventory.revision;
    for (const item of COSMETICS) {
      const button = this.buttons.get(item.id)!,
        owned = this.inventory.owned.has(item.id),
        equipped = this.inventory.equipped[item.category] === item.id;
      button.dataset.owned = String(owned);
      button.setAttribute("aria-pressed", String(equipped));
      button.querySelector(".card-price")!.textContent = equipped
        ? "НАДЕТО ✓"
        : owned
          ? "НАДЕТЬ"
          : String(item.price);
      if (!owned) {
        const icon = document.createElement("img");
        icon.src = item.currency === 0 ? coinIcon : diamondIcon;
        icon.alt = item.currency === 0 ? "монет" : "алмазов";
        icon.className = "currency-icon";
        icon.width = 14;
        icon.height = 14;
        button.querySelector(".card-price")!.append(icon);
      }
      button.setAttribute(
        "aria-label",
        `${item.name}, ${equipped ? "надето" : owned ? "надеть" : `${item.price} ${item.currency === 0 ? "монет" : "алмазов"}`}`,
      );
    }
  }
  dispose() {
    this.abort.abort();
    for (const section of this.sections) section.remove();
    this.sections.length = 0;
    this.buttons.clear();
  }
}

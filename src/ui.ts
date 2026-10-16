import type { Phase, Simulation } from "./simulation";
import { ShopUI } from "./shop-ui";
import type { CosmeticCategory, CosmeticInventory } from "./cosmetics";
import type { Wallet } from "./progression";

/** DOM ownership and dirty counters live outside simulation/rendering. */
export class GameUI {
  private readonly app = this.element("app");
  private readonly overlay = this.element("overlay");
  readonly action = this.element<HTMLButtonElement>("action");
  readonly pauseButton = this.element<HTMLButtonElement>("pause");
  readonly cameraButton = this.element<HTMLButtonElement>("camera-mode");
  private readonly title = this.element("title");
  private readonly description = this.element("description");
  private readonly chapter = this.element("chapter");
  private readonly counters = [
    this.element("coins"),
    this.element("diamonds"),
    this.element("lives"),
    this.element("distance"),
    this.element("best"),
  ];
  private readonly shown = new Float64Array(5).fill(-1);
  private readonly hearts = this.element("lives").querySelectorAll("img");
  best = 0;
  phase: Phase | "loading" | "error" = "loading";
  private shop?: ShopUI;
  private inventory?: CosmeticInventory;
  private cosmeticRevision = -1;
  constructor() {
    try {
      this.best = Math.max(
        0,
        Number(localStorage.getItem("dinoplat-3d-best")) || 0,
      );
    } catch {
      /* Storage optional. */
    }
  }
  private element<T extends HTMLElement = HTMLElement>(id: string) {
    return document.getElementById(id) as T;
  }
  private format(value: number) {
    if (value >= 1e6) return `${Math.floor(value / 1000)}k`;
    return String(Math.floor(value));
  }
  loading() {
    this.action.disabled = true;
    this.action.textContent = "ЗАГРУЗКА…";
  }
  initializeShop(
    inventory: CosmeticInventory,
    wallet: Wallet,
    choose: (id: string) => void,
    remove: (category: CosmeticCategory) => void,
  ) {
    this.inventory = inventory;
    this.shop = new ShopUI(
      this.element("shop-panel"),
      inventory,
      wallet,
      choose,
      remove,
    );
  }
  selectSection(section: "home" | "shop" | "settings") {
    this.element("menu-panel").hidden = section !== "home";
    this.element("shop-panel").hidden = section !== "shop";
    this.element("settings-panel").hidden = section !== "settings";
    this.app.dataset.menu = section;
    for (const name of ["home", "shop", "settings"])
      this.element(`${name}-toggle`).setAttribute(
        "aria-pressed",
        String(name === section),
      );
  }
  shopMessage(message: string) {
    this.element("shop-message").textContent = message;
  }
  update(game: Simulation) {
    const values0 = game.wallet.coins,
      values1 = game.wallet.diamonds,
      values2 = game.health.lives,
      values3 = Math.floor(game.distance),
      values4 = this.best;
    for (let i = 0; i < 5; i++) {
      const value =
        i === 0
          ? values0
          : i === 1
            ? values1
            : i === 2
              ? values2
              : i === 3
                ? values3
                : values4;
      if (this.shown[i] !== value) {
        this.shown[i] = value;
        if (i === 2) {
          this.counters[i].setAttribute("aria-label", `${value} из 3 жизней`);
          for (let h = 0; h < this.hearts.length; h++)
            this.hearts[h].classList.toggle("empty-heart", h >= value);
        } else {
          this.counters[i].textContent = this.format(value);
          if (i === 0)
            this.element("menu-coins").textContent = this.format(value);
          if (i === 1)
            this.element("menu-diamonds").textContent = this.format(value);
        }
      }
    }
    this.shop?.update();
    if (this.inventory && this.cosmeticRevision !== this.inventory.revision) {
      this.cosmeticRevision = this.inventory.revision;
      (this.element("menu-avatar") as HTMLImageElement).src =
        `${import.meta.env.BASE_URL}shop/${this.inventory.equipped.dino}.webp`;
    }
  }
  show(game: Simulation) {
    const phase = game.phase;
    this.phase = phase;
    this.app.dataset.phase = phase;
    this.overlay.hidden = phase === "running";
    this.showSettings(false);
    this.element("leave-run").hidden = phase !== "paused";
    this.pauseButton.disabled = phase !== "running" && phase !== "paused";
    this.cameraButton.disabled = phase !== "running" && phase !== "paused";
    this.pauseButton.setAttribute(
      "aria-label",
      phase === "paused" ? "Продолжить" : "Пауза",
    );
    this.element("result").hidden = phase !== "over";
    this.action.disabled = false;
    if (phase === "over") {
      this.best = Math.max(this.best, Math.floor(game.distance));
      try {
        localStorage.setItem("dinoplat-3d-best", String(this.best));
      } catch {
        /* Optional. */
      }
      this.title.innerHTML = "Новый мир.<br /><em>Новый забег!</em>";
      this.description.textContent = "Твой дино готов к приключениям.";
      this.chapter.textContent = "DINO RUN · ГЛАВНАЯ";
      this.element("final-distance").textContent = this.format(game.distance);
      this.action.textContent = "НАЧАТЬ ЗАБЕГ →";
      this.element("live").textContent =
        `Конец игры. ${Math.floor(game.distance)} метров.`;
    } else if (phase === "paused") {
      this.title.innerHTML = "Отдохнём?<br /><em>Дино ждёт!</em>";
      this.description.textContent = "Приключение продолжится с этого места.";
      this.chapter.textContent = "DINO RUN · ПАУЗА";
      this.action.textContent = "ПРОДОЛЖИТЬ →";
    } else if (phase === "ready") {
      this.action.textContent = "ИГРАТЬ →";
    }
    this.element("menu-best").textContent = this.format(this.best);
    this.update(game);
  }
  showSettings(visible: boolean) {
    this.selectSection(visible ? "settings" : "home");
  }
  error(error: unknown) {
    this.selectSection("home");
    this.phase = "error";
    this.app.dataset.phase = "error";
    this.overlay.hidden = false;
    this.title.innerHTML = "Ой!<br /><em>Не вышло</em>";
    this.description.textContent =
      error instanceof Error ? error.message : "Не удалось запустить игру.";
    this.action.disabled = false;
    this.action.textContent = "ЕЩЁ РАЗ";
  }
  graphicsLost() {
    this.selectSection("home");
    this.overlay.hidden = false;
    this.action.disabled = true;
    this.title.textContent = "Графика на паузе";
    this.description.textContent = "Ждём восстановления изображения…";
  }
  dispose() {
    this.shop?.dispose();
  }
}

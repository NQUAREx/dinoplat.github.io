import "./style.css";
import WebGL from "three/addons/capabilities/WebGL.js";
import { Simulation, STEP } from "./simulation";
import { Input } from "./input";
import { ModelLibrary } from "./models";
import { TerrainTexture } from "./terrain-texture";
import { View } from "./view";
import { GameUI } from "./ui";
import { Haptics } from "./haptics";
import { GameSettings } from "./settings";
import { GameSound } from "./sound";
import { MobileBrowser } from "./mobile-browser";
import { CurrencyCookies } from "./currency-cookies";
import { GameEvent } from "./events";
import { CosmeticInventory } from "./cosmetics";

class GameApplication {
  readonly game = new Simulation(1979);
  private readonly ui = new GameUI();
  private readonly canvas = document.getElementById(
    "game",
  ) as HTMLCanvasElement;
  private readonly abort = new AbortController();
  private readonly landscape = matchMedia("(orientation: landscape)");
  private readonly haptics = new Haptics(this.game.events);
  private readonly sound = new GameSound(this.game.events);
  private readonly settings = new GameSettings();
  private view?: View;
  private input?: Input;
  private mobile?: MobileBrowser;
  private currency?: CurrencyCookies;
  private cosmetics?: CosmeticInventory;
  private alive = true;
  private contextLost = false;
  private previous = 0;
  private accumulator = 0;
  private resumePhase: "running" | "dying" = "running";
  private raf = 0;
  private readonly debug = new URLSearchParams(location.search).has("debug");

  async initialize() {
    if (!MobileBrowser.supported()) {
      document.body.dataset.device = "unsupported";
      return;
    }
    this.mobile = new MobileBrowser(
      () => this.resizeViewport(),
      () => {
        this.pause();
        this.stopFrames();
      },
    );
    this.ui.loading();
    this.sound.preload();
    this.currency = new CurrencyCookies(
      this.game.wallet,
      this.game.events,
      new URL(import.meta.env.BASE_URL, location.href).pathname,
    );
    this.cosmetics = new CosmeticInventory(this.game.wallet);
    this.ui.initializeShop(
      this.cosmetics,
      (id) => {
        const result = this.cosmetics!.choose(id);
        this.ui.shopMessage(
          result === "funds"
            ? "Не хватает монет или алмазов"
            : result === "purchased"
              ? "Куплено и надето!"
              : "Надето!",
        );
        this.sound.unlock();
        this.sound.menu(
          result === "funds" ? "error" : result === "purchased" ? "buy" : "ui",
        );
        this.currency?.flush();
        this.view?.applyCosmetics(this.cosmetics!);
        this.ui.update(this.game);
        this.view?.draw();
      },
      (category) => {
        this.cosmetics!.remove(category);
        this.sound.unlock();
        this.sound.menu("ui");
        this.view?.applyCosmetics(this.cosmetics!);
        this.ui.update(this.game);
        this.view?.draw();
      },
    );
    try {
      if (!WebGL.isWebGL2Available())
        throw new Error("Для игры нужен мобильный браузер с WebGL 2.");
      const [model, ground] = await Promise.allSettled([
        ModelLibrary.load(),
        TerrainTexture.load(),
      ]);
      if (
        model.status === "rejected" ||
        ground.status === "rejected" ||
        !this.alive
      ) {
        if (model.status === "fulfilled") model.value.dispose();
        if (ground.status === "fulfilled") ground.value.dispose();
        if (!this.alive) return;
        throw model.status === "rejected"
          ? model.reason
          : (ground as PromiseRejectedResult).reason;
      }
      try {
        this.view = new View(
          this.canvas,
          model.value,
          ground.value,
          this.game,
          () => this.schedule(),
        );
      } catch (error) {
        model.value.dispose();
        ground.value.dispose();
        throw error;
      }
      await this.view.initialize();
      this.view.applyCosmetics(this.cosmetics);
      if (!this.alive) return;
      this.input = new Input(
        this.canvas,
        (direction) => {
          if (!this.landscape.matches || direction === 0)
            this.game.move(direction);
        },
        () => {
          if (!this.landscape.matches) this.game.jump();
        },
        () => {
          if (!this.landscape.matches) this.game.down();
        },
      );
      this.bind();
      this.game.events.on(GameEvent.Hit, () => this.input?.clear());
      this.applySettings();
      this.ui.show(this.game);
      this.schedule();
      if (this.debug)
        Object.assign(window, {
          __runner: {
            game: this.game,
            start: () => this.start(),
            pause: () => this.pause(),
            stats: () => this.view!.stats(),
            render: () => this.view!.draw(),
            camera: this.view.rig,
            lighting: this.view.lighting,
            settings: this.settings,
            audio: () => this.sound.stats(),
            cosmetics: this.cosmetics,
            mobile: () => this.mobile!.stats(),
            snapshot: () => ({
              phase: this.game.phase,
              x: this.game.x,
              y: this.game.y,
              diving: this.game.diving,
              crouch: this.game.crouch,
              bodyHeight: this.game.bodyHeight,
              steering: this.game.steering,
              distance: this.game.distance,
              speed: this.game.speed,
              lives: this.game.health.lives,
              coins: this.game.wallet.coins,
              diamonds: this.game.wallet.diamonds,
              orientationBlocked: this.landscape.matches,
              terrainSegment: this.game.terrain.segment,
              terrainCurrent: this.game.terrain.current,
              terrainNext: this.game.terrain.next,
              ...this.view!.stats(),
            }),
          },
        });
    } catch (error) {
      if (!this.alive) return;
      this.view?.dispose();
      this.view = undefined;
      this.ui.error(error);
      this.ui.action.addEventListener(
        "pointerup",
        (event) => {
          if (event.pointerType === "touch") location.reload();
        },
        { signal: this.abort.signal },
      );
      console.error(error);
    }
  }
  private bind() {
    const options = { signal: this.abort.signal };
    const touchButton = (button: HTMLButtonElement, handler: () => void) => {
      button.addEventListener(
        "pointerup",
        (event) => {
          if (
            event.pointerType !== "touch" ||
            !event.isPrimary ||
            button.disabled
          )
            return;
          event.preventDefault();
          this.sound.unlock();
          if (button.id !== "sound") this.sound.menu("ui");
          handler();
          this.ui.update(this.game);
          // Present the correct scene alongside menu DOM changes on WebKit;
          // otherwise its compositor can show the old world through Home.
          if (this.game.phase !== "running" && this.game.phase !== "dying")
            this.view?.draw();
          if (
            this.game.phase === "running" ||
            this.game.phase === "dying" ||
            this.view?.rig.transitioning
          )
            this.schedule();
        },
        options,
      );
    };
    touchButton(this.ui.action, () => this.start());
    touchButton(this.ui.cameraButton, () => {
      if (!this.view) return;
      this.input?.clear();
      const rig = this.view.rig;
      rig.firstPerson = !rig.firstPerson;
      this.ui.cameraButton.setAttribute(
        "aria-pressed",
        String(rig.firstPerson),
      );
      this.ui.cameraButton.setAttribute(
        "aria-label",
        rig.firstPerson ? "Вид сзади" : "Вид от первого лица",
      );
      this.view.draw(1, 0);
      if (this.game.phase !== "running") this.previous = performance.now();
      this.schedule();
    });
    touchButton(
      document.getElementById("home-toggle") as HTMLButtonElement,
      () => this.ui.selectSection("home"),
    );
    touchButton(
      document.getElementById("shop-toggle") as HTMLButtonElement,
      () => this.ui.selectSection("shop"),
    );
    touchButton(document.getElementById("resume") as HTMLButtonElement, () =>
      this.start(),
    );
    touchButton(
      document.getElementById("pause-settings") as HTMLButtonElement,
      () => this.ui.showSettings(true),
    );
    touchButton(
      document.getElementById("fullscreen") as HTMLButtonElement,
      () => {
        void this.mobile?.enterFullscreen();
      },
    );
    touchButton(this.ui.pauseButton, () =>
      this.game.phase === "paused" ? this.start() : this.pause(),
    );
    const vibration = document.getElementById("vibration") as HTMLButtonElement;
    touchButton(vibration, () => {
      this.settings.vibration = !this.settings.vibration;
      this.applySettings();
    });
    touchButton(document.getElementById("sound") as HTMLButtonElement, () => {
      this.settings.sound = !this.settings.sound;
      this.applySettings();
      if (this.settings.sound) this.sound.unlock();
    });
    touchButton(document.getElementById("music") as HTMLButtonElement, () => {
      this.settings.music = !this.settings.music;
      this.applySettings();
      this.sound.unlock();
    });
    touchButton(
      document.getElementById("settings-toggle") as HTMLButtonElement,
      () => this.ui.showSettings(true),
    );
    touchButton(
      document.getElementById("settings-back") as HTMLButtonElement,
      () => this.ui.showSettings(false),
    );
    this.landscape.addEventListener(
      "change",
      () => this.mobile?.requestResize(),
      options,
    );
    window.addEventListener("blur", () => this.pause(), options);
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) {
          this.pause();
          this.stopFrames();
        } else this.schedule();
      },
      options,
    );
    this.canvas.addEventListener(
      "webglcontextlost",
      (event) => {
        event.preventDefault();
        this.contextLost = true;
        this.pause();
        this.stopFrames();
        this.ui.graphicsLost();
      },
      options,
    );
    this.canvas.addEventListener(
      "webglcontextrestored",
      () => {
        this.contextLost = false;
        this.view?.restoreContext();
        this.ui.show(this.game);
        this.view?.resize();
        this.schedule();
      },
      options,
    );
    window.addEventListener(
      "pagehide",
      (event) => {
        if (!event.persisted) this.dispose();
      },
      options,
    );
  }
  private resizeViewport() {
    if (this.landscape.matches) {
      this.pause();
      this.stopFrames();
    }
    this.view?.resize();
    this.input?.resize();
    this.schedule();
  }
  private applySettings() {
    this.haptics.enabled = this.settings.vibration;
    this.sound.configure(this.settings.sound, this.settings.music);
    if (!this.haptics.enabled) this.haptics.stop();
    if (this.view) this.view.rig.shakeMultiplier = this.settings.shake;
    for (const key of ["vibration", "sound", "music"] as const) {
      const button = document.getElementById(key)!;
      button.setAttribute("aria-pressed", String(this.settings[key]));
      button.textContent = `${key === "vibration" ? "ВИБРАЦИЯ" : key === "music" ? "МУЗЫКА" : "ЗВУК"}: ${this.settings[key] ? "ДА" : "НЕТ"}`;
    }
    this.settings.save();
  }
  start() {
    if (
      !this.alive ||
      this.contextLost ||
      this.landscape.matches ||
      this.game.phase === "running" ||
      this.game.phase === "dying"
    )
      return;
    void this.mobile?.enterFullscreen();
    if (this.game.phase !== "paused")
      this.game.reset((Math.random() * 0xffffffff) >>> 0);
    this.game.phase =
      this.game.phase === "paused" ? this.resumePhase : "running";
    this.haptics.stop();
    this.sound.unlock();
    this.sound.setRunning(this.game.phase === "running");
    this.input?.clear();
    this.previous = this.accumulator = 0;
    this.ui.show(this.game);
    this.schedule();
  }
  pause() {
    this.currency?.flush();
    this.input?.clear();
    this.haptics.stop();
    this.sound.suspend();
    this.sound.setRunning(false);
    if (this.game.phase !== "running" && this.game.phase !== "dying") return;
    this.resumePhase = this.game.phase;
    this.game.phase = "paused";
    this.previous = this.accumulator = 0;
    this.ui.show(this.game);
  }
  private stopFrames() {
    cancelAnimationFrame(this.raf);
    this.raf = this.previous = this.accumulator = 0;
  }
  private schedule() {
    if (
      !this.raf &&
      this.alive &&
      !document.hidden &&
      !this.contextLost &&
      !this.landscape.matches
    )
      this.raf = requestAnimationFrame(this.frame);
  }
  private readonly frame = (now: number) => {
    this.raf = 0;
    if (
      !this.alive ||
      !this.view ||
      document.hidden ||
      this.contextLost ||
      this.landscape.matches
    )
      return;
    const dt = this.previous ? (now - this.previous) / 1000 : 0;
    this.previous = now;
    if (
      dt > 0.5 &&
      (this.game.phase === "running" || this.game.phase === "dying")
    )
      this.pause();
    this.input?.update(now);
    if (this.game.phase === "running" || this.game.phase === "dying") {
      this.accumulator += Math.min(dt, 0.25);
      while (
        this.accumulator >= STEP &&
        (this.game.phase === "running" || this.game.phase === "dying")
      ) {
        this.game.step(STEP);
        this.accumulator -= STEP;
      }
      this.view.adapt(dt);
    }
    if (this.ui.phase !== this.game.phase) {
      if (this.game.phase !== "running") this.sound.setRunning(false);
      this.input?.clear();
      this.ui.show(this.game);
    }
    this.ui.update(this.game);
    this.view.draw(
      this.game.phase === "running" || this.game.phase === "dying"
        ? this.accumulator / STEP
        : 1,
      Math.min(dt, 0.25),
    );
    if (
      this.game.phase === "running" ||
      this.game.phase === "dying" ||
      this.view.rig.transitioning
    )
      this.schedule();
  };
  dispose() {
    if (!this.alive) return;
    this.alive = false;
    this.stopFrames();
    this.abort.abort();
    this.mobile?.dispose();
    this.currency?.dispose();
    this.input?.dispose();
    this.haptics.dispose();
    this.sound.dispose();
    this.ui.dispose();
    this.view?.dispose();
    this.view = undefined;
    this.game.events.dispose();
    if (this.debug)
      delete (window as unknown as Record<string, unknown>).__runner;
  }
}

const application = new GameApplication();
void application.initialize();
if (import.meta.hot) import.meta.hot.dispose(() => application.dispose());

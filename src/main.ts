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
  private alive = true;
  private contextLost = false;
  private previous = 0;
  private accumulator = 0;
  private raf = 0;
  private readonly debug = new URLSearchParams(location.search).has("debug");

  async initialize() {
    if (
      navigator.maxTouchPoints < 1 ||
      !matchMedia("(pointer: coarse)").matches
    ) {
      document.body.dataset.device = "unsupported";
      return;
    }
    this.ui.loading();
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
        this.view = new View(this.canvas, model.value, ground.value, this.game);
      } catch (error) {
        model.value.dispose();
        ground.value.dispose();
        throw error;
      }
      await this.view.initialize();
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
      );
      this.bind();
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
            settings: this.settings,
            audio: () => this.sound.stats(),
            snapshot: () => ({
              phase: this.game.phase,
              x: this.game.x,
              y: this.game.y,
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
          handler();
        },
        options,
      );
    };
    touchButton(this.ui.action, () => this.start());
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
    touchButton(
      document.getElementById("settings-toggle") as HTMLButtonElement,
      () => this.ui.showSettings(true),
    );
    touchButton(
      document.getElementById("settings-back") as HTMLButtonElement,
      () => this.ui.showSettings(false),
    );
    const shake = document.getElementById("shake") as HTMLInputElement;
    shake.addEventListener(
      "input",
      () => {
        this.settings.shake = Math.max(
          0,
          Math.min(3, Number(shake.value) || 0),
        );
        this.applySettings();
      },
      options,
    );
    const resize = () => {
      if (this.landscape.matches) {
        this.pause();
        this.stopFrames();
      }
      this.view?.resize();
      this.schedule();
    };
    window.addEventListener("resize", resize, options);
    this.landscape.addEventListener("change", resize, options);
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
        if (this.game.phase === "ready") this.game.phase = "paused";
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
  private applySettings() {
    this.haptics.enabled = this.settings.vibration;
    this.sound.enabled = this.settings.sound;
    if (!this.haptics.enabled) this.haptics.stop();
    if (!this.sound.enabled) this.sound.stop();
    if (this.view) this.view.rig.shakeMultiplier = this.settings.shake;
    for (const key of ["vibration", "sound"] as const) {
      const button = document.getElementById(key)!;
      button.setAttribute("aria-pressed", String(this.settings[key]));
      button.textContent = `${key === "vibration" ? "ВИБРАЦИЯ" : "ЗВУК"}: ${this.settings[key] ? "ДА" : "НЕТ"}`;
    }
    (document.getElementById("shake") as HTMLInputElement).value = String(
      this.settings.shake,
    );
    document.getElementById("shake-value")!.textContent =
      `${Math.round(this.settings.shake * 100)}%`;
    this.settings.save();
  }
  start() {
    if (
      !this.alive ||
      this.contextLost ||
      this.landscape.matches ||
      this.game.phase === "running"
    )
      return;
    if (this.game.phase !== "paused")
      this.game.reset((Math.random() * 0xffffffff) >>> 0);
    this.game.phase = "running";
    this.haptics.stop();
    this.sound.unlock();
    this.input?.clear();
    this.previous = this.accumulator = 0;
    this.ui.show(this.game);
    this.schedule();
  }
  pause() {
    this.input?.clear();
    this.haptics.stop();
    this.sound.stop();
    if (this.game.phase !== "running") return;
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
    if (dt > 0.5 && this.game.phase === "running") this.pause();
    this.input?.update(now);
    if (this.game.phase === "running") {
      this.accumulator += Math.min(dt, 0.25);
      while (this.accumulator >= STEP && this.game.phase === "running") {
        this.game.step(STEP);
        this.accumulator -= STEP;
      }
      this.view.adapt(dt);
    }
    if (this.ui.phase !== this.game.phase) {
      this.input?.clear();
      this.ui.show(this.game);
    }
    this.ui.update(this.game);
    this.view.draw(
      this.game.phase === "running" ? this.accumulator / STEP : 1,
      Math.min(dt, 0.25),
    );
    if (this.game.phase === "running") this.schedule();
  };
  dispose() {
    if (!this.alive) return;
    this.alive = false;
    this.stopFrames();
    this.abort.abort();
    this.input?.dispose();
    this.haptics.dispose();
    this.sound.dispose();
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

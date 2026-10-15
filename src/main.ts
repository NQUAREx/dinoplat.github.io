import "./style.css";
import { Simulation, STEP, type Phase } from "./simulation";
import { Input } from "./input";
import { View } from "./view";

const element = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const canvas = element<HTMLCanvasElement>("game");
const overlay = element("overlay");
const action = element<HTMLButtonElement>("action");
const pauseButton = element<HTMLButtonElement>("pause");
const distanceText = element("distance");
const bestText = element("best");
const title = element("title");
const description = element("description");
const chapter = element("chapter");
const result = element("result");
const game = new Simulation(1979);
let best = 0;
try {
  best = Math.max(0, Number(localStorage.getItem("dinoplat-3d-best")) || 0);
} catch {
  /* Storage is optional. */
}
bestText.textContent = String(Math.floor(best));

function boot() {
  const view = new View(canvas);
  const abort = new AbortController();
  let previous = 0,
    accumulator = 0,
    raf = 0;
  let shownPhase: Phase = "ready";
  let displayedDistance = -1;
  let contextLost = false;
  let alive = true;

  function show() {
    const phase = game.phase;
    overlay.hidden = phase === "running";
    pauseButton.disabled = phase !== "running" && phase !== "paused";
    pauseButton.setAttribute(
      "aria-label",
      phase === "paused" ? "Продолжить" : "Пауза",
    );
    pauseButton.textContent = "";
    pauseButton.classList.toggle("is-paused", phase === "paused");
    result.hidden = phase !== "over";
    if (phase === "over") {
      const meters = Math.floor(game.distance);
      best = Math.max(best, meters);
      try {
        localStorage.setItem("dinoplat-3d-best", String(best));
      } catch {
        /* Optional. */
      }
      bestText.textContent = String(best);
      title.innerHTML = "Ещё<br /><em>попытку?</em>";
      description.textContent = "Каждый забег — новая возможность.";
      chapter.textContent = "ЗАБЕГ ЗАВЕРШЁН";
      element("final-distance").textContent = String(meters);
      action.innerHTML = "Бежать снова <span>→</span>";
      element("live").textContent = `Конец игры. ${meters} метров.`;
    } else if (phase === "paused") {
      title.innerHTML = "Можно<br /><em>выдохнуть.</em>";
      description.textContent = "Твой забег на паузе. Продолжим?";
      chapter.textContent = "ПАУЗА";
      action.innerHTML = "Продолжить <span>→</span>";
    }
    element("hint").textContent =
      phase === "running"
        ? "← → / A D · ПОЛОСЫ     ↑ / ПРОБЕЛ · ПРЫЖОК"
        : "ТВОЙ ТЕМП. ТВОЙ РЕКОРД.";
    shownPhase = phase;
  }

  function schedule() {
    if (!raf && alive && !document.hidden && !contextLost)
      raf = requestAnimationFrame(frame);
  }
  function start() {
    if (contextLost || game.phase === "running") return;
    if (game.phase !== "paused") game.reset((Math.random() * 0xffffffff) >>> 0);
    game.phase = "running";
    previous = accumulator = 0;
    show();
    canvas.focus();
    schedule();
  }
  function pause() {
    if (game.phase === "paused") {
      start();
      return;
    }
    if (game.phase !== "running") return;
    game.phase = "paused";
    previous = accumulator = 0;
    show();
  }
  function frame(now: number) {
    raf = 0;
    if (!alive || document.hidden || contextLost) return;
    const dt = previous ? (now - previous) / 1000 : 0;
    previous = now;
    // Treat a large interruption as a pause instead of an unseen fatal advance.
    if (dt > 0.5 && game.phase === "running") pause();
    if (game.phase === "running") {
      accumulator += Math.min(dt, 0.25);
      while (accumulator >= STEP && game.phase === "running") {
        game.step(STEP);
        accumulator -= STEP;
      }
      view.adapt(dt);
    }
    if (shownPhase !== game.phase) show();
    const meters = Math.floor(game.distance);
    if (meters !== displayedDistance) {
      distanceText.textContent = String(meters);
      displayedDistance = meters;
    }
    view.draw(game);
    if (game.phase === "running") schedule();
  }

  const input = new Input(
    canvas,
    (direction) => game.move(direction),
    () => game.jump(),
    pause,
    start,
  );
  const options = { signal: abort.signal };
  // Some mobile browsers suppress a compatibility click just after a swipe.
  // Handle touch release directly; suppress its duplicate click, not keyboard clicks.
  function bindButton(button: HTMLButtonElement, handler: () => void) {
    let lastTouch = -Infinity;
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
        lastTouch = performance.now();
        handler();
      },
      options,
    );
    button.addEventListener(
      "click",
      (event) => {
        if (event.detail !== 0 && performance.now() - lastTouch < 700) return;
        handler();
      },
      options,
    );
  }
  bindButton(action, start);
  bindButton(pauseButton, pause);
  window.addEventListener(
    "resize",
    () => {
      view.resize();
      schedule();
    },
    options,
  );
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) {
        if (game.phase === "running") pause();
        cancelAnimationFrame(raf);
        raf = previous = accumulator = 0;
      } else schedule();
    },
    options,
  );
  window.addEventListener(
    "blur",
    () => {
      if (game.phase === "running") pause();
    },
    options,
  );
  canvas.addEventListener(
    "webglcontextlost",
    (event) => {
      event.preventDefault();
      contextLost = true;
      if (game.phase === "running") pause();
      cancelAnimationFrame(raf);
      raf = 0;
      overlay.hidden = false;
      action.disabled = true;
      title.textContent = "Графика на паузе";
      description.textContent = "Ждём восстановления графического контекста…";
    },
    options,
  );
  canvas.addEventListener(
    "webglcontextrestored",
    () => {
      contextLost = false;
      action.disabled = false;
      previous = 0;
      if (game.phase === "ready") game.phase = "paused";
      show();
      view.resize();
      schedule();
    },
    options,
  );
  show();
  schedule();

  // Explicit diagnostics opt-in; no automation or mutable game state in normal play.
  const debug = new URLSearchParams(location.search).has("debug");
  if (debug) {
    Object.assign(window, {
      __runner: {
        game,
        start,
        pause,
        stats: () => view.stats(),
        snapshot: () => ({
          phase: game.phase,
          lane: game.lane,
          x: game.x,
          y: game.y,
          distance: game.distance,
          speed: game.speed,
          ...view.stats(),
        }),
      },
    });
  }
  function dispose() {
    alive = false;
    cancelAnimationFrame(raf);
    abort.abort();
    input.dispose();
    view.dispose();
    if (debug) delete (window as unknown as Record<string, unknown>).__runner;
  }
  window.addEventListener(
    "pagehide",
    (event) => {
      if (!event.persisted) dispose();
    },
    options,
  );
  if (import.meta.hot) import.meta.hot.dispose(dispose);
}

try {
  boot();
} catch (error) {
  title.textContent = "Не удалось запустить 3D";
  description.textContent =
    "Нужен браузер с WebGL. Проверь аппаратное ускорение или попробуй другой браузер.";
  action.textContent = "Попробовать снова";
  action.addEventListener("click", () => location.reload());
  console.error(error);
}

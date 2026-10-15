import "./style.css";
import { Simulation, STEP, type Phase } from "./simulation";
import { Input } from "./input";
import { View } from "./view";
import WebGL from "three/addons/capabilities/WebGL.js";
import { loadDinosaurGeometry } from "./dinosaur";
import { loadSandTexture } from "./sand";

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
const app = element("app");
const game = new Simulation(1979);
let best = 0;
try {
  best = Math.max(0, Number(localStorage.getItem("dinoplat-3d-best")) || 0);
} catch {
  /* Storage is optional. */
}
bestText.textContent = String(Math.floor(best));
let superseded = false;
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    superseded = true;
  });

async function boot() {
  if (!WebGL.isWebGL2Available())
    throw new Error(
      "Для этой версии игры нужен WebGL 2. Включи аппаратное ускорение или попробуй более новый браузер.",
    );
  const initialAction = action.innerHTML;
  action.disabled = true;
  action.textContent = "ЗАГРУЗКА…";
  const [modelResult, sandResult] = await Promise.allSettled([
    loadDinosaurGeometry(),
    loadSandTexture(),
  ]);
  if (modelResult.status === "rejected" || sandResult.status === "rejected") {
    if (modelResult.status === "fulfilled") modelResult.value.dispose();
    if (sandResult.status === "fulfilled") sandResult.value.dispose();
    throw modelResult.status === "rejected"
      ? modelResult.reason
      : (sandResult as PromiseRejectedResult).reason;
  }
  const geometry = modelResult.value,
    sand = sandResult.value;
  // HMR can replace the module while its model request is still in flight.
  if (superseded) {
    geometry.dispose();
    sand.dispose();
    return;
  }
  let view: View;
  try {
    view = new View(canvas, geometry, sand);
  } catch (error) {
    geometry.dispose();
    sand.dispose();
    throw error;
  }
  action.innerHTML = initialAction;
  action.disabled = false;
  const abort = new AbortController();
  let previous = 0,
    accumulator = 0,
    raf = 0;
  let shownPhase: Phase = "ready";
  let displayedDistance = -1;
  let contextLost = false;
  let alive = true;
  const landscapeQuery = matchMedia(
    "(orientation: landscape) and (pointer: coarse)",
  );
  let orientationBlocked = landscapeQuery.matches;

  function show() {
    const phase = game.phase;
    app.dataset.phase = phase;
    overlay.hidden = phase === "running";
    pauseButton.disabled = phase !== "running" && phase !== "paused";
    pauseButton.setAttribute(
      "aria-label",
      phase === "paused" ? "Продолжить" : "Пауза",
    );
    pauseButton.textContent = phase === "paused" ? "ПРОДОЛЖИТЬ" : "ПАУЗА";
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
      title.innerHTML = "Вот это<br /><em>забег!</em>";
      description.textContent = "Дино готов к новому приключению!";
      chapter.textContent = "МОЛОДЕЦ!";
      element("final-distance").textContent = String(meters);
      action.innerHTML = 'ЕЩЁ ЗАБЕГ <span aria-hidden="true">→</span>';
      element("live").textContent = `Конец игры. ${meters} метров.`;
    } else if (phase === "paused") {
      title.innerHTML = "Отдохнём?<br /><em>Дино ждёт!</em>";
      description.textContent = "Набирайся сил и беги дальше.";
      chapter.textContent = "ПАУЗА";
      action.innerHTML = 'ПРОДОЛЖИТЬ <span aria-hidden="true">→</span>';
    }
    element("hint").textContent =
      phase === "running"
        ? "← → ДВИЖЕНИЕ · ↑ ПРЫЖОК"
        : "БЕГИ СВОБОДНО · ПРЫГАЙ ДАЛЬШЕ";
    element("menu-best").textContent = String(best);
    shownPhase = phase;
  }

  function schedule() {
    if (
      !raf &&
      alive &&
      !document.hidden &&
      !contextLost &&
      !orientationBlocked
    )
      raf = requestAnimationFrame(frame);
  }
  function start() {
    if (contextLost || orientationBlocked || game.phase === "running") return;
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
    if (!alive || document.hidden || contextLost || orientationBlocked) return;
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
    (direction) => {
      if (!orientationBlocked) game.move(direction);
    },
    () => {
      if (!orientationBlocked) game.jump();
    },
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
  function resizePortrait() {
    orientationBlocked = landscapeQuery.matches;
    if (orientationBlocked) {
      if (game.phase === "running") pause();
      cancelAnimationFrame(raf);
      raf = previous = accumulator = 0;
    }
    view.resize();
    schedule();
  }
  window.addEventListener("resize", resizePortrait, options);
  landscapeQuery.addEventListener("change", resizePortrait, options);
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
          x: game.x,
          targetX: game.targetX,
          heading: game.heading,
          movingX: game.movingX,
          y: game.y,
          distance: game.distance,
          speed: game.speed,
          orientationBlocked,
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

boot().catch((error: unknown) => {
  if (superseded) return;
  app.dataset.phase = "error";
  title.innerHTML = "Ой!<br /><em>Не вышло</em>";
  description.textContent =
    error instanceof Error
      ? error.message
      : "Нужен браузер с WebGL 2. Попробуй перезагрузить страницу.";
  action.disabled = false;
  action.textContent = "Попробовать снова";
  action.addEventListener("click", () => location.reload());
  console.error(error);
});

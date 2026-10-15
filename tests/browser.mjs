import { chromium } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const url = "http://127.0.0.1:4174";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4174",
    "--strictPort",
  ],
  { stdio: "pipe" },
);
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ||
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const phone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};
const errors = [],
  report = {};
async function ready(page) {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /WebGLProgram|VALIDATE_STATUS/.test(message.text())
    )
      errors.push(message.text());
  });
  await page.goto(`${url}/?debug`);
  await page.waitForFunction(() => window.__runner?.stats().textures === 1);
}
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* Server starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await mkdir("test-results", { recursive: true });
  const desktop = await browser.newPage();
  await desktop.goto(`${url}/?debug`);
  await desktop.waitForFunction(
    () => document.body.dataset.device === "unsupported",
  );
  assert.equal(await desktop.evaluate(() => !!window.__runner), false);
  assert.equal(await desktop.locator("#mobile-required").isVisible(), true);
  await desktop.close();
  const page = await browser.newPage(phone);
  await page.addInitScript(() => {
    window.vibrationCalls = [];
    Object.defineProperty(navigator, "vibrate", {
      value(pattern) {
        window.vibrationCalls.push(pattern);
        return true;
      },
    });
  });
  await ready(page);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(
    await page.evaluate(() =>
      document.fonts.check('12px "Press Start 2P"', "Дино вперёд!"),
    ),
    true,
  );
  await page.screenshot({ path: "test-results/mobile-menu.png" });
  await page.click("#action");
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => window.__runner.game.phase), "ready");
  await page.tap("#action");
  await page.evaluate(() => {
    window.__runner.game.health.immunity = 1e9;
  });
  report.initial = await page.evaluate(() => window.__runner.snapshot());
  assert.equal(report.initial.boundaryCount, 0);
  assert.equal(report.initial.obstacleVariants, 6);
  assert.equal(report.initial.loadedPoses, 8);
  assert.equal(report.initial.terrainLayers, 81);
  assert.equal(report.initial.terrainTileMetres, 20);
  assert.equal(report.initial.cameraFov, 50);
  assert.equal(await page.locator("#hint").count(), 0);
  assert.equal(await page.locator(".topbar").isVisible(), false);
  assert.equal(await page.locator(".touch-help").isVisible(), false);
  const hud = await page.locator(".hud").boundingBox(),
    pause = await page.locator("#pause").boundingBox();
  assert.ok(hud.width > 350 && hud.y < 20);
  assert.ok(pause.x < 30 && pause.y > 740);
  assert.equal(await page.locator(".hud .score-box").count(), 5);
  await page.evaluate(() => {
    window.__runner.game.wallet.add(0, 7);
    window.__runner.game.wallet.add(1, 2);
  });
  await page.waitForFunction(
    () =>
      document.querySelector("#coins").textContent === "7" &&
      document.querySelector("#diamonds").textContent === "2",
  );
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x = 330, y = 620) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: ["touchEnd", "touchCancel"].includes(type) ? [] : [{ x, y }],
    });
  // Separate jump gesture: start + move queued together, no hold commits first.
  const beforeJumpX = await page.evaluate(() => window.__runner.game.x);
  await Promise.all([touch("touchStart"), touch("touchMove", 330, 500)]);
  await page.waitForFunction(() => window.__runner.game.y > 0.3);
  assert.equal(await page.evaluate(() => window.__runner.game.x), beforeJumpX);
  assert.equal(await page.evaluate(() => window.__runner.game.steering), 0);
  assert.match(
    await page.evaluate(() => window.__runner.stats().playerState),
    /jump/,
  );
  await touch("touchEnd");
  await page.waitForFunction(() => window.__runner.game.y === 0);
  assert.ok(
    await page.evaluate(() =>
      window.vibrationCalls.some(
        (value) => typeof value === "number" && value > 0,
      ),
    ),
  );
  await touch("touchStart");
  await page.waitForFunction(() => window.__runner.game.x > 6);
  await touch("touchEnd");
  const stopped = await page.evaluate(() => window.__runner.game.x);
  await page.waitForTimeout(180);
  assert.equal(await page.evaluate(() => window.__runner.game.x), stopped);
  assert.ok(stopped > 4.93, "old lateral boundary removed");
  await touch("touchStart", 40);
  await page.waitForFunction(() => window.__runner.game.steering === -1);
  await touch("touchMove", 330);
  await page.waitForFunction(() => window.__runner.game.steering === 1);
  await touch("touchCancel");
  assert.equal(await page.evaluate(() => window.__runner.game.steering), 0);
  const released = await page.evaluate(() => window.__runner.game.x);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Space");
  await page.mouse.click(30, 600);
  assert.equal(await page.evaluate(() => window.__runner.game.x), released);
  await page.screenshot({ path: "test-results/mobile-game.png" });
  report.hud = { width: hud.width, pauseLeft: pause.x, pauseTop: pause.y };
  report.holdBeyondOldBoundary = stopped;

  // All frames/variant buffers are exercised before a resource-growth comparison.
  await page.tap("#pause");
  await page.evaluate(() => {
    const r = window.__runner,
      g = r.game;
    for (let frame = 0; frame < 8; frame++) {
      g.x = g.previousX = 0;
      g.distance = g.previousDistance = frame / 0.9 + 0.1;
      g.world.active.fill(0);
      for (let i = 0; i < 6; i++) {
        g.world.active[i] = 1;
        g.world.kinds[i] = 0;
        g.world.variants[i] = i;
        g.world.x[i] = (i - 2.5) * 1.3;
        g.world.z[i] = g.distance + 8;
        g.world.halfX[i] = 0.55;
        g.world.halfZ[i] = 0.55;
        g.world.height[i] = 1.55;
      }
      r.render();
    }
    g.phase = "over";
    r.render();
    g.phase = "paused";
  });
  await page.screenshot({ path: "test-results/cactus-variants.png" });
  // The visible cactus behind the old -4m cutoff is not discarded.
  await page.evaluate(() => {
    const r = window.__runner,
      g = r.game;
    g.world.active.fill(0);
    g.world.active[0] = 1;
    g.world.variants[0] = 1;
    g.world.x[0] = g.x;
    g.world.z[0] = g.distance - 4.5;
    document.querySelector("#overlay").hidden = true;
    r.render();
  });
  assert.equal(
    await page.evaluate(() => window.__runner.stats().nearestRenderedForward),
    -4.5,
  );
  await page.screenshot({ path: "test-results/trailing-cactus.png" });
  // Floating GPU origin remains bounded after huge lateral/forward travel.
  await page.evaluate(() => {
    const g = window.__runner.game;
    g.x = g.previousX = 1000000.25;
    g.distance = g.previousDistance = 1000500;
    g.world.update(g.x, g.distance);
    g.terrain.advance(g.distance);
    window.__runner.render();
  });
  report.rebased = await page.evaluate(() => window.__runner.snapshot());
  assert.ok(report.rebased.maximumRelativeX < 40);
  assert.ok(Math.abs(report.rebased.cameraX) < 0.2);
  await page.screenshot({ path: "test-results/infinite-world.png" });
  // Painted connectors at both sides of the common stone strip.
  for (const distance of [481, 495, 511, 521]) {
    await page.evaluate((distance) => {
      const g = window.__runner.game;
      g.distance = g.previousDistance = distance;
      g.x = g.previousX = 0;
      g.terrain.reset(1979);
      g.terrain.advance(distance);
      g.world.active.fill(0);
      window.__runner.render();
    }, distance);
    await page.screenshot({ path: `test-results/terrain-${distance}.png` });
  }
  report.atlasSeams = await page.evaluate(async () => {
    const url = performance
      .getEntriesByType("resource")
      .find((entry) => /terrains-.*webp/.test(entry.name)).name;
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1152;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, 1152, 1152).data;
    const at = (layer, x, y) =>
      ((Math.floor(layer / 9) * 128 + y) * 1152 + (layer % 9) * 128 + x) * 4;
    // Variants share the same edge phase, but opposite texels need not be
    // identical: hard-cut periodic quilting preserves natural neighbouring
    // pixels rather than averaging them into blurry grid lines.
    for (let layer = 0; layer < 64; layer++)
      for (let coord = 0; coord < 128; coord++)
        for (let c = 0; c < 3; c++) {
          if (
            pixels[at(layer, 0, coord) + c] !==
            pixels[at(Math.floor(layer / 4) * 4, 0, coord) + c]
          )
            return false;
          if (
            pixels[at(layer, coord, 0) + c] !==
            pixels[at(Math.floor(layer / 4) * 4, coord, 0) + c]
          )
            return false;
        }
    for (let type = 0; type < 16; type++)
      for (let x = 0; x < 128; x++)
        for (let c = 0; c < 3; c++) {
          if (
            pixels[at(65 + type, x, 0) + c] !== pixels[at(type * 4, x, 0) + c]
          )
            return false;
          if (pixels[at(65 + type, x, 127) + c] !== pixels[at(64, x, 127) + c])
            return false;
        }
    return true;
  });
  assert.equal(report.atlasSeams, true);
  // Real collision/lives and game over; immunity isn't allowed to mask the check.
  await page.evaluate(() => {
    window.__runner.game.phase = "over";
    window.__runner.start();
  });
  await page.evaluate(() => {
    const g = window.__runner.game;
    g.health.lives = 1;
    g.health.immunity = 0;
    g.world.active.fill(0);
    g.world.active[0] = 1;
    g.world.kinds[0] = 0;
    g.world.x[0] = g.x;
    g.world.z[0] = g.distance + 0.3;
    g.world.halfX[0] = 0.4;
    g.world.halfZ[0] = 0.4;
    g.world.height[0] = 1.5;
  });
  await page.waitForFunction(() => window.__runner.game.phase === "over");
  assert.equal(await page.locator("#result").isVisible(), true);
  assert.equal(
    await page.evaluate(() => window.__runner.stats().playerState),
    "dead",
  );
  await page.screenshot({ path: "test-results/game-over.png" });
  await page.tap("#action");
  assert.equal(await page.evaluate(() => window.__runner.game.health.lives), 3);
  // Warm dust once after reset (all other buffers already warmed above).
  await page.evaluate(() => window.__runner.game.events.emit(3));
  await page.waitForTimeout(80);
  await cdp.send("HeapProfiler.collectGarbage");
  report.memoryBefore = await page.evaluate(() => ({
    heap: performance.memory?.usedJSHeapSize,
    ...window.__runner.stats(),
  }));
  await page.evaluate(async () => {
    for (let i = 0; i < 100; i++) {
      window.__runner.game.phase = "over";
      window.__runner.start();
      await new Promise(requestAnimationFrame);
    }
  });
  await cdp.send("HeapProfiler.collectGarbage");
  report.memoryAfter = await page.evaluate(() => ({
    heap: performance.memory?.usedJSHeapSize,
    ...window.__runner.stats(),
  }));
  assert.equal(report.memoryBefore.geometries, report.memoryAfter.geometries);
  assert.equal(report.memoryAfter.textures, 1);
  assert.ok(report.memoryAfter.heap - report.memoryBefore.heap < 2000000);
  report.performance = await page.evaluate(async () => {
    const samples = [];
    const began = performance.now();
    let previous = began;
    let target = -1,
      reaction = 0;
    return await new Promise((resolve) => {
      function tick(now) {
        const g = window.__runner.game;
        if (g.phase !== "running") return resolve({ failed: g.phase });
        const row = Math.max(0, Math.ceil((g.distance - 40 - 0.85) / 20));
        if (row !== target) {
          target = row;
          reaction = 0.3;
        }
        reaction -= (now - previous) / 1000;
        const delta = g.world.safeOffset(row) * 2.8 - g.x;
        g.move(reaction <= 0 && Math.abs(delta) > 0.12 ? Math.sign(delta) : 0);
        samples.push(now - previous);
        previous = now;
        if (now - began < 7000) requestAnimationFrame(tick);
        else {
          samples.sort((a, b) => a - b);
          resolve({
            frames: samples.length,
            elapsedMs: now - began,
            meanFrameMs: samples.reduce((a, b) => a + b, 0) / samples.length,
            p95FrameMs: samples[Math.floor(samples.length * 0.95)],
            lives: g.health.lives,
            ...window.__runner.stats(),
          });
        }
      }
      requestAnimationFrame(tick);
    });
  });
  assert.equal(report.performance.failed, undefined);
  assert.equal(report.performance.lives, 3);
  assert.ok(report.performance.calls <= 9);
  await page.screenshot({ path: "test-results/animated-run.png" });
  await page.evaluate(() => {
    const gl = document.querySelector("#game").getContext("webgl2");
    window.testLoss = gl.getExtension("WEBGL_lose_context");
    window.testLoss.loseContext();
  });
  await page.waitForFunction(() => document.querySelector("#action").disabled);
  await page.evaluate(() => window.testLoss.restoreContext());
  await page.waitForFunction(() => !document.querySelector("#action").disabled);
  await page.tap("#action");
  await touch("touchStart", 40);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => window.__runner.game.phase === "paused");
  assert.equal(await page.evaluate(() => window.__runner.game.steering), 0);
  await touch("touchEnd");
  assert.equal(await page.locator("#rotate").isVisible(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () => !window.__runner.snapshot().orientationBlocked,
  );
  await page.tap("#action");
  assert.equal(await page.evaluate(() => window.__runner.game.steering), 0);
  await page.close();

  const small = await browser.newPage({
    ...phone,
    viewport: { width: 320, height: 568 },
  });
  await ready(small);
  await small.evaluate(() => document.fonts.ready);
  await small.screenshot({ path: "test-results/small-menu.png" });
  const bounds = await small.locator(".panel").boundingBox();
  assert.ok(bounds.y > 55 && bounds.y + bounds.height < 568);
  await small.tap("#action");
  await small.screenshot({ path: "test-results/small-game.png" });
  const smallHud = await small.locator(".hud").boundingBox();
  assert.ok(smallHud.width > 285);
  await small.close();
  const noStorage = await browser.newPage(phone);
  await noStorage.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("denied");
      },
    }),
  );
  await ready(noStorage);
  await noStorage.tap("#action");
  assert.equal(
    await noStorage.evaluate(() => window.__runner.game.phase),
    "running",
  );
  await noStorage.close();
  for (const failure of ["webgl", "model", "terrain"]) {
    const bad = await browser.newPage(phone);
    if (failure === "webgl")
      await bad.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          return type === "webgl2" ? null : original.call(this, type, ...args);
        };
      });
    else
      await bad.route(failure === "model" ? "**/*.glb" : "**/*.webp", (route) =>
        route.fulfill({ status: 503, body: "unavailable" }),
      );
    await bad.goto(url);
    await bad.waitForFunction(
      () => document.querySelector("#app").dataset.phase === "error",
    );
    assert.equal(await bad.locator("#action").isEnabled(), true);
    await bad.close();
  }
  assert.deepEqual(errors, []);
  report.errors = errors;
  await writeFile("test-results/report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(
    "PASS: infinite 2D window, animated voxel models, separated gestures, HUD, painted terrain/stone transitions, haptics, culling, 100 restarts, recovery and errors.",
  );
} finally {
  await browser.close();
  server.kill();
}

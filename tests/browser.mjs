import { chromium } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { checkCollectibles } from "./collectibles-browser.mjs";
import { checkTerrainMotion } from "./terrain-browser.mjs";
import { checkContinuity } from "./continuity-browser.mjs";

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
  await page.waitForFunction(() => window.__runner?.stats().textures === 3);
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
  const context = await browser.newContext(phone);
  report.collectibles = await checkCollectibles(
    context,
    url,
    "chromium-browser",
  );
  report.terrainMotion = await checkTerrainMotion(context, url, "chromium");
  report.continuity = await checkContinuity(context, url, "chromium-browser");
  const page = await context.newPage();
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
  assert.equal(report.initial.obstacleVariants, 7);
  assert.equal(report.initial.loadedPoses, 8);
  assert.equal(report.initial.terrainLayers, 97);
  assert.equal(report.initial.terrainTileMetres, 2.5);
  assert.equal(report.initial.cameraFov, 50);
  assert.equal(report.initial.cameraFar, 96);
  assert.equal(report.initial.fogStart, 36);
  assert.equal(report.initial.fogEnd, 84);
  assert.ok(report.initial.cactusHeight >= 2.1);
  assert.equal(await page.locator("#lives img").count(), 3);
  assert.equal(await page.locator("#lives").innerText(), "");
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
      Number(document.querySelector("#coins").textContent) >= 7 &&
      Number(document.querySelector("#diamonds").textContent) >= 2,
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
  // Start the independent down-swipe fixture at a known airborne height. The
  // preceding real up-swipe was already checked; do not race its brief apex
  // against debug protocol round trips on a software GPU.
  assert.equal(
    await page.evaluate(() => window.__runner.game.phase),
    "running",
  );
  await page.evaluate(() => {
    const g = window.__runner.game,
      down = g.down.bind(g);
    g.y = g.previousY = 2;
    g.velocityY = 0;
    window.downSwipes = 0;
    g.down = () => {
      window.downSwipes++;
      down();
    };
  });
  await Promise.all([
    touch("touchStart", 330, 500),
    touch("touchMove", 330, 650),
  ]);
  await page.waitForFunction(() => window.downSwipes === 1);
  assert.equal(await page.evaluate(() => window.__runner.game.x), beforeJumpX);
  await touch("touchEnd");
  await page.waitForFunction(() => window.__runner.game.y === 0);
  await Promise.all([
    touch("touchStart", 330, 500),
    touch("touchMove", 330, 650),
  ]);
  await page.waitForFunction(() => window.__runner.game.crouch > 0.9);
  assert.equal(
    await page.evaluate(() => window.__runner.stats().playerState),
    "duck",
  );
  assert.ok(await page.evaluate(() => window.__runner.game.bodyHeight < 0.8));
  assert.equal(await page.evaluate(() => window.__runner.game.x), beforeJumpX);
  await touch("touchEnd");
  await page.screenshot({ path: "test-results/swipe-down-duck.png" });
  await page.waitForFunction(
    () =>
      window.__runner.game.crouch === 0 &&
      window.__runner.game.crouchRemaining === 0,
  );
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
  const pausedTime = await page.evaluate(() => window.__runner.game.time);
  await page.tap("#settings-toggle");
  assert.equal(await page.locator("#settings-panel").isVisible(), true);
  await page.tap("#vibration");
  await page.tap("#sound");
  assert.equal(
    await page.evaluate(() => window.__runner.audio().enabled),
    false,
  );
  await page.locator("#shake").evaluate((input) => {
    input.value = "3";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.equal(await page.locator("#shake-value").innerText(), "300%");
  assert.equal(
    await page.evaluate(() => window.__runner.camera.shakeMultiplier),
    3,
  );
  assert.equal(
    await page.evaluate(() => window.__runner.game.time),
    pausedTime,
  );
  await page.screenshot({ path: "test-results/pause-settings.png" });
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("dinoplat-settings")),
  );
  assert.deepEqual(saved, { vibration: false, sound: false, shake: 3 });
  const restored = await page.context().newPage();
  await ready(restored);
  assert.equal(
    await restored.evaluate(() => window.__runner.settings.shake),
    3,
  );
  assert.equal(
    await restored.evaluate(() => window.__runner.audio().enabled),
    false,
  );
  await restored.close();
  await page.tap("#vibration");
  await page.tap("#sound");
  await page.waitForFunction(() => window.__runner.audio().state === "running");
  assert.equal(await page.evaluate(() => window.__runner.audio().voices), 1);
  await page.locator("#shake").evaluate((input) => {
    input.value = "1";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.tap("#settings-back");
  assert.equal(await page.locator("#menu-panel").isVisible(), true);
  await page.evaluate(() => {
    const r = window.__runner,
      g = r.game;
    for (let frame = 0; frame < 8; frame++) {
      g.x = g.previousX = 0;
      g.distance = g.previousDistance = frame / 0.9 + 0.1;
      g.world.active.fill(0);
      for (let i = 0; i < 7; i++) {
        g.world.active[i] = 1;
        g.world.kinds[i] = 0;
        g.world.variants[i] = i;
        g.world.x[i] = (i - 3) * 1.3;
        g.world.z[i] = g.distance + 8;
        g.world.halfX[i] = 0.55;
        g.world.halfZ[i] = 0.55;
        g.world.height[i] = 1.55;
        g.world.baseY[i] = 0;
      }
      r.render();
    }
    g.phase = "over";
    r.render();
    g.phase = "paused";
  });
  await page.screenshot({ path: "test-results/cactus-variants.png" });
  // Warm all new banks, including the very rare heart, before memory checks.
  await page.evaluate(() => {
    const r = window.__runner,
      g = r.game;
    for (let i = 0; i < 3; i++) {
      g.world.active[i] = 1;
      g.world.kinds[i] = [1, 2, 5][i];
      g.world.variants[i] = 0;
      g.world.x[i] = (i - 1) * 2;
      g.world.z[i] = g.distance + 4;
      g.world.baseY[i] = 0.5;
    }
    r.render();
  });
  // Night uses the same virtual light and allocates no moon geometry.
  await page.evaluate(() => {
    const r = window.__runner;
    r.lighting.setTimeOfDay(0);
    r.render();
    r.lighting.setTimeOfDay(9, true);
    r.render();
  });
  // The visible cactus behind the old -4m cutoff is not discarded.
  await page.evaluate(() => {
    const r = window.__runner,
      g = r.game;
    g.world.active.fill(0);
    g.world.active[0] = 1;
    g.world.kinds[0] = 0;
    g.world.variants[0] = 1;
    g.world.baseY[0] = 0;
    g.world.height[0] = 3.1;
    g.world.halfX[0] = 0.96;
    g.world.halfZ[0] = 0.3;
    g.world.x[0] = g.x;
    g.world.z[0] = g.distance - 4.5;
    document.querySelector("#overlay").hidden = true;
    r.render();
  });
  assert.equal(
    await page.evaluate(() => window.__runner.stats().nearestRenderedForward),
    -4.5,
  );
  assert.equal(
    await page.evaluate(() => window.__runner.stats().visibleObstacles),
    1,
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
  for (const distance of [481, 491, 496, 501, 506, 511, 521]) {
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
    canvas.width = canvas.height = 1280;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, 1280, 1280).data;
    const at = (layer, x, y) =>
      ((Math.floor(layer / 10) * 128 + y) * 1280 + (layer % 10) * 128 + x) * 4;
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
          if (pixels[at(81 + type, x, 0) + c] !== pixels[at(64, x, 0) + c])
            return false;
          if (
            pixels[at(81 + type, x, 127) + c] !==
            pixels[at(type * 4, x, 127) + c]
          )
            return false;
        }
    return true;
  });
  assert.equal(report.atlasSeams, true);
  report.paintedPixelError = await page.evaluate(
    async (source) => {
      const original = new Image();
      original.src = source;
      await original.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(original, 0, 0, 512, 256);
      const expected = ctx.getImageData(0, 0, 512, 256).data;
      const atlas = new Image();
      atlas.src = performance
        .getEntriesByType("resource")
        .find((e) => /terrains-.*webp/.test(e.name)).name;
      await atlas.decode();
      canvas.width = canvas.height = 1280;
      ctx.drawImage(atlas, 0, 0);
      const actual = ctx.getImageData(0, 0, 1280, 1280).data;
      let total = 0,
        count = 0;
      for (let type = 0; type < 16; type++)
        for (let y = 14; y < 114; y++)
          for (let x = 0; x < 128; x++)
            for (let c = 0; c < 3; c++) {
              const from =
                ((Math.floor(type / 4) * 64 + Math.floor(y / 2)) * 512 +
                  (type % 4) * 128 +
                  x) *
                  4 +
                c;
              const layer = 65 + type,
                at =
                  ((Math.floor(layer / 10) * 128 + y) * 1280 +
                    (layer % 10) * 128 +
                    x) *
                    4 +
                  c;
              total += Math.abs(expected[from] - actual[at]);
              count++;
              const exit = 81 + type,
                rotated =
                  ((Math.floor(exit / 10) * 128 + 127 - y) * 1280 +
                    (exit % 10) * 128 +
                    127 -
                    x) *
                    4 +
                  c;
              total += Math.abs(expected[from] - actual[rotated]);
              count++;
            }
      return total / count;
    },
    `data:image/jpeg;base64,${(await readFile(new URL("../art/terrain-transitions-attached.jpg", import.meta.url))).toString("base64")}`,
  );
  assert.ok(
    report.paintedPixelError < 15,
    "authored transition interiors must survive; do not replace them with base/stone masks",
  );
  const hit = await page.evaluate(() => {
    const r = window.__runner,
      g = r.game;
    g.phase = "over";
    r.start();
    g.distance = g.previousDistance = 2000;
    g.world.update(g.x, g.distance);
    g.world.active.fill(0);
    g.world.active[0] = 1;
    g.world.kinds[0] = 0;
    g.world.x[0] = g.x;
    g.world.z[0] = g.distance + 0.3;
    g.world.halfX[0] = 0.8;
    g.world.halfZ[0] = 0.8;
    g.world.height[0] = 3;
    g.step(1 / 120);
    r.pause();
    r.render();
    return {
      lives: g.health.lives,
      immunity: g.health.immunity,
      speed: g.speed,
      opacity: r.stats().playerOpacity,
    };
  });
  assert.deepEqual(hit, { lives: 2, immunity: 2, speed: 12, opacity: 0.5 });
  assert.equal(await page.locator("#lives .empty-heart").count(), 1);
  await page.evaluate(() => {
    window.__runner.game.health.immunity = 1.85;
    window.__runner.render();
  });
  assert.equal(
    await page.evaluate(() => window.__runner.stats().playerOpacity),
    1,
  );
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
  assert.equal(report.memoryAfter.textures, 3);
  assert.ok(report.memoryAfter.heap - report.memoryBefore.heap < 2000000);
  report.performance = await page.evaluate(async () => {
    const samples = [];
    const began = performance.now();
    let previous = began;
    return await new Promise((resolve) => {
      function tick(now) {
        const g = window.__runner.game;
        if (g.phase !== "running") return resolve({ failed: g.phase });
        const delta = g.world.safeCenter(g.distance - g.speed * 0.3) - g.x;
        g.move(Math.abs(delta) > 0.12 ? Math.sign(delta) : 0);
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
  assert.ok(report.performance.calls <= 21);
  await page.screenshot({ path: "test-results/animated-run.png" });
  report.shadowsAfter170 = await page.evaluate(() => {
    const r = window.__runner,
      g = r.game;
    g.phase = "paused";
    g.x = g.previousX = 0;
    g.distance = g.previousDistance = 220;
    g.world.update(0, 220);
    g.terrain.advance(220);
    r.lighting.shadowsEnabled = true;
    r.render();
    const gl = document.querySelector("#game").getContext("webgl2");
    const a = new Uint8Array(
        gl.drawingBufferWidth * gl.drawingBufferHeight * 4,
      ),
      b = new Uint8Array(a.length);
    gl.readPixels(
      0,
      0,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      a,
    );
    const stats = r.stats();
    r.lighting.shadowsEnabled = false;
    r.render();
    gl.readPixels(
      0,
      0,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      b,
    );
    let darker = 0;
    for (let i = 0; i < a.length; i += 4)
      if (b[i] - a[i] > 8 || b[i + 1] - a[i + 1] > 8 || b[i + 2] - a[i + 2] > 8)
        darker++;
    r.lighting.shadowsEnabled = true;
    r.render();
    return { stats, darker, error: gl.getError() };
  });
  assert.ok(report.shadowsAfter170.stats.shadowStrength > 0.5);
  assert.ok(report.shadowsAfter170.darker > 20);
  assert.equal(report.shadowsAfter170.error, 0);
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
  const bounds = await small.locator("#menu-panel").boundingBox();
  assert.ok(bounds.y > 55 && bounds.y + bounds.height < 568);
  await small.tap("#action");
  await small.screenshot({ path: "test-results/small-game.png" });
  const smallHud = await small.locator(".hud").boundingBox();
  assert.ok(smallHud.width > 285);
  await small.tap("#pause");
  const smallPause = await small.locator("#menu-panel").boundingBox();
  assert.ok(smallPause.y > 55 && smallPause.y + smallPause.height < 568);
  await small.tap("#settings-toggle");
  const smallSettings = await small.locator("#settings-panel").boundingBox();
  assert.ok(
    smallSettings.y > 55 && smallSettings.y + smallSettings.height < 568,
  );
  await small.screenshot({ path: "test-results/small-settings.png" });
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

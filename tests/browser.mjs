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
const errors = [],
  report = {};
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* Wait for preview. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await mkdir("test-results", { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${url}/?debug`);
  await page.waitForFunction(() => window.__runner?.stats().calls > 0);
  await page.evaluate(() => document.fonts.ready);
  report.design = await page.evaluate(() => {
    const app = document.querySelector("#app").getBoundingClientRect();
    const button = document.querySelector("#action").getBoundingClientRect();
    return {
      portrait: app.width < app.height,
      centred:
        Math.abs(button.x + button.width / 2 - (app.x + app.width / 2)) < 1,
      pixelFontLoaded: document.fonts.check(
        '12px "Press Start 2P"',
        "Дино вперёд!",
      ),
      buttonRadius: getComputedStyle(document.querySelector("#action"))
        .borderRadius,
      ...window.__runner.stats(),
    };
  });
  assert.equal(report.design.portrait, true);
  assert.equal(report.design.centred, true);
  assert.equal(report.design.pixelFontLoaded, true);
  assert.equal(report.design.buttonRadius, "0px");
  assert.equal(report.design.lanes, 5);
  assert.equal(report.design.separatorCount, 4);
  assert.equal(report.design.obstacleCapacity, 48);
  assert.equal(report.design.sandSize, 256);
  assert.ok(Math.abs(report.design.cameraExtraPitchDegrees - 10) < 1e-6);
  assert.ok(report.design.laneEdgeNdc < 0.95);
  assert.equal(
    await page.evaluate(() => window.__runner.stats().threeRevision),
    "186",
  );
  assert.equal(
    await page.evaluate(() => window.__runner.stats().playerTriangles),
    288,
  );
  await page.screenshot({ path: "test-results/desktop-menu.png" });
  await page.click("#action");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(220);
  assert.equal(await page.evaluate(() => window.__runner.game.lane), 3);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Space");
  await page.waitForTimeout(150);
  assert.ok(await page.evaluate(() => window.__runner.game.y > 0.6));
  await page.keyboard.press("Escape");
  const frozen = await page.evaluate(() => window.__runner.game.distance);
  await page.waitForTimeout(200);
  assert.equal(
    await page.evaluate(() => window.__runner.game.distance),
    frozen,
  );
  await page.click("#action");
  await page.evaluate(() => {
    const g = window.__runner.game;
    g.y = g.velocityY = 0;
    g.x = (g.lane - 2) * 2.1;
    g.rowZ[0] = 1.1;
    g.masks[0] = 1 << g.lane;
  });
  await page.waitForFunction(() => window.__runner.game.phase === "over");
  assert.equal(await page.locator("#result").isVisible(), true);
  await page.screenshot({ path: "test-results/game-over.png" });
  const record = await page.locator("#best").textContent();
  await page.click("#action");
  assert.ok(
    await page.evaluate(
      () => window.__runner.game.distance < 3 && window.__runner.game.y === 0,
    ),
  );
  await page.reload();
  await page.waitForFunction(() => window.__runner?.stats().calls > 0);
  assert.equal(await page.locator("#best").textContent(), record);
  await page.click("#action");
  // Repeat natural, rendered restarts with collection between measurements.
  const cdp = await page.context().newCDPSession(page);
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
  assert.equal(report.memoryAfter.geometries, report.memoryBefore.geometries);
  assert.equal(report.memoryBefore.textures, 1);
  assert.equal(report.memoryAfter.textures, 1);
  assert.ok(report.memoryAfter.heap - report.memoryBefore.heap < 2_000_000);
  // Actual rendered run: autopilot only supplies lane input; rules stay enabled.
  report.performance = await page.evaluate(async () => {
    const samples = [];
    let previous = performance.now();
    const began = previous;
    window.__runner.game.phase = "over";
    window.__runner.start();
    return await new Promise((resolve) => {
      function tick(now) {
        const g = window.__runner.game;
        if (g.phase !== "running") {
          resolve({ failed: g.phase });
          return;
        }
        let next = 0,
          z = Infinity;
        for (let i = 0; i < g.rowZ.length; i++)
          if (g.rowZ[i] > -0.9 && g.rowZ[i] < z) {
            next = i;
            z = g.rowZ[i];
          }
        g.move(Math.sign(g.safeLanes[next] - g.lane));
        samples.push(now - previous);
        previous = now;
        if (now - began < 12000) requestAnimationFrame(tick);
        else {
          samples.sort((a, b) => a - b);
          resolve({
            frames: samples.length,
            elapsedMs: now - began,
            meanFrameMs: samples.reduce((a, b) => a + b, 0) / samples.length,
            p95FrameMs: samples[Math.floor(samples.length * 0.95)],
            distance: g.distance,
            ...window.__runner.stats(),
          });
        }
      }
      requestAnimationFrame(tick);
    });
  });
  assert.equal(report.performance.failed, undefined);
  assert.ok(report.performance.calls <= 6);
  await page.screenshot({ path: "test-results/desktop-game.png" });
  // GPU context recovery pauses and retains the run.
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    window.testLoss = gl.getExtension("WEBGL_lose_context");
    window.testLoss.loseContext();
  });
  await page.waitForFunction(() => document.querySelector("#action").disabled);
  await page.evaluate(() => window.testLoss.restoreContext());
  await page.waitForFunction(() => !document.querySelector("#action").disabled);
  await page.click("#action");
  assert.equal(
    await page.evaluate(() => window.__runner.game.phase),
    "running",
  );
  await page.close();

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto(`${url}/?debug`);
  await mobile.waitForFunction(() => window.__runner?.stats().calls > 0);
  await mobile.evaluate(() => document.fonts.ready);
  await mobile.screenshot({ path: "test-results/mobile-menu.png" });
  await mobile.tap("#action");
  await mobile.touchscreen.tap(330, 650);
  assert.equal(await mobile.evaluate(() => window.__runner.game.lane), 3);
  await mobile.touchscreen.tap(60, 650);
  assert.equal(await mobile.evaluate(() => window.__runner.game.lane), 2);
  const touch = await mobile.context().newCDPSession(mobile);
  async function swipe(x, y, endX, endY) {
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: endX, y: endY }],
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  }
  await swipe(190, 650, 190, 510);
  await mobile.waitForTimeout(130);
  assert.ok(await mobile.evaluate(() => window.__runner.game.y > 0.4));
  assert.equal(await mobile.evaluate(() => window.__runner.game.lane), 2);
  await swipe(190, 650, 300, 650);
  assert.equal(await mobile.evaluate(() => window.__runner.game.lane), 3);
  await mobile.tap("#pause");
  await mobile.waitForTimeout(300);
  await mobile.waitForFunction(() => window.__runner.game.phase === "paused");
  await mobile.tap("#action");
  await mobile.screenshot({ path: "test-results/mobile-game.png" });
  // Rotation itself must suspend a running game, not just hide its canvas.
  await mobile.setViewportSize({ width: 844, height: 390 });
  await mobile.waitForFunction(
    () =>
      window.__runner.snapshot().orientationBlocked &&
      window.__runner.game.phase === "paused",
  );
  await mobile.screenshot({ path: "test-results/landscape.png" });
  assert.equal(await mobile.locator("#rotate").isVisible(), true);
  assert.equal(await mobile.locator("#action").isVisible(), false);
  const stoppedDistance = await mobile.evaluate(
    () => window.__runner.game.distance,
  );
  await mobile.keyboard.press("Enter");
  await mobile.keyboard.press("ArrowRight");
  await mobile.waitForTimeout(250);
  assert.equal(
    await mobile.evaluate(() => window.__runner.game.distance),
    stoppedDistance,
  );
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.waitForFunction(
    () => !window.__runner.snapshot().orientationBlocked,
  );
  assert.equal(
    await mobile.evaluate(() => window.__runner.game.phase),
    "paused",
  );
  await mobile.tap("#action");
  report.mobile = await mobile.evaluate(() => window.__runner.snapshot());
  report.portraitOnly = true;
  assert.ok(report.mobile.width * report.mobile.height <= 900000);
  await mobile.close();
  const small = await browser.newPage({
    viewport: { width: 320, height: 568 },
    hasTouch: true,
    isMobile: true,
  });
  small.on("pageerror", (e) => errors.push(e.message));
  await small.goto(`${url}/?debug`);
  await small.waitForFunction(() => window.__runner?.stats().calls > 0);
  await small.evaluate(() => document.fonts.ready);
  await small.screenshot({ path: "test-results/small-menu.png" });
  const smallBounds = await small.locator(".panel").boundingBox();
  assert.ok(smallBounds.y >= 65 && smallBounds.y + smallBounds.height <= 550);
  assert.ok(
    await small.evaluate(() => window.__runner.stats().laneEdgeNdc < 0.95),
  );
  await small.click("#action");
  await small.evaluate(() => {
    const g = window.__runner.game;
    g.rowZ[0] = 0.9;
    g.masks[0] = 1 << g.lane;
  });
  await small.waitForFunction(() => window.__runner.game.phase === "over");
  await small.screenshot({ path: "test-results/small-game-over.png" });
  const overBounds = await small.locator(".panel").boundingBox();
  assert.ok(overBounds.y >= 65 && overBounds.y + overBounds.height <= 550);
  report.smallPortraitFits = true;
  await small.close();

  // Storage remains optional even with asynchronous model loading.
  const legacy = await browser.newPage();
  legacy.on("pageerror", (e) => errors.push(e.message));
  await legacy.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("denied");
      },
    });
  });
  await legacy.goto(`${url}/?debug`);
  await legacy.waitForFunction(() => window.__runner?.stats().calls > 0);
  await legacy.click("#action");
  report.noStorage = await legacy.evaluate(() => window.__runner.snapshot());
  await legacy.close();
  // Latest Three.js requires WebGL 2: a readable fallback, not a blank canvas.
  const unsupported = await browser.newPage();
  unsupported.on("pageerror", (e) => errors.push(e.message));
  await unsupported.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === "webgl2") return null;
      return getContext.call(this, type, ...args);
    };
  });
  await unsupported.goto(url);
  await unsupported.waitForFunction(() =>
    document.querySelector("#description").textContent.includes("WebGL 2"),
  );
  assert.equal(await unsupported.locator("#action").isEnabled(), true);
  report.webgl2Required = true;
  await unsupported.close();
  // Asset failure is reported and leaves an explicit retry button.
  const missing = await browser.newPage();
  missing.on("pageerror", (e) => errors.push(e.message));
  await missing.route("**/*.glb", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await missing.goto(url);
  await missing.waitForFunction(() =>
    document
      .querySelector("#description")
      .textContent.includes("Не удалось загрузить динозавра"),
  );
  assert.equal(await missing.locator("#action").isEnabled(), true);
  report.modelFailureHandled = true;
  await missing.close();
  const missingSand = await browser.newPage();
  missingSand.on("pageerror", (e) => errors.push(e.message));
  await missingSand.route("**/*.webp", (route) =>
    route.fulfill({ status: 503, body: "unavailable" }),
  );
  await missingSand.goto(url);
  await missingSand.waitForFunction(() =>
    document
      .querySelector("#description")
      .textContent.includes("Не удалось загрузить песчаную дорожку"),
  );
  assert.equal(await missingSand.locator("#action").isEnabled(), true);
  report.sandFailureHandled = true;
  await missingSand.close();
  assert.deepEqual(errors, []);
  report.errors = errors;
  await writeFile("test-results/report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(
    "PASS: five lanes, +10° camera, centred pixel UI, font, sand, portrait/rotation suspension, input, collisions, restart, 100 restarts, GPU recovery and error handling.",
  );
} finally {
  await browser.close();
  server.kill();
}

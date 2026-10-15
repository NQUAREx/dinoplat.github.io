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
  await page.screenshot({ path: "test-results/desktop-menu.png" });
  await page.click("#action");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(220);
  assert.equal(await page.evaluate(() => window.__runner.game.lane), 2);
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
    g.x = (g.lane - 1.5) * 2.1;
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
  assert.equal(report.memoryAfter.textures, 0);
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
  await mobile.screenshot({ path: "test-results/mobile-menu.png" });
  await mobile.tap("#action");
  await mobile.touchscreen.tap(330, 650);
  assert.equal(await mobile.evaluate(() => window.__runner.game.lane), 2);
  await mobile.touchscreen.tap(60, 650);
  assert.equal(await mobile.evaluate(() => window.__runner.game.lane), 1);
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
  assert.equal(await mobile.evaluate(() => window.__runner.game.lane), 1);
  await swipe(190, 650, 300, 650);
  assert.equal(await mobile.evaluate(() => window.__runner.game.lane), 2);
  await mobile.tap("#pause");
  await mobile.waitForTimeout(300);
  await mobile.waitForFunction(() => window.__runner.game.phase === "paused");
  await mobile.setViewportSize({ width: 844, height: 390 });
  await mobile.screenshot({ path: "test-results/landscape.png" });
  assert.equal(await mobile.locator("#action").isVisible(), true);
  await mobile.tap("#action");
  report.mobile = await mobile.evaluate(() => window.__runner.snapshot());
  await mobile.screenshot({ path: "test-results/mobile-game.png" });
  assert.ok(report.mobile.width * report.mobile.height <= 900000);
  await mobile.close();

  // Force WebGL 1 fallback and deny localStorage, both supported paths.
  const legacy = await browser.newPage();
  legacy.on("pageerror", (e) => errors.push(e.message));
  await legacy.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === "webgl2") return null;
      return getContext.call(this, type, ...args);
    };
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("denied");
      },
    });
  });
  await legacy.goto(`${url}/?debug`);
  await legacy.waitForFunction(() => window.__runner?.stats().calls > 0);
  await legacy.click("#action");
  report.webgl1 = await legacy.evaluate(() => window.__runner.snapshot());
  await legacy.close();
  assert.deepEqual(errors, []);
  report.errors = errors;
  await writeFile("test-results/report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(
    "PASS: desktop/mobile input, jump, collision, restart, record, pause, resize, 100 restarts, GPU recovery, WebGL 1.",
  );
} finally {
  await browser.close();
  server.kill();
}

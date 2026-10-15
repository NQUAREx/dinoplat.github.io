import { chromium } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const url = "http://127.0.0.1:4174";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview",
  "--host", "127.0.0.1", "--port", "4174", "--strictPort"], { stdio: "pipe" });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const errors = [], report = {};
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
async function ready(page) {
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${url}/?debug`);
  await page.waitForFunction(() => window.__runner?.stats().calls > 0);
}
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(url)).ok) break; } catch { /* Preview starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await mkdir("test-results", { recursive: true });
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desktop.goto(`${url}/?debug`);
  await desktop.waitForFunction(() => document.body.dataset.device === "unsupported");
  assert.equal(await desktop.locator("#mobile-required").isVisible(), true);
  assert.equal(await desktop.evaluate(() => !!window.__runner), false);
  assert.equal(await desktop.evaluate(() => performance.getEntriesByType("resource").some(e => /\.glb|terrains.*webp/.test(e.name))), false);
  await desktop.screenshot({ path: "test-results/desktop-unsupported.png" });
  report.desktopRemoved = true;
  await desktop.close();

  const page = await browser.newPage(phone);
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await ready(page);
  await page.evaluate(() => document.fonts.ready);
  report.design = await page.evaluate(() => {
    const app = document.querySelector("#app").getBoundingClientRect();
    const button = document.querySelector("#action").getBoundingClientRect();
    return {
      centred: Math.abs(button.x + button.width / 2 - (app.x + app.width / 2)) < 1,
      font: document.fonts.check('12px "Press Start 2P"', "Дино вперёд!"),
      ...window.__runner.stats(),
    };
  });
  assert.equal(report.design.centred, true);
  assert.equal(report.design.font, true);
  assert.equal(report.design.obstacleColumns, 5);
  assert.equal(report.design.separatorCount, 0);
  assert.equal(report.design.terrainLayers, 16);
  assert.equal(report.design.terrainSize, 128);
  assert.equal(report.design.textures, 1);
  report.seamlessTiles = await page.evaluate(async () => {
    const url = performance.getEntriesByType("resource").find(entry => /terrains-.*\.webp/.test(entry.name)).name;
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 512;
    const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, 512, 512).data;
    for (let layer = 0; layer < 16; layer++) {
      const ox = layer % 4 * 128, oy = Math.floor(layer / 4) * 128;
      const at = (x, y) => ((oy + y) * 512 + ox + x) * 4;
      for (let coordinate = 0; coordinate < 128; coordinate++)
        for (let channel = 0; channel < 3; channel++) {
          if (pixels[at(0, coordinate) + channel] !== pixels[at(127, coordinate) + channel]) return false;
          if (pixels[at(coordinate, 0) + channel] !== pixels[at(coordinate, 127) + channel]) return false;
        }
    }
    return true;
  });
  assert.equal(report.seamlessTiles, true);
  assert.equal(report.design.threeRevision, "186");
  assert.equal(report.design.cameraFov, 50);
  assert.equal(report.design.cameraFar, 64);
  assert.ok(Math.abs(report.design.playerNdcX) < 0.8);
  await page.screenshot({ path: "test-results/mobile-menu.png" });
  // Mouse and keyboard must not start a mobile game either.
  await page.click("#action");
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => window.__runner.game.phase), "ready");
  await page.tap("#action");
  await page.evaluate(() => window.__runner.game.masks.fill(0));
  // Inspect a trailing row at the very cutoff that used to pop on screen.
  await page.evaluate(() => {
    window.__runner.pause();
    const g = window.__runner.game;
    g.rowZ[0] = -4.5;
    g.masks[0] = 1 << 2;
    document.querySelector("#overlay").hidden = true;
    window.__runner.render();
  });
  await page.waitForFunction(() => window.__runner.stats().nearestRenderedRowZ < -4);
  report.trailingCubeVisible = await page.evaluate(() => window.__runner.stats().nearestRenderedRowZ);
  await page.screenshot({ path: "test-results/trailing-cube.png" });
  await page.evaluate(() => {
    window.__runner.game.masks.fill(0);
    window.__runner.start();
  });
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x = 320, y = 620) => cdp.send("Input.dispatchTouchEvent", {
    type, touchPoints: type === "touchEnd" || type === "touchCancel" ? [] : [{ x, y }],
  });
  await touch("touchStart");
  await page.waitForFunction(() => window.__runner.game.x > 1.2);
  const heldFirst = await page.evaluate(() => window.__runner.game.x);
  await page.waitForTimeout(140);
  const heldSecond = await page.evaluate(() => window.__runner.game.x);
  assert.ok(heldSecond > heldFirst + 0.2, `${heldFirst} -> ${heldSecond}`);
  await touch("touchEnd");
  const released = await page.evaluate(() => window.__runner.game.x);
  await page.waitForTimeout(220);
  assert.equal(await page.evaluate(() => window.__runner.game.x), released);
  assert.equal(await page.evaluate(() => window.__runner.game.steering), 0);
  report.heldMovement = { heldFirst, heldSecond, released };
  await page.waitForFunction(() => window.__runner.game.heading === 0);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Space");
  await page.mouse.click(60, 620);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.__runner.game.x), released);
  assert.equal(await page.evaluate(() => window.__runner.game.y), 0);

  // Crossing the screen midpoint while holding reverses the same gesture.
  await touch("touchStart", 60);
  await page.waitForFunction(() => window.__runner.game.heading === Math.PI / 4);
  await touch("touchMove", 330);
  await page.waitForFunction(() => window.__runner.game.steering === 1);
  await touch("touchCancel");
  assert.equal(await page.evaluate(() => window.__runner.game.steering), 0);
  const cancelledX = await page.evaluate(() => window.__runner.game.x);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.__runner.game.x), cancelledX);

  // Up-swipe jumps on move, before finger release, and ends sideways steering.
  await touch("touchStart", 190, 620);
  await touch("touchMove", 190, 480);
  await page.waitForFunction(() => window.__runner.game.y > 0.1);
  assert.equal(await page.evaluate(() => window.__runner.game.steering), 0);
  await touch("touchEnd");
  await page.tap("#pause");
  const frozen = await page.evaluate(() => window.__runner.game.distance);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__runner.game.distance), frozen);
  await page.tap("#action");
  await page.evaluate(() => {
    const g = window.__runner.game;
    g.y = g.velocityY = g.x = 0; g.move(0);
    g.rowZ[0] = 1.1; g.masks[0] = 1 << 2;
  });
  await page.waitForFunction(() => window.__runner.game.phase === "over");
  await page.screenshot({ path: "test-results/game-over.png" });
  assert.equal(await page.locator("#result").isVisible(), true);
  const record = await page.locator("#best").textContent();
  await page.tap("#action");
  assert.ok(await page.evaluate(() => window.__runner.game.distance < 5));
  await page.reload();
  await page.waitForFunction(() => window.__runner?.stats().calls > 0);
  assert.equal(await page.locator("#best").textContent(), record);
  await page.tap("#action");

  // Exercise real GPU uploads for every layer and capture a spatial transition.
  await page.evaluate(() => {
    const g = window.__runner.game;
    g.masks.fill(0); g.terrain.reset(1979); g.distance = 480;
  });
  await page.waitForFunction(() => window.__runner.game.terrain.segment === 0);
  await page.waitForTimeout(80);
  await page.screenshot({ path: "test-results/terrain-approach.png" });
  const expectedNext = await page.evaluate(() => window.__runner.game.terrain.next);
  await page.evaluate(() => { window.__runner.game.distance = 500; });
  await page.waitForFunction(() => window.__runner.game.terrain.segment === 1);
  assert.equal(await page.evaluate(() => window.__runner.game.terrain.current), expectedNext);
  await page.screenshot({ path: "test-results/terrain-transition.png" });
  report.terrain = await page.evaluate(() => window.__runner.snapshot());
  for (let i = 0; i < 16; i++) {
    await page.evaluate(i => {
      const g = window.__runner.game;
      g.distance = 600;
      g.terrain.previous = g.terrain.current = g.terrain.next = i;
    }, i);
    await page.waitForTimeout(45);
    if ([0, 5, 12, 15].includes(i))
      await page.screenshot({ path: `test-results/terrain-${i}.png` });
  }
  await cdp.send("HeapProfiler.collectGarbage");
  report.memoryBefore = await page.evaluate(() => ({ heap: performance.memory?.usedJSHeapSize, ...window.__runner.stats() }));
  await page.evaluate(async () => {
    for (let i = 0; i < 100; i++) {
      window.__runner.game.phase = "over";
      window.__runner.start();
      await new Promise(requestAnimationFrame);
    }
  });
  await cdp.send("HeapProfiler.collectGarbage");
  report.memoryAfter = await page.evaluate(() => ({ heap: performance.memory?.usedJSHeapSize, ...window.__runner.stats() }));
  assert.equal(report.memoryAfter.geometries, report.memoryBefore.geometries);
  assert.equal(report.memoryAfter.textures, 1);
  assert.ok(report.memoryAfter.heap - report.memoryBefore.heap < 2_000_000);
  report.performance = await page.evaluate(async () => {
    const samples = [];
    let previous = performance.now();
    const began = previous;
    return await new Promise(resolve => {
      function tick(now) {
        const g = window.__runner.game;
        if (g.phase !== "running") return resolve({ failed: g.phase });
        let next = 0, z = Infinity;
        for (let i = 0; i < g.rowZ.length; i++)
          if (g.rowZ[i] > -0.9 && g.rowZ[i] < z) { next = i; z = g.rowZ[i]; }
        const delta = (g.safeLanes[next] - 2) * 2.1 - g.x;
        g.move(Math.abs(delta) > 0.07 ? Math.sign(delta) : 0);
        samples.push(now - previous); previous = now;
        if (now - began < 6000) requestAnimationFrame(tick);
        else {
          samples.sort((a, b) => a - b);
          resolve({ frames: samples.length, elapsedMs: now - began,
            meanFrameMs: samples.reduce((a, b) => a + b, 0) / samples.length,
            p95FrameMs: samples[Math.floor(samples.length * 0.95)],
            distance: g.distance, ...window.__runner.stats() });
        }
      }
      requestAnimationFrame(tick);
    });
  });
  assert.equal(report.performance.failed, undefined);
  assert.ok(report.performance.calls <= 5);
  await page.screenshot({ path: "test-results/mobile-game.png" });
  await page.evaluate(() => {
    window.__runner.game.move(0);
    const gl = document.querySelector("canvas").getContext("webgl2");
    window.testLoss = gl.getExtension("WEBGL_lose_context");
    window.testLoss.loseContext();
  });
  await page.waitForFunction(() => document.querySelector("#action").disabled);
  await page.evaluate(() => window.testLoss.restoreContext());
  await page.waitForFunction(() => !document.querySelector("#action").disabled);
  await page.tap("#action");
  await page.evaluate(() => window.__runner.game.masks.fill(0));
  // Rotate DURING a hold: returning to portrait must not resume stale steering.
  await touch("touchStart", 60);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => window.__runner.snapshot().orientationBlocked && window.__runner.game.phase === "paused");
  assert.equal(await page.evaluate(() => window.__runner.game.steering), 0);
  await touch("touchEnd");
  await page.screenshot({ path: "test-results/landscape.png" });
  const rotatedDistance = await page.evaluate(() => window.__runner.game.distance);
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => window.__runner.game.distance), rotatedDistance);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => !window.__runner.snapshot().orientationBlocked);
  assert.equal(await page.evaluate(() => window.__runner.game.phase), "paused");
  await page.tap("#action");
  assert.equal(await page.evaluate(() => window.__runner.game.steering), 0);
  report.mobile = await page.evaluate(() => window.__runner.snapshot());
  assert.ok(report.mobile.width * report.mobile.height <= 900000);
  await page.close();

  const small = await browser.newPage({ ...phone, viewport: { width: 320, height: 568 } });
  await ready(small);
  await small.evaluate(() => document.fonts.ready);
  await small.screenshot({ path: "test-results/small-menu.png" });
  let bounds = await small.locator(".panel").boundingBox();
  assert.ok(bounds.y >= 65 && bounds.y + bounds.height <= 550);
  assert.ok(await small.evaluate(() => Math.abs(window.__runner.stats().playerNdcX) < 0.8));
  await small.tap("#action");
  await small.evaluate(() => { const g = window.__runner.game; g.rowZ[0] = 0.9; g.masks[0] = 1 << 2; });
  await small.waitForFunction(() => window.__runner.game.phase === "over");
  await small.screenshot({ path: "test-results/small-game-over.png" });
  bounds = await small.locator(".panel").boundingBox();
  assert.ok(bounds.y >= 65 && bounds.y + bounds.height <= 550);
  report.smallPortraitFits = true;
  await small.close();
  const noStorage = await browser.newPage(phone);
  await noStorage.addInitScript(() => Object.defineProperty(window, "localStorage", { get() { throw new Error("denied"); } }));
  await ready(noStorage);
  await noStorage.tap("#action");
  assert.equal(await noStorage.evaluate(() => window.__runner.game.phase), "running");
  await noStorage.close();
  for (const failure of ["webgl", "model", "terrain"]) {
    const page = await browser.newPage(phone);
    page.on("pageerror", error => errors.push(error.message));
    if (failure === "webgl") await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        return type === "webgl2" ? null : original.call(this, type, ...args);
      };
    });
    else await page.route(failure === "model" ? "**/*.glb" : "**/*.webp", route => route.fulfill({ status: 503, body: "unavailable" }));
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector("#app").dataset.phase === "error");
    const text = await page.locator("#description").textContent();
    assert.ok(text.includes(failure === "webgl" ? "WebGL 2" : failure === "model" ? "динозавра" : "покрытия"));
    assert.equal(await page.locator("#action").isEnabled(), true);
    await page.close();
  }
  assert.deepEqual(errors, []);
  report.errors = errors;
  await writeFile("test-results/report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log("PASS: held touch, release/cancel/reversal, swipe, no PC input, terrain array/transitions, collision/restart, 100 restarts, portrait, GPU recovery, asset errors.");
} finally {
  await browser.close();
  server.kill();
}

import { chromium, webkit, devices } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const url = "http://127.0.0.1:4176";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4176",
    "--strictPort",
  ],
  { stdio: "pipe" },
);
const results = {};
try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* Starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await mkdir("test-results", { recursive: true });
  for (const engine of ["chromium", "webkit"]) {
    const browser =
      engine === "chromium"
        ? await chromium.launch({
            executablePath:
              process.env.CHROMIUM_PATH ||
              (existsSync("/usr/bin/chromium")
                ? "/usr/bin/chromium"
                : undefined),
            args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
          })
        : await webkit.launch();
    try {
      const options = {
        ...devices[engine === "chromium" ? "Pixel 7" : "iPhone 13"],
        deviceScaleFactor: 1,
      };
      const context = await browser.newContext(options);
      const page = await context.newPage();
      const errors = [];
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
      assert.equal(
        await page.evaluate(() => getComputedStyle(document.body).position),
        "fixed",
      );
      assert.equal(
        await page.evaluate(
          () => getComputedStyle(document.querySelector("#title")).userSelect,
        ),
        "none",
      );
      const guards = await page.evaluate(() => {
        const result = {};
        for (const type of [
          "contextmenu",
          "selectstart",
          "dragstart",
          "gesturestart",
          "gesturechange",
          "dblclick",
        ]) {
          const event = new Event(type, { cancelable: true, bubbles: true });
          document.querySelector("#title").dispatchEvent(event);
          result[type] = event.defaultPrevented;
        }
        window.scrollTo(0, 400);
        return { events: result, x: scrollX, y: scrollY };
      });
      assert.ok(Object.values(guards.events).every(Boolean));
      assert.equal(guards.y, 0);
      assert.equal(guards.x, 0);
      const manifestUrl = await page
        .locator('link[rel="manifest"]')
        .getAttribute("href");
      const manifest = await (
        await page.request.get(new URL(manifestUrl, page.url()).href)
      ).json();
      assert.equal(manifest.display, "fullscreen");
      await page.tap("#action");
      await page.waitForFunction(
        () => window.__runner.game.phase === "running",
      );
      const initial = await page.evaluate(() => window.__runner.mobile());
      await page.waitForFunction(
        () => window.__runner.audio().state === "running",
      );
      await page.evaluate(() => {
        const g = window.__runner.game;
        g.health.immunity = 1e9;
        g.jump();
        g.move(1);
      });
      await page.waitForFunction(
        () => window.__runner.game.x > 1 && window.__runner.game.y > 0.5,
      );
      await page.evaluate(() => window.__runner.game.move(0));
      await page.waitForFunction(() => window.__runner.game.y === 0);
      const resizes = await page.evaluate(
        () => window.__runner.stats().bufferResizes,
      );
      await page.evaluate(() => {
        for (let i = 0; i < 20; i++) window.dispatchEvent(new Event("resize"));
      });
      await page.waitForTimeout(120);
      assert.equal(
        await page.evaluate(() => window.__runner.stats().bufferResizes),
        resizes,
      );
      await page.evaluate(() =>
        window.dispatchEvent(
          new PageTransitionEvent("pagehide", { persisted: true }),
        ),
      );
      assert.equal(
        await page.evaluate(() => window.__runner.game.phase),
        "paused",
      );
      await page.waitForFunction(
        () => window.__runner.audio().state === "suspended",
      );
      const pausedDistance = await page.evaluate(
        () => window.__runner.game.distance,
      );
      await page.evaluate(() =>
        window.dispatchEvent(
          new PageTransitionEvent("pageshow", { persisted: true }),
        ),
      );
      await page.waitForTimeout(100);
      assert.equal(
        await page.evaluate(() => window.__runner.game.distance),
        pausedDistance,
      );
      await page.tap("#action");
      await page.waitForFunction(
        () => window.__runner.audio().state === "running",
      );
      assert.equal(await page.evaluate(() => window.__runner.game.steering), 0);
      await page.tap("#pause");
      await page.tap("#settings-toggle");
      const range = await page.locator("#shake").boundingBox();
      if (engine === "chromium") {
        const cdp = await context.newCDPSession(page);
        const send = (type, x) =>
          cdp.send("Input.dispatchTouchEvent", {
            type,
            touchPoints:
              type === "touchEnd" ? [] : [{ x, y: range.y + range.height / 2 }],
          });
        await send("touchStart", range.x + range.width / 3);
        await send("touchMove", range.x + range.width * 0.9);
        await send("touchEnd", 0);
        await cdp.detach();
      } else
        await page.touchscreen.tap(
          range.x + range.width * 0.9,
          range.y + range.height / 2,
        );
      await page.waitForFunction(() => window.__runner.settings.shake > 1);
      assert.equal(
        await page.evaluate(() => window.getSelection().toString()),
        "",
      );
      await page.setViewportSize({ width: 320, height: 568 });
      await page.waitForFunction(() => window.__runner.mobile().height === 568);
      const panel = await page.locator("#settings-panel").boundingBox();
      assert.ok(
        panel.y >= 55 && panel.y + panel.height <= 568,
        `${engine}: settings must fit small portrait ${JSON.stringify(panel)}`,
      );
      const app = await page.locator("#app").boundingBox();
      assert.equal(app.width, 320);
      assert.equal(app.height, 568);
      const framebuffer = await page.evaluate(() => {
        window.__runner.render();
        const canvas = document.querySelector("#game"),
          gl = canvas.getContext("webgl2");
        const samples = [];
        for (const y of [0.1, 0.3, 0.5]) {
          const pixel = new Uint8Array(4);
          gl.readPixels(
            Math.floor(canvas.width / 2),
            Math.floor(canvas.height * y),
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixel,
          );
          samples.push(Array.from(pixel));
        }
        return { samples, error: gl.getError() };
      });
      console.log(engine, "framebuffer", JSON.stringify(framebuffer));
      assert.equal(framebuffer.error, 0);
      assert.ok(
        framebuffer.samples.every(
          (p) => p[3] === 255 && p[0] + p[1] + p[2] > 30,
        ),
      );
      assert.ok(
        framebuffer.samples.some(
          (p) => p[0] !== 115 || p[1] !== 216 || p[2] !== 255,
        ),
        "3D pixels must differ from clear sky",
      );
      await page.screenshot({ path: `test-results/mobile-${engine}.png` });
      assert.deepEqual(errors, []);
      results[engine] = {
        initial,
        guards,
        framebuffer,
        rangeWorks: true,
        lifecycle: true,
        resizeCoalescing: true,
        stats: await page.evaluate(() => window.__runner.stats()),
        errors,
      };
      // iPhone-like missing Fullscreen API and denied embedded/fullscreen policy.
      for (const mode of ["missing", "denied", "standalone"]) {
        const fallback = await context.newPage();
        await fallback.addInitScript((mode) => {
          Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
            configurable: true,
            value:
              mode === "denied"
                ? () => Promise.reject(new Error("NotAllowedError"))
                : undefined,
          });
          Object.defineProperty(
            HTMLElement.prototype,
            "webkitRequestFullscreen",
            { configurable: true, value: undefined },
          );
          if (mode === "standalone")
            Object.defineProperty(navigator, "standalone", {
              configurable: true,
              value: true,
            });
        }, mode);
        fallback.on("pageerror", (error) => errors.push(error.message));
        await fallback.goto(`${url}/?debug`);
        await fallback.waitForFunction(
          () => window.__runner?.stats().textures === 1,
        );
        await fallback.tap("#action");
        await fallback.waitForFunction(
          () => window.__runner.game.phase === "running",
        );
        assert.equal(
          await fallback.evaluate(() => window.__runner.mobile().standalone),
          mode === "standalone",
        );
        await fallback.tap("#pause");
        await fallback.tap("#settings-toggle");
        assert.equal(
          await fallback.locator("#install-help").isVisible(),
          mode !== "standalone",
        );
        await fallback.setViewportSize({ width: 320, height: 568 });
        await fallback.waitForFunction(
          () => window.__runner.mobile().height === 568,
        );
        const bounds = await fallback.locator("#settings-panel").boundingBox();
        assert.ok(
          bounds.y >= 55 && bounds.y + bounds.height <= 568,
          `${engine}/${mode}: small settings overflow ${JSON.stringify(bounds)}`,
        );
        if (mode === "denied")
          await fallback.screenshot({
            path: `test-results/mobile-${engine}-fullscreen-denied.png`,
          });
        await fallback.close();
      }
      assert.deepEqual(errors, []);
      await context.close();
    } finally {
      await browser.close();
    }
  }
  await writeFile(
    "test-results/mobile-report.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
  console.log(
    "PASS: Chromium Android profile + WebKit iPhone profile, render/run/jump, fullscreen fallbacks, home-screen mode, scroll/selection guards, native slider, viewport and background recovery.",
  );
} finally {
  server.kill();
}

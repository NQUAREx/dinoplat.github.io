import { chromium, webkit, devices } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { checkCollectibles } from "./collectibles-browser.mjs";
import { checkTerrainMotion } from "./terrain-browser.mjs";

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
async function checkLighting(context, engine) {
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(`${url}/?debug&time=9`);
    await page.waitForFunction(() => window.__runner?.stats().textures === 3);
    await page.evaluate(() => {
      const r = window.__runner,
        g = r.game;
      g.phase = "paused";
      g.x = g.previousX = 0;
      g.distance = g.previousDistance = 200;
      g.health.immunity = 0;
      g.y = g.previousY = 0;
      g.velocityY = 0;
      g.terrain.reset(1979);
      g.terrain.advance(g.distance);
      g.world.active.fill(0);
      const defs = g.world.registry.get(0).colliders;
      for (let i = 0; i < 3; i++) {
        const variant = [0, 2, 5][i],
          bounds = defs[variant];
        g.world.active[i] = 1;
        g.world.kinds[i] = 0;
        g.world.variants[i] = variant;
        g.world.angles[i] = 0;
        g.world.x[i] = (i - 1) * 3;
        g.world.z[i] = g.distance + 6 + i * 4;
        g.world.halfX[i] = bounds.halfX;
        g.world.halfZ[i] = bounds.halfZ;
        g.world.height[i] = bounds.height;
        g.world.baseY[i] = 0;
      }
      for (const selector of ["#overlay", ".topbar", ".bottom"])
        document.querySelector(selector).hidden = true;
    });
    const frames = {};
    for (const hour of [9, 15, 18, 0]) {
      const probe = await page.evaluate((hour) => {
        const r = window.__runner;
        r.lighting.setTimeOfDay(hour);
        r.lighting.shadowsEnabled = true;
        r.render();
        const canvas = document.querySelector("#game"),
          gl = canvas.getContext("webgl2");
        const on = new Uint8Array(canvas.width * canvas.height * 4),
          off = new Uint8Array(on.length);
        gl.readPixels(
          0,
          0,
          canvas.width,
          canvas.height,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          on,
        );
        const stats = r.stats();
        r.lighting.shadowsEnabled = false;
        r.render();
        gl.readPixels(
          0,
          0,
          canvas.width,
          canvas.height,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          off,
        );
        let changed = 0,
          sumX = 0,
          brighter = 0;
        for (let i = 0; i < on.length; i += 4) {
          if (
            Math.max(
              off[i] - on[i],
              off[i + 1] - on[i + 1],
              off[i + 2] - on[i + 2],
            ) > 6
          ) {
            changed++;
            sumX += (i / 4) % canvas.width;
          }
          if (
            Math.max(
              on[i] - off[i],
              on[i + 1] - off[i + 1],
              on[i + 2] - off[i + 2],
            ) > 2
          )
            brighter++;
        }
        r.lighting.shadowsEnabled = true;
        r.render();
        return {
          changed,
          centroid: changed ? sumX / changed : 0,
          brighter,
          error: gl.getError(),
          stats,
        };
      }, hour);
      assert.equal(probe.error, 0);
      // Identical coplanar UVs can differ by a texel at a few triangle-edge
      // helper lanes due to GPU derivative precision; reject any broad repaint.
      assert.ok(
        probe.brighter <= 16,
        `shadow sampling changed ${probe.brighter} bright edge pixels`,
      );
      if (hour === 9 || hour === 15 || hour === 0) {
        assert.ok(
          probe.changed > 50,
          `${engine}: sun must create visible ground shadows`,
        );
        assert.ok(probe.stats.shadows > 0);
      }
      assert.ok(probe.stats.calls <= 15);
      assert.equal(probe.stats.textures, 3);
      frames[hour] = probe;
      // Let WebKit present the manually drawn paused frame to its compositor.
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => {
              window.__runner.render();
              requestAnimationFrame(resolve);
            }),
          ),
      );
      await page.screenshot({
        path: `test-results/${engine}-time-${hour}.png`,
      });
    }
    assert.notEqual(frames[0].stats.fogColour, frames[9].stats.fogColour);
    assert.notEqual(frames[18].stats.fogColour, frames[9].stats.fogColour);
    assert.ok(Math.abs(frames[9].centroid - frames[15].centroid) > 2);
    await page.evaluate(() => {
      const r = window.__runner;
      r.lighting.setSunPosition(-8, 12, 4);
      r.render();
    });
    assert.ok(
      Math.abs((await page.evaluate(() => window.__runner.stats().sunX)) + 8) <
        0.3,
    );
    return frames;
  } finally {
    await page.close();
  }
}
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
      await page.waitForFunction(() => window.__runner?.stats().textures === 3);
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
      await page.evaluate(() => {
        const range = document.createRange();
        range.selectNodeContents(document.querySelector("#title"));
        const selected = window.getSelection();
        selected.removeAllRanges();
        selected.addRange(range);
        // WebKit may not emit this for a script-created range on CSS-disabled
        // text. Exercise the guard explicitly; Chromium also gets a real hold.
        document.dispatchEvent(new Event("selectionchange"));
      });
      await page.waitForFunction(() => window.getSelection().rangeCount === 0);
      if (engine === "chromium") {
        const cdp = await context.newCDPSession(page),
          bounds = await page.locator("#title").boundingBox();
        const point = {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        };
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [point],
        });
        await page.waitForTimeout(750);
        assert.equal(
          await page.evaluate(() => window.getSelection().toString()),
          "",
        );
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await cdp.detach();
      }
      const guards = await page.evaluate(() => {
        const result = {};
        for (const type of [
          "contextmenu",
          "selectstart",
          "dragstart",
          "gesturestart",
          "gesturechange",
          "dblclick",
          "touchstart",
          "touchend",
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
      const dive = await page.evaluate(() => {
        const g = window.__runner.game;
        g.move(0);
        g.down();
        return { diving: g.diving, velocity: g.velocityY };
      });
      assert.equal(dive.diving, true);
      assert.ok(dive.velocity <= -22);
      await page.waitForFunction(() => window.__runner.game.y === 0);
      await page.evaluate(() => window.__runner.game.down());
      await page.waitForFunction(() => window.__runner.game.crouch > 0.9);
      assert.equal(
        await page.evaluate(() => window.__runner.stats().playerState),
        "duck",
      );
      assert.ok(
        await page.evaluate(() => window.__runner.game.bodyHeight < 0.8),
      );
      await page.waitForFunction(
        () =>
          window.__runner.game.crouch === 0 &&
          window.__runner.game.crouchRemaining === 0,
      );
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
      results[engine].lighting = await checkLighting(context, engine);
      results[engine].terrainMotion = await checkTerrainMotion(
        context,
        url,
        engine,
      );
      results[engine].collectibles = await checkCollectibles(
        context,
        url,
        engine,
      );
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
          () => window.__runner?.stats().textures === 3,
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

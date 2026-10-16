import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { MobileBrowser } from "../src/mobile-browser.ts";

function environment(t: TestContext) {
  class Node extends EventTarget {
    hidden = false;
    textContent = "";
    dataset: Record<string, string> = {};
    style = {
      setProperty: (key: string, value: string) => styles.set(key, value),
    };
    closest() {
      return null;
    }
  }
  class Media extends EventTarget {
    matches = false;
  }
  const styles = new Map<string, string>();
  const root = new Node() as Node & {
    requestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
    webkitRequestFullscreen?: () => Promise<void>;
  };
  const button = new Node(),
    hint = new Node();
  const doc = Object.assign(new EventTarget(), {
    documentElement: root,
    body: new Node(),
    fullscreenElement: null as Node | null,
    fullscreenEnabled: true,
    webkitFullscreenElement: null as Node | null,
    getElementById: (id: string) => (id === "fullscreen" ? button : hint),
  });
  const viewport = Object.assign(new EventTarget(), {
    width: 390,
    height: 740,
    scale: 1,
  });
  const win = Object.assign(new EventTarget(), {
    innerWidth: 390,
    innerHeight: 844,
    visualViewport: viewport,
  });
  const nav = {
    maxTouchPoints: 5,
    platform: "Linux armv8",
    userAgent: "Android",
    userActivation: { isActive: true },
    standalone: false,
  };
  const medias = new Map<string, Media>();
  const frames = new Map<number, FrameRequestCallback>();
  let frame = 0,
    calls = 0,
    resizes = 0,
    suspends = 0;
  root.requestFullscreen = async (options) => {
    assert.equal(options?.navigationUI, "hide");
    calls++;
    doc.fullscreenElement = root;
    doc.dispatchEvent(new Event("fullscreenchange"));
  };
  const globals = {
    window: win,
    document: doc,
    navigator: nav,
    Element: Node,
    screen: {
      orientation: {
        lock: async () => {
          throw new Error("unsupported");
        },
      },
    },
    matchMedia: (query: string) => {
      if (!medias.has(query)) medias.set(query, new Media());
      return medias.get(query)!;
    },
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++frame, callback);
      return frame;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  };
  const old = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries(globals)) {
    old.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  const mobile = new MobileBrowser(
    () => resizes++,
    () => suspends++,
  );
  t.after(() => {
    mobile.dispose();
    for (const [key, descriptor] of old) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  return {
    mobile,
    root,
    doc,
    win,
    nav,
    viewport,
    styles,
    frames,
    button,
    hint,
    medias,
    calls: () => calls,
    resizes: () => resizes,
    suspends: () => suspends,
    flush: () => {
      const queued = [...frames.values()];
      frames.clear();
      for (const callback of queued) callback(0);
    },
  };
}
test("fullscreen is user-activated, hides navigation UI, and exit suspends gameplay", async (t) => {
  const env = environment(t);
  assert.equal(env.calls(), 0);
  await env.mobile.enterFullscreen();
  assert.equal(env.calls(), 1);
  assert.equal(env.doc.body.dataset.displayMode, "fullscreen");
  assert.equal(env.button.hidden, true);
  await env.mobile.enterFullscreen();
  assert.equal(env.calls(), 1);
  env.doc.fullscreenElement = null;
  env.doc.dispatchEvent(new Event("fullscreenchange"));
  assert.equal(env.suspends(), 1);
  assert.equal(env.doc.body.dataset.displayMode, "browser");
});
test("missing, denied and inactive fullscreen safely preserve playable browser mode", async (t) => {
  const env = environment(t);
  env.nav.userActivation.isActive = false;
  await env.mobile.enterFullscreen();
  assert.equal(env.calls(), 0);
  env.nav.userActivation.isActive = true;
  env.root.requestFullscreen = async () => {
    throw new Error("NotAllowedError");
  };
  await env.mobile.enterFullscreen();
  assert.equal(env.mobile.fullscreen, false);
  env.root.requestFullscreen = undefined;
  await env.mobile.enterFullscreen();
  assert.equal(env.mobile.canFullscreen, false);
  assert.equal(env.suspends(), 0);
});
test("WebKit prefixed fullscreen and iOS home-screen launch are supported without UA-only gating", async (t) => {
  const env = environment(t);
  env.root.requestFullscreen = undefined;
  env.root.webkitRequestFullscreen = async () => {
    env.doc.webkitFullscreenElement = env.root;
    env.doc.dispatchEvent(new Event("webkitfullscreenchange"));
  };
  await env.mobile.enterFullscreen();
  assert.equal(env.mobile.fullscreen, true);
  env.doc.webkitFullscreenElement = null;
  env.nav.standalone = true;
  env.doc.dispatchEvent(new Event("webkitfullscreenchange"));
  assert.equal(env.doc.body.dataset.displayMode, "standalone");
  assert.equal(env.hint.hidden, true);
  env.nav.platform = "MacIntel";
  env.nav.userAgent = "Macintosh";
  assert.equal(MobileBrowser.supported(), true);
  env.nav.maxTouchPoints = 0;
  assert.equal(MobileBrowser.supported(), false);
  const media = env.medias.get("(any-pointer: coarse)")!;
  media.matches = true;
  assert.equal(MobileBrowser.supported(), true);
});
test("viewport events coalesce, long-press defaults are blocked and lifecycle listeners dispose", (t) => {
  const env = environment(t);
  assert.equal(env.styles.get("--viewport-height"), "740px");
  for (let i = 0; i < 20; i++) env.viewport.dispatchEvent(new Event("resize"));
  assert.equal(env.frames.size, 1);
  env.flush();
  assert.equal(env.resizes(), 1);
  env.viewport.height = 650;
  env.mobile.requestResize();
  env.flush();
  assert.equal(env.styles.get("--viewport-height"), "650px");
  env.viewport.scale = 2;
  env.mobile.requestResize();
  env.flush();
  assert.equal(env.styles.get("--viewport-height"), "844px");
  for (const type of [
    "contextmenu",
    "selectstart",
    "dragstart",
    "gesturestart",
    "gesturechange",
    "gestureend",
    "dblclick",
  ]) {
    const event = new Event(type, { cancelable: true });
    env.doc.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
  }
  env.win.dispatchEvent(new Event("pagehide"));
  assert.equal(env.suspends(), 1);
  env.mobile.requestResize();
  env.mobile.dispose();
  assert.equal(env.frames.size, 0);
  const event = new Event("contextmenu", { cancelable: true });
  env.doc.dispatchEvent(event);
  assert.equal(event.defaultPrevented, false);
});
test("native long-press touch defaults and selection ranges are cleared, native ranges remain exempt", (t) => {
  const env = environment(t);
  let cleared = 0;
  Object.assign(env.win, {
    getSelection: () => ({ rangeCount: 1, removeAllRanges: () => cleared++ }),
  });
  env.doc.dispatchEvent(new Event("selectionchange"));
  assert.equal(cleared, 1);
  for (const type of ["touchstart", "touchend"]) {
    const event = new Event(type, { cancelable: true });
    env.doc.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
  }
  const rangeTarget = Object.assign(env.root, { closest: () => env.root });
  const event = new Event("touchstart", { cancelable: true });
  Object.defineProperty(event, "target", { value: rangeTarget });
  env.doc.dispatchEvent(event);
  assert.equal(event.defaultPrevented, false);
});
test("native author editing preserves selection and marks soft-keyboard focus", (t) => {
  const env = environment(t);
  const input = Object.assign(env.root, { closest: (selector: string) => selector.includes("data-native-input") ? env.root : null });
  let cleared = 0;
  Object.assign(env.doc, { activeElement: input });
  Object.assign(env.win, { getSelection: () => ({ rangeCount: 1, removeAllRanges: () => cleared++ }) });
  for (const type of ["focusin", "touchstart", "pointerdown", "selectionchange"]) {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, { target: { value: input }, pointerType: { value: "touch" } });
    env.doc.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
  }
  assert.equal(cleared, 0);
  assert.equal(env.doc.body.dataset.editing, "true");
  const blur = new Event("focusout");
  Object.defineProperty(blur, "target", { value: input });
  env.doc.dispatchEvent(blur);
  assert.equal(env.doc.body.dataset.editing, undefined);
});
test("static home-screen manifest and PNG icons resolve inside GitHub Pages subpath", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../public/manifest.webmanifest", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(manifest.display, "fullscreen");
  assert.equal(manifest.orientation, "portrait");
  const base = "https://example.github.io/DinoPlat3d/manifest.webmanifest";
  assert.equal(new URL(manifest.start_url, base).pathname, "/DinoPlat3d/");
  for (const icon of manifest.icons) {
    assert.ok(
      new URL(icon.src, base).pathname.startsWith("/DinoPlat3d/icons/"),
    );
    const png = await readFile(
      new URL(`../public/${icon.src}`, import.meta.url),
    );
    assert.equal(png.readUInt32BE(16), Number(icon.sizes.split("x")[0]));
    assert.equal(png.readUInt32BE(20), Number(icon.sizes.split("x")[1]));
  }
});

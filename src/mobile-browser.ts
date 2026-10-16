type FullscreenRoot = HTMLElement & {
  webkitRequestFullscreen?: () => void | Promise<void>;
};
type MobileDocument = Document & {
  webkitFullscreenElement?: Element;
  webkitFullscreenEnabled?: boolean;
};

/** Browser chrome/lifecycle adapter, not a game-loop component. No polling. */
export class MobileBrowser {
  private readonly abort = new AbortController();
  private resizeFrame = 0;
  private pendingFullscreen = false;
  private alive = true;
  private wasFullscreen = false;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private readonly standaloneMedia = matchMedia("(display-mode: standalone)");
  private readonly fullscreenMedia = matchMedia("(display-mode: fullscreen)");

  static supported() {
    return (
      matchMedia("(any-pointer: coarse)").matches ||
      matchMedia("(pointer: coarse)").matches ||
      (navigator.maxTouchPoints > 0 &&
        (/Android|iPhone|iPad|iPod/.test(navigator.userAgent) ||
          (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)))
    );
  }
  constructor(
    private readonly resize: () => void,
    private readonly suspend: () => void,
  ) {
    const options = { signal: this.abort.signal };
    const prevent = (event: Event) => {
      if (event.cancelable) event.preventDefault();
    };
    for (const type of [
      "contextmenu",
      "selectstart",
      "dragstart",
      "dblclick",
      "gesturestart",
      "gesturechange",
      "gestureend",
    ])
      document.addEventListener(type, prevent, {
        ...options,
        passive: false,
        capture: true,
      });
    const clearSelection = () => {
      const selection = window.getSelection?.();
      if (selection?.rangeCount) selection.removeAllRanges();
    };
    document.addEventListener("selectionchange", clearSelection, options);
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (event.pointerType !== "touch") return;
        clearSelection();
        if (
          event.target instanceof Element &&
          !event.target.closest('input[type="range"], a[href]')
        )
          prevent(event);
      },
      { ...options, passive: false, capture: true },
    );
    // Cancel native touch long-press too; Pointer Events alone are insufficient.
    for (const type of ["touchstart", "touchend"])
      document.addEventListener(
        type,
        (event) => {
          clearSelection();
          if (
            event.target instanceof Element &&
            event.target.closest('input[type="range"], a[href]')
          )
            return;
          prevent(event);
        },
        { ...options, passive: false, capture: true },
      );
    document.addEventListener(
      "touchmove",
      (event) => {
        // Native range dragging must survive the page scroll/zoom guard.
        if (
          event.touches.length === 1 &&
          event.target instanceof Element &&
          event.target.closest('input[type="range"]')
        )
          return;
        prevent(event);
      },
      { ...options, passive: false, capture: true },
    );
    window.addEventListener("resize", this.requestResize, options);
    window.visualViewport?.addEventListener(
      "resize",
      this.requestResize,
      options,
    );
    window.visualViewport?.addEventListener(
      "scroll",
      this.requestResize,
      options,
    );
    this.standaloneMedia.addEventListener(
      "change",
      this.displayChanged,
      options,
    );
    this.fullscreenMedia.addEventListener(
      "change",
      this.displayChanged,
      options,
    );
    document.addEventListener("fullscreenchange", this.displayChanged, options);
    document.addEventListener(
      "webkitfullscreenchange",
      this.displayChanged,
      options,
    );
    window.addEventListener("pagehide", suspend, options);
    document.addEventListener("freeze", suspend, options);
    window.addEventListener("pageshow", this.requestResize, options);
    this.updateDisplay();
    this.updateViewport();
  }
  get fullscreen() {
    const doc = document as MobileDocument;
    return !!(doc.fullscreenElement || doc.webkitFullscreenElement);
  }
  get standalone() {
    return (
      (navigator as Navigator & { standalone?: boolean }).standalone === true ||
      this.standaloneMedia.matches ||
      this.fullscreenMedia.matches
    );
  }
  get canFullscreen() {
    const root = document.documentElement as FullscreenRoot;
    const doc = document as MobileDocument;
    return (
      (typeof root.requestFullscreen === "function" &&
        doc.fullscreenEnabled !== false) ||
      (typeof root.webkitRequestFullscreen === "function" &&
        doc.webkitFullscreenEnabled !== false)
    );
  }
  /** Must be invoked synchronously from a real touch activation, never on load. */
  async enterFullscreen() {
    if (
      !this.alive ||
      this.pendingFullscreen ||
      this.fullscreen ||
      this.standalone ||
      !this.canFullscreen ||
      navigator.userActivation?.isActive === false
    )
      return;
    const root = document.documentElement as FullscreenRoot;
    this.pendingFullscreen = true;
    try {
      if (
        typeof root.requestFullscreen === "function" &&
        document.fullscreenEnabled !== false
      )
        await root.requestFullscreen({ navigationUI: "hide" });
      else await root.webkitRequestFullscreen?.();
      if (!this.alive || !this.fullscreen) return;
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (value: "portrait") => Promise<void>;
      };
      try {
        await orientation?.lock?.("portrait");
      } catch {
        /* Not available on iPhone / some embeds. */
      }
    } catch {
      /* Browser policy / iPhone / iframe denial: keep the game playable. */
    } finally {
      this.pendingFullscreen = false;
      if (this.alive) {
        this.updateDisplay();
        this.requestResize();
      }
    }
  }
  private readonly displayChanged = () => {
    const exited = this.wasFullscreen && !this.fullscreen;
    this.updateDisplay();
    if (exited) this.suspend();
    this.requestResize();
  };
  private updateDisplay() {
    this.wasFullscreen = this.fullscreen;
    const active = this.fullscreen || this.standalone;
    document.body.dataset.displayMode = this.fullscreen
      ? "fullscreen"
      : this.standalone
        ? "standalone"
        : "browser";
    const button = document.getElementById("fullscreen");
    if (button) button.hidden = active || !this.canFullscreen;
    const hint = document.getElementById("install-help");
    if (hint) {
      hint.hidden = active;
      const ios =
        /iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      hint.textContent = ios
        ? "Без панелей Safari: Поделиться → На экран «Домой». Открывай игру с новой иконки."
        : "Для запуска без панелей браузера добавь игру на главный экран через меню браузера.";
    }
  }
  readonly requestResize = () => {
    if (!this.alive || this.resizeFrame) return;
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = 0;
      this.updateViewport();
      this.resize();
    });
  };
  private updateViewport() {
    const viewport = window.visualViewport;
    const unscaled = viewport && Math.abs(viewport.scale - 1) < 0.01;
    const width = Math.round(unscaled ? viewport.width : window.innerWidth);
    const height = Math.round(unscaled ? viewport.height : window.innerHeight);
    if (width === this.viewportWidth && height === this.viewportHeight) return;
    this.viewportWidth = width;
    this.viewportHeight = height;
    document.documentElement.style.setProperty(
      "--viewport-width",
      `${width}px`,
    );
    document.documentElement.style.setProperty(
      "--viewport-height",
      `${height}px`,
    );
  }
  stats() {
    return {
      fullscreen: this.fullscreen,
      standalone: this.standalone,
      supported: this.canFullscreen,
      width: this.viewportWidth,
      height: this.viewportHeight,
    };
  }
  dispose() {
    this.alive = false;
    this.abort.abort();
    cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = 0;
  }
}

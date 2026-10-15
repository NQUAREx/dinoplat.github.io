export class Input {
  private readonly abort = new AbortController();
  private pointer = -1;
  private startX = 0;
  private startY = 0;
  private started = 0;
  constructor(
    canvas: HTMLCanvasElement,
    move: (direction: number) => void,
    jump: () => void,
    pause: () => void,
    start: () => void,
  ) {
    const options = { signal: this.abort.signal };
    window.addEventListener(
      "keydown",
      (event) => {
        if ((event.target as HTMLElement).closest("button,a")) return;
        if (
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(
            event.code,
          )
        )
          event.preventDefault();
        if (event.repeat) return;
        if (event.code === "ArrowLeft" || event.code === "KeyA") move(-1);
        if (event.code === "ArrowRight" || event.code === "KeyD") move(1);
        if (
          event.code === "ArrowUp" ||
          event.code === "KeyW" ||
          event.code === "Space"
        )
          jump();
        if (event.code === "Escape" || event.code === "KeyP") pause();
        if (event.code === "Enter") start();
      },
      options,
    );
    canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (
          !event.isPrimary ||
          (event.pointerType === "mouse" && event.button !== 0)
        )
          return;
        this.pointer = event.pointerId;
        this.startX = event.clientX;
        this.startY = event.clientY;
        this.started = performance.now();
        canvas.setPointerCapture(event.pointerId);
      },
      options,
    );
    canvas.addEventListener(
      "pointerup",
      (event) => {
        if (event.pointerId !== this.pointer) return;
        this.pointer = -1;
        const dx = event.clientX - this.startX,
          dy = event.clientY - this.startY;
        if (Math.abs(dy) > Math.abs(dx) && dy < -28) jump();
        else if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy))
          move(Math.sign(dx));
        else if (
          Math.abs(dx) < 20 &&
          Math.abs(dy) < 20 &&
          performance.now() - this.started < 500
        )
          move(
            this.startX <
              canvas.getBoundingClientRect().left + canvas.clientWidth / 2
              ? -1
              : 1,
          );
      },
      options,
    );
    canvas.addEventListener(
      "pointercancel",
      () => {
        this.pointer = -1;
      },
      options,
    );
    canvas.addEventListener(
      "lostpointercapture",
      () => {
        this.pointer = -1;
      },
      options,
    );
  }
  dispose() {
    this.abort.abort();
  }
}

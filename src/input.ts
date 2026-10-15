import { GestureRecognizer } from "./gesture";

/** Touch-only adapter; classification is pure and independently testable. */
export class Input {
  private readonly abort = new AbortController();
  private readonly gesture: GestureRecognizer;
  private pointer = -1;
  constructor(
    canvas: HTMLCanvasElement,
    steer: (direction: number) => void,
    jump: () => void,
  ) {
    this.gesture = new GestureRecognizer(steer, jump);
    const options = { signal: this.abort.signal };
    const direction = (x: number) =>
      x < canvas.getBoundingClientRect().left + canvas.clientWidth / 2 ? -1 : 1;
    canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (
          event.pointerType !== "touch" ||
          !event.isPrimary ||
          this.pointer !== -1
        )
          return;
        event.preventDefault();
        this.pointer = event.pointerId;
        canvas.setPointerCapture(event.pointerId);
        this.gesture.begin(
          event.clientX,
          event.clientY,
          performance.now(),
          direction(event.clientX),
        );
      },
      options,
    );
    canvas.addEventListener(
      "pointermove",
      (event) => {
        if (event.pointerId !== this.pointer) return;
        event.preventDefault();
        this.gesture.move(
          event.clientX,
          event.clientY,
          direction(event.clientX),
        );
      },
      options,
    );
    for (const type of [
      "pointerup",
      "pointercancel",
      "lostpointercapture",
    ] as const)
      canvas.addEventListener(
        type,
        (event) => {
          if (event.pointerId !== this.pointer) return;
          if (type === "pointerup")
            this.gesture.move(
              event.clientX,
              event.clientY,
              direction(event.clientX),
            );
          this.clear();
        },
        options,
      );
    window.addEventListener("blur", () => this.clear(), options);
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) this.clear();
      },
      options,
    );
  }
  update(now: number) {
    this.gesture.update(now);
  }
  clear() {
    this.pointer = -1;
    this.gesture.clear();
  }
  dispose() {
    this.clear();
    this.abort.abort();
  }
}

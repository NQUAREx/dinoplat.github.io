/** Touch-only held steering. No click increments or desktop fallback. */
export class Input {
  private readonly abort = new AbortController();
  private pointer = -1;
  private startX = 0;
  private startY = 0;
  private swiped = false;
  constructor(
    canvas: HTMLCanvasElement,
    private readonly move: (direction: number) => void,
    jump: () => void,
  ) {
    const options = { signal: this.abort.signal };
    const steer = (x: number) => {
      const bounds = canvas.getBoundingClientRect();
      move(x < bounds.left + bounds.width / 2 ? -1 : 1);
    };
    canvas.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "touch" || !event.isPrimary || this.pointer !== -1) return;
      event.preventDefault();
      this.pointer = event.pointerId;
      this.startX = event.clientX;
      this.startY = event.clientY;
      this.swiped = false;
      canvas.setPointerCapture(event.pointerId);
      steer(event.clientX);
    }, options);
    canvas.addEventListener("pointermove", (event) => {
      if (event.pointerId !== this.pointer) return;
      event.preventDefault();
      const dx = event.clientX - this.startX;
      const dy = event.clientY - this.startY;
      if (!this.swiped && dy < -28 && -dy > Math.abs(dx)) {
        this.swiped = true;
        move(0);
        jump();
      } else if (!this.swiped) steer(event.clientX);
    }, options);
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"] as const)
      canvas.addEventListener(name, (event) => {
        if (event.pointerId === this.pointer) this.clear();
      }, options);
    window.addEventListener("blur", () => this.clear(), options);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.clear();
    }, options);
  }
  clear() {
    this.pointer = -1;
    this.swiped = false;
    this.move(0);
  }
  dispose() { this.clear(); this.abort.abort(); }
}

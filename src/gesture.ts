/** Classifies before moving. Up-swipes never need positional rollback. */
export class GestureRecognizer {
  static readonly holdDelay = 140;
  private active = false;
  private state: "pending" | "hold" | "jump" = "pending";
  private startX = 0;
  private startY = 0;
  private started = 0;
  private moved = false;
  private direction = 0;
  constructor(
    private readonly steer: (value: number) => void,
    private readonly jump: () => void,
  ) {}
  begin(x: number, y: number, now: number, direction: number) {
    this.clear();
    this.active = true;
    this.state = "pending";
    this.startX = x;
    this.startY = y;
    this.started = now;
    this.direction = direction;
    this.moved = false;
  }
  move(x: number, y: number, direction: number) {
    if (!this.active) return;
    const dx = x - this.startX,
      dy = y - this.startY;
    this.direction = direction;
    if (this.state === "jump") return;
    // Classification is exclusive. A confirmed hold cannot later become a jump;
    // release it and start a fresh swipe. Thus jumping never inherits steering.
    if (this.state === "hold") {
      this.steer(direction);
      return;
    }
    if (dy < -24 && -dy > Math.abs(dx) * 1.15) {
      this.state = "jump";
      this.steer(0);
      this.jump();
      return;
    }
    if (Math.abs(dy) > 5 || Math.abs(dx) > 5) this.moved = true;
    if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      this.state = "hold";
      this.steer(direction);
    }
  }
  update(now: number) {
    // A moving finger is still a gesture, however slowly it moves upward.
    if (
      this.active &&
      this.state === "pending" &&
      !this.moved &&
      now - this.started >= GestureRecognizer.holdDelay
    ) {
      this.state = "hold";
      this.steer(this.direction);
    }
  }
  clear() {
    this.active = false;
    this.state = "pending";
    this.steer(0);
  }
}

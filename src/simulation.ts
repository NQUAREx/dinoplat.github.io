import { Terrain } from "./terrain";
// Independent of Three.js and DOM: replace presentation without changing rules.
export const LANES = 5;
export const LANE_WIDTH = 2.1;
export const CENTER_LANE = Math.floor(LANES / 2);
export const ROAD_WIDTH = LANES * LANE_WIDTH;
export const ROW_COUNT = 12;
export const ROW_GAP = 18;
// Must remain behind the complete cube's screen exit; camera tests verify this.
export const ROW_RECYCLE_Z = -16;
export const MAX_SPEED = 24;
export const STEP = 1 / 120;
export const SIDE_SPEED = 8;
export const CUBE_SIZE = 1.2;
// Rotation-invariant body collider; decorative tail is excluded.
export const PLAYER_RADIUS = 0.32;
export const MAX_PLAYER_X = ROAD_WIDTH / 2 - PLAYER_RADIUS;
export const MAX_HEADING = Math.PI / 4;
const TURN_SPEED = Math.PI * 5;
export const laneX = (lane: number) => (lane - (LANES - 1) / 2) * LANE_WIDTH;
export type Phase = "ready" | "running" | "paused" | "over";

export class Simulation {
  readonly terrain = new Terrain();
  readonly rowZ = new Float64Array(ROW_COUNT);
  readonly masks = new Uint8Array(ROW_COUNT);
  readonly safeLanes = new Uint8Array(ROW_COUNT);
  phase: Phase = "ready";
  x = 0;
  previousX = 0;
  previousY = 0;
  previousHeading = 0;
  steering = 0;
  heading = 0;
  movingX = 0;
  y = 0;
  velocityY = 0;
  distance = 0;
  speed = 12;
  private state = 1;
  private safeLane = CENTER_LANE;
  constructor(seed = 1) {
    this.reset(seed);
  }

  reset(seed: number) {
    this.terrain.reset(seed);
    this.state = seed >>> 0 || 1;
    this.phase = "ready";
    this.safeLane = CENTER_LANE;
    this.x = this.steering = this.heading = this.movingX = 0;
    this.previousX = this.previousY = this.previousHeading = 0;
    this.y = this.velocityY = this.distance = 0;
    this.speed = 12;
    for (let i = 0; i < ROW_COUNT; i++) {
      this.rowZ[i] = 42 + i * ROW_GAP;
      this.generate(i);
    }
  }

  private random() {
    let s = this.state;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.state = s >>> 0;
    return this.state / 4294967296;
  }

  private generate(i: number) {
    this.safeLane = Math.max(
      0,
      Math.min(LANES - 1, this.safeLane + Math.floor(this.random() * 3) - 1),
    );
    this.safeLanes[i] = this.safeLane;
    let mask = 0;
    for (let lane = 0; lane < LANES; lane++) {
      if (lane !== this.safeLane && this.random() < 0.64) mask |= 1 << lane;
    }
    if (!mask)
      mask =
        1 <<
        ((this.safeLane + 1 + Math.floor(this.random() * (LANES - 1))) % LANES);
    this.masks[i] = mask;
  }

  move(direction: number) {
    // Held axis, not a destination. Release stops at any fractional coordinate.
    this.steering = this.phase === "running" ? Math.sign(direction) : 0;
  }
  jump() {
    if (this.phase === "running" && this.y === 0) this.velocityY = 8.6;
  }

  step(dt: number) {
    if (this.phase !== "running") return;
    const oldX = this.x,
      oldY = this.y;
    this.previousX = oldX;
    this.previousY = oldY;
    this.previousHeading = this.heading;
    this.x = Math.max(-MAX_PLAYER_X, Math.min(MAX_PLAYER_X,
      this.x + this.steering * SIDE_SPEED * dt));
    this.movingX = Math.sign(this.x - oldX);
    const targetHeading = -this.movingX * MAX_HEADING;
    const turn = targetHeading - this.heading;
    this.heading += Math.sign(turn) * Math.min(Math.abs(turn), TURN_SPEED * dt);
    if (this.y > 0 || this.velocityY > 0) {
      this.y = Math.max(0, this.y + this.velocityY * dt - 11 * dt * dt);
      this.velocityY -= 22 * dt;
      if (this.y === 0) this.velocityY = 0;
    }
    this.speed = Math.min(MAX_SPEED, 12 + this.distance * 0.008);
    const travel = this.speed * dt;
    this.distance += travel;
    this.terrain.advance(this.distance);
    const extent = CUBE_SIZE / 2 + PLAYER_RADIUS;
    for (let i = 0; i < ROW_COUNT; i++) {
      const before = this.rowZ[i],
        after = before - travel;
      this.rowZ[i] = after;
      // Swept body AABB: actual continuous X/Z/Y, never a column index.
      if (after <= extent && before >= -extent) {
        const enter = Math.max(0, (before - extent) / travel);
        const leave = Math.min(1, (before + extent) / travel);
        for (let lane = 0; lane < LANES; lane++) {
          if (!(this.masks[i] & (1 << lane))) continue;
          const dx = this.x - oldX,
            center = laneX(lane);
          let low = enter,
            high = leave;
          if (Math.abs(dx) < 1e-9) {
            if (Math.abs(oldX - center) >= extent) continue;
          } else {
            const a = (center - extent - oldX) / dx,
              b = (center + extent - oldX) / dx;
            low = Math.max(low, Math.min(a, b));
            high = Math.min(high, Math.max(a, b));
          }
          if (
            low <= high &&
            Math.min(
              oldY + (this.y - oldY) * low,
              oldY + (this.y - oldY) * high,
            ) < CUBE_SIZE
          ) {
            this.phase = "over";
            return;
          }
        }
      }
      if (after < ROW_RECYCLE_Z) {
        this.rowZ[i] += ROW_COUNT * ROW_GAP;
        this.generate(i);
      }
    }
  }
}

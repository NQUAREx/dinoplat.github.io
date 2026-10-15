import { Rules } from "./config";
import { GameEvent, GameEvents } from "./events";
import { BonusSystem, Currency, Health, Wallet } from "./progression";
import { ObjectKind, ObjectRegistry, WorldSpawner } from "./world";
import { Terrain } from "./terrain";

export type Phase = "ready" | "running" | "paused" | "over";
export const STEP = Rules.step;

/** Pure numerical simulation. World coordinates are Float64; the renderer uses
 * a moving player-centred origin before uploading any Float32 GPU positions. */
export class Simulation {
  readonly events = new GameEvents();
  readonly terrain = new Terrain();
  readonly wallet = new Wallet(this.events);
  readonly health = new Health(this.events);
  readonly bonuses = new BonusSystem(this.events);
  readonly world: WorldSpawner;
  phase: Phase = "ready";
  seed = 1;
  x = 0;
  previousX = 0;
  y = 0;
  previousY = 0;
  heading = 0;
  previousHeading = 0;
  movingX = 0;
  steering = 0;
  velocityY = 0;
  diving = false;
  crouch = 0;
  previousCrouch = 0;
  crouchRemaining = 0;
  distance = 0;
  previousDistance = 0;
  speed = Rules.startSpeed;
  time = 0;
  private nextStep = 0;
  constructor(seed = 1, registry = ObjectRegistry.defaults()) {
    this.world = new WorldSpawner(registry);
    this.reset(seed);
  }
  reset(seed: number) {
    this.seed = seed >>> 0 || 1;
    this.phase = "ready";
    this.x = this.previousX = this.y = this.previousY = 0;
    this.heading = this.previousHeading = this.movingX = this.steering = 0;
    this.velocityY = this.distance = this.previousDistance = this.time = 0;
    this.diving = false;
    this.crouch = this.previousCrouch = this.crouchRemaining = 0;
    this.speed = Rules.startSpeed;
    this.nextStep = Rules.stepStride;
    this.world.reset(this.seed);
    this.world.update(0, 0);
    this.terrain.reset(this.seed);
    this.health.reset();
    this.wallet.reset();
    this.bonuses.reset();
    this.events.emit(GameEvent.Start);
  }
  move(direction: number) {
    this.steering = this.phase === "running" ? Math.sign(direction) : 0;
  }
  jump() {
    if (this.phase !== "running" || this.y !== 0) return;
    this.velocityY = Rules.jumpSpeed * this.bonuses.jumpFactor;
    this.diving = false;
    this.crouch = this.previousCrouch = this.crouchRemaining = 0;
    this.events.emit(GameEvent.Jump);
  }
  get bodyHeight() {
    return (
      Rules.playerBodyHeight +
      (Rules.duckBodyHeight - Rules.playerBodyHeight) * this.crouch
    );
  }
  down() {
    if (this.phase !== "running") return;
    if (this.y > 0 || this.velocityY > 0) {
      this.velocityY = Math.min(this.velocityY, -Rules.diveSpeed);
      if (!this.diving) this.events.emit(GameEvent.Dive);
      this.diving = true;
    } else {
      this.crouchRemaining = Rules.duckDuration;
      this.events.emit(GameEvent.Duck);
    }
  }
  step(dt: number) {
    if (this.phase !== "running") return;
    this.previousX = this.x;
    this.previousY = this.y;
    this.previousCrouch = this.crouch;
    this.previousHeading = this.heading;
    this.previousDistance = this.distance;
    this.time += dt;
    this.health.step(dt);
    this.bonuses.step(dt);
    const ducking = this.crouchRemaining > 0;
    this.crouchRemaining = Math.max(0, this.crouchRemaining - dt);
    this.crouch +=
      Math.sign((ducking ? 1 : 0) - this.crouch) *
      Math.min(
        Math.abs((ducking ? 1 : 0) - this.crouch),
        Rules.duckBlendSpeed * dt,
      );
    this.x += this.steering * Rules.sideSpeed * dt; // Deliberately no lateral bounds.
    this.movingX = this.steering;
    const turn = (-this.movingX * Math.PI) / 4 - this.heading;
    this.heading +=
      Math.sign(turn) * Math.min(Math.abs(turn), Math.PI * 5 * dt);
    const airborne = this.y > 0 || this.velocityY > 0 || this.diving;
    if (airborne) {
      this.y = Math.max(
        0,
        this.y + this.velocityY * dt - (Rules.gravity * dt * dt) / 2,
      );
      this.velocityY -= Rules.gravity * dt;
      if (!this.y) {
        this.velocityY = 0;
        this.diving = false;
        this.events.emit(GameEvent.Land);
      }
    }
    // Future speed bonuses must stay inside the generator's proven timing budget.
    this.speed =
      this.health.immunity > 0
        ? Rules.startSpeed
        : Math.min(
            Rules.maxSpeed,
            (Rules.startSpeed + this.distance * 0.008) *
              this.bonuses.speedFactor,
          );
    this.distance += this.speed * dt;
    this.world.update(this.x, this.distance);
    this.terrain.advance(this.distance);
    this.collisions();
    if (this.distance >= this.nextStep) {
      this.nextStep = this.distance + Rules.stepStride;
      if (!this.y && !this.velocityY) this.events.emit(GameEvent.Step);
    }
  }
  private collisions() {
    const pool = this.world,
      dx = this.x - this.previousX,
      dz = this.distance - this.previousDistance;
    for (let i = 0; i < pool.active.length; i++) {
      if (!pool.active[i]) continue;
      const extentX = pool.halfX[i] + Rules.playerRadius,
        extentZ = pool.halfZ[i] + Rules.playerRadius;
      if (
        pool.z[i] < this.previousDistance - extentZ ||
        pool.z[i] > this.distance + extentZ
      )
        continue;
      const definition = pool.registry.get(pool.kinds[i]);
      if (
        !definition ||
        (definition.blocking &&
          (this.health.immunity > 0 || this.bonuses.shield))
      )
        continue;
      let enter = Math.max(
        0,
        (pool.z[i] - extentZ - this.previousDistance) / dz,
      );
      let leave = Math.min(
        1,
        (pool.z[i] + extentZ - this.previousDistance) / dz,
      );
      if (Math.abs(dx) < 1e-9) {
        if (Math.abs(this.previousX - pool.x[i]) >= extentX) continue;
      } else {
        const a = (pool.x[i] - extentX - this.previousX) / dx,
          b = (pool.x[i] + extentX - this.previousX) / dx;
        enter = Math.max(enter, Math.min(a, b));
        leave = Math.min(leave, Math.max(a, b));
      }
      if (enter > leave) continue;
      const yEnter = this.previousY + (this.y - this.previousY) * enter;
      const yLeave = this.previousY + (this.y - this.previousY) * leave;
      const previousTop =
        this.previousY +
        Rules.playerBodyHeight +
        (Rules.duckBodyHeight - Rules.playerBodyHeight) * this.previousCrouch;
      const top = this.y + this.bodyHeight;
      const topEnter = previousTop + (top - previousTop) * enter;
      const topLeave = previousTop + (top - previousTop) * leave;
      if (
        Math.min(yEnter, yLeave) >= pool.baseY[i] + pool.height[i] ||
        Math.max(topEnter, topLeave) <= pool.baseY[i]
      )
        continue;
      if (definition.blocking) {
        if (!this.bonuses.shield && this.health.damage()) {
          this.speed = Rules.startSpeed;
          if (!this.health.lives) {
            this.phase = "over";
            this.move(0);
            return;
          }
        }
      } else {
        if (definition.kind === ObjectKind.Coin)
          this.wallet.add(Currency.Coin, definition.reward ?? 1);
        else if (definition.kind === ObjectKind.Diamond)
          this.wallet.add(Currency.Diamond, definition.reward ?? 1);
        else if (
          definition.kind === ObjectKind.Bonus &&
          definition.bonusId !== undefined
        )
          this.bonuses.activate(definition.bonusId);
        pool.consume(i);
      }
    }
  }
}

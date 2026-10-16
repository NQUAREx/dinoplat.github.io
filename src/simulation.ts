import { Rules } from "./config";
import { GameEvent, GameEvents } from "./events";
import { BonusSystem, Currency, Health, Wallet } from "./progression";
import { ObjectKind, ObjectRegistry, WorldSpawner } from "./world";
import { Terrain } from "./terrain";
import { PickupMotion } from "./pickup-motion";

export type Phase = "ready" | "running" | "paused" | "over";
export const STEP = Rules.step;

/** Pure numerical simulation. World coordinates are Float64; the renderer uses
 * a moving player-centred origin before uploading any Float32 GPU positions. */
export class Simulation {
  readonly events = new GameEvents();
  readonly terrain = new Terrain();
  readonly wallet = new Wallet(this.events);
  readonly health = new Health(this.events);
  readonly pickupMotion = new PickupMotion();
  readonly bonuses = new BonusSystem(this.events);
  readonly world: WorldSpawner;
  phase: Phase = "ready";
  seed = 1;
  x = 0;
  previousX = 0;
  z = 0;
  previousZ = 0;
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
  previousTime = 0;
  feedbackTime = 0;
  previousFeedbackTime = 0;
  hitStopRemaining = 0;
  private previousBob = 0;
  private nextStep = 0;
  constructor(seed = 1, registry = ObjectRegistry.defaults()) {
    this.world = new WorldSpawner(registry);
    this.reset(seed);
  }
  reset(seed: number) {
    this.seed = seed >>> 0 || 1;
    this.phase = "ready";
    this.x = this.previousX = this.y = this.previousY = 0;
    this.z = this.previousZ = 0;
    this.heading = this.previousHeading = this.movingX = this.steering = 0;
    this.velocityY = this.distance = this.previousDistance = this.time = 0;
    this.previousTime = this.previousBob = 0;
    this.feedbackTime = this.previousFeedbackTime = this.hitStopRemaining = 0;
    this.pickupMotion.update(0);
    this.diving = false;
    this.crouch = this.previousCrouch = this.crouchRemaining = 0;
    this.speed = Rules.startSpeed;
    this.nextStep = Rules.stepStride;
    this.world.reset(this.seed);
    this.world.update(0, 0);
    this.terrain.reset(this.seed);
    this.health.reset();
    this.bonuses.reset();
    this.events.emit(GameEvent.Start);
  }
  move(direction: number) {
    this.steering =
      this.phase === "running" && !this.hitStopRemaining
        ? Math.sign(direction)
        : 0;
  }
  jump() {
    if (this.phase !== "running" || this.hitStopRemaining || this.y !== 0)
      return;
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
    if (this.phase !== "running" || this.hitStopRemaining) return;
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
    this.previousFeedbackTime = this.feedbackTime;
    this.feedbackTime += dt;
    this.previousX = this.x;
    this.previousZ = this.z;
    this.previousY = this.y;
    this.previousCrouch = this.crouch;
    this.previousHeading = this.heading;
    this.previousDistance = this.distance;
    this.previousTime = this.time;
    if (this.hitStopRemaining > 0) {
      this.hitStopRemaining = Math.max(0, this.hitStopRemaining - dt);
      if (this.hitStopRemaining < 1e-9) {
        this.hitStopRemaining = 0;
        if (!this.health.lives) this.phase = "over";
      }
      return;
    }
    this.previousBob = this.pickupMotion.bob;
    this.time += dt;
    this.pickupMotion.update(this.time);
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
    // Unwrapped heading: releasing input preserves the new running direction.
    this.heading -= this.steering * Rules.turnSpeed * dt;
    this.movingX = -Math.sin(this.heading);
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
    const midHeading = (this.heading + this.previousHeading) * 0.5;
    this.x -= Math.sin(midHeading) * this.speed * dt;
    this.z += Math.cos(midHeading) * this.speed * dt;
    this.world.update(this.x, this.z);
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
      dz = this.z - this.previousZ,
      minZ = Math.min(this.previousZ, this.z),
      maxZ = Math.max(this.previousZ, this.z);
    for (let i = 0; i < pool.active.length; i++) {
      if (!pool.active[i]) continue;
      // Broad phase uses full render bounds before any registry lookup. The
      // forgiving blocking box below is a subset, never a culling replacement.
      const broadZ = pool.halfZ[i] + Rules.playerRadius;
      if (pool.z[i] < minZ - broadZ || pool.z[i] > maxZ + broadZ) continue;
      const definition = pool.registry.get(pool.kinds[i]);
      if (
        !definition ||
        (definition.blocking &&
          (this.health.immunity > 0 || this.bonuses.shield))
      )
        continue;
      const blocking = definition.blocking;
      const scale =
        pool.kinds[i] === ObjectKind.Cactus ? Rules.cactusHitScale : 1;
      const radius = blocking ? Rules.blockingRadius : Rules.playerRadius;
      const extentX = pool.halfX[i] * scale + radius,
        extentZ = pool.halfZ[i] * scale + radius;
      if (pool.z[i] < minZ - extentZ || pool.z[i] > maxZ + extentZ) continue;
      let enter = 0,
        leave = 1;
      if (Math.abs(dz) < 1e-9) {
        if (Math.abs(this.previousZ - pool.z[i]) >= extentZ) continue;
      } else {
        const a = (pool.z[i] - extentZ - this.previousZ) / dz;
        const b = (pool.z[i] + extentZ - this.previousZ) / dz;
        enter = Math.max(enter, Math.min(a, b));
        leave = Math.min(leave, Math.max(a, b));
      }
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
      const animated = definition.animation === "spin-bob";
      const bobEnter = animated
        ? this.previousBob + (this.pickupMotion.bob - this.previousBob) * enter
        : 0;
      const bobLeave = animated
        ? this.previousBob + (this.pickupMotion.bob - this.previousBob) * leave
        : 0;
      if (
        Math.min(yEnter - bobEnter, yLeave - bobLeave) >=
          pool.baseY[i] + pool.height[i] ||
        Math.max(topEnter - bobEnter, topLeave - bobLeave) <= pool.baseY[i]
      )
        continue;
      if (definition.blocking) {
        if (!this.bonuses.shield && this.health.damage()) {
          this.speed = Rules.startSpeed;
          // Hold the swept contact pose, not a later penetrated/end-of-step pose.
          this.x = this.previousX + dx * enter;
          this.z = this.previousZ + dz * enter;
          this.distance =
            this.previousDistance +
            (this.distance - this.previousDistance) * enter;
          this.y = this.previousY + (this.y - this.previousY) * enter;
          this.previousX = this.x;
          this.previousZ = this.z;
          this.previousDistance = this.distance;
          this.previousY = this.y;
          this.hitStopRemaining = Rules.hitStopSeconds;
          this.move(0);
          return;
        }
      } else {
        let amount = definition.reward ?? 1;
        if (definition.kind === ObjectKind.Coin)
          this.wallet.add(Currency.Coin, definition.reward ?? 1);
        else if (definition.kind === ObjectKind.Diamond)
          this.wallet.add(Currency.Diamond, definition.reward ?? 1);
        else if (definition.healing !== undefined) {
          const before = this.health.lives;
          this.health.heal(definition.healing);
          amount = this.health.lives - before;
        } else if (
          definition.kind === ObjectKind.Bonus &&
          definition.bonusId !== undefined
        )
          this.bonuses.activate(definition.bonusId);
        pool.consume(i);
        this.events.emit(GameEvent.Collected, definition.kind, amount);
      }
    }
  }
}

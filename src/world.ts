import { Rules, GridMath } from "./config";
import colliders from "./assets/model-colliders.json";

export enum ObjectKind {
  Cactus,
  Coin,
  Diamond,
  Bonus,
  Enemy,
  Heart,
}
export interface ColliderDefinition {
  readonly baseY?: number;
  readonly halfX: number;
  readonly halfZ: number;
  readonly height: number;
}
/** Metadata for a future destruction system; no break/damage action is implemented. */
export interface DestructionDefinition {
  readonly hitPoints: number;
  readonly debrisId: string;
}
export interface ObjectDefinition {
  readonly kind: ObjectKind;
  readonly weight: number;
  readonly blocking: boolean;
  readonly colliders: readonly ColliderDefinition[];
  readonly reward?: number;
  readonly bonusId?: number;
  readonly healing?: number;
  readonly spawnGroup?: "pickup";
  readonly animation?: "spin-bob";
  readonly destruction?: DestructionDefinition;
}

export class ObjectRegistry {
  private readonly definitions: ObjectDefinition[] = [];
  private readonly byKind = new Map<ObjectKind, ObjectDefinition>();
  private totalWeight = 0;
  private pickupWeight = 0;
  register(definition: ObjectDefinition) {
    if (
      this.byKind.has(definition.kind) ||
      !Number.isInteger(definition.kind) ||
      definition.kind < 0 ||
      definition.kind > 255 ||
      !Number.isFinite(definition.weight) ||
      definition.weight < 0 ||
      (definition.healing !== undefined &&
        (!Number.isSafeInteger(definition.healing) ||
          definition.healing <= 0)) ||
      !definition.colliders.length ||
      definition.colliders.length > 256 ||
      definition.colliders.some(
        (bounds) =>
          !Number.isFinite(bounds.halfX) ||
          !Number.isFinite(bounds.halfZ) ||
          !Number.isFinite(bounds.height) ||
          !Number.isFinite(bounds.baseY ?? 0) ||
          bounds.halfX <= 0 ||
          bounds.halfZ <= 0 ||
          bounds.height <= 0,
      )
    )
      throw new Error("Invalid/duplicate world object definition");
    const entry = Object.freeze({
      ...definition,
      colliders: definition.colliders.map((bounds) =>
        Object.freeze({ ...bounds }),
      ),
    });
    this.definitions.push(entry);
    this.byKind.set(entry.kind, entry);
    if (entry.spawnGroup === "pickup") this.pickupWeight += entry.weight;
    else this.totalWeight += entry.weight;
  }
  get(kind: ObjectKind) {
    return this.byKind.get(kind);
  }
  pick(random: number, pickup = false) {
    let value = random * (pickup ? this.pickupWeight : this.totalWeight);
    for (const definition of this.definitions) {
      if ((definition.spawnGroup === "pickup") !== pickup) continue;
      if (!definition.weight) continue;
      value -= definition.weight;
      if (value < 0) return definition;
    }
    return undefined;
  }
  static defaults() {
    const registry = new ObjectRegistry();
    registry.register({
      kind: ObjectKind.Cactus,
      weight: 1,
      blocking: true,
      colliders: colliders.map((b) => ({
        halfX: b.halfX * Rules.cactusScale,
        halfZ: b.halfZ * Rules.cactusScale,
        height: b.height * Rules.cactusScale,
      })),
    });
    // Rotation-invariant envelope for all authored voxel models and bobbing.
    const pickup = [{ halfX: 0.46, halfZ: 0.46, height: 0.75, baseY: 0.5 }];
    registry.register({
      kind: ObjectKind.Coin,
      weight: 250,
      blocking: false,
      colliders: pickup,
      reward: 1,
      spawnGroup: "pickup",
      animation: "spin-bob",
    });
    registry.register({
      kind: ObjectKind.Diamond,
      weight: 10,
      blocking: false,
      colliders: pickup,
      reward: 1,
      spawnGroup: "pickup",
      animation: "spin-bob",
    });
    registry.register({
      kind: ObjectKind.Heart,
      weight: 1,
      blocking: false,
      colliders: pickup,
      healing: 1,
      spawnGroup: "pickup",
      animation: "spin-bob",
    });
    registry.register({
      kind: ObjectKind.Bonus,
      weight: 0,
      blocking: false,
      colliders: pickup,
    });
    registry.register({
      kind: ObjectKind.Enemy,
      weight: 0,
      blocking: true,
      colliders: pickup,
    });
    return registry;
  }
}

/** Chunk keys are storage only. Multiple independent continuous points per chunk;
 * no rows, columns or quantization in the actual obstacle positions. */
export class WorldSpawner {
  readonly active = new Uint8Array(Rules.poolSize);
  readonly columns = new Float64Array(Rules.poolSize).fill(Infinity);
  readonly rows = new Float64Array(Rules.poolSize).fill(Infinity);
  readonly x = new Float64Array(Rules.poolSize);
  readonly z = new Float64Array(Rules.poolSize);
  readonly kinds = new Uint8Array(Rules.poolSize);
  readonly variants = new Uint8Array(Rules.poolSize);
  readonly angles = new Float32Array(Rules.poolSize);
  readonly halfX = new Float32Array(Rules.poolSize);
  readonly halfZ = new Float32Array(Rules.poolSize);
  readonly height = new Float32Array(Rules.poolSize);
  readonly baseY = new Float32Array(Rules.poolSize);
  radius = 3;
  generated = 0;
  revision = 0;
  private seed = 1;
  private centerX = Infinity;
  private centerZ = Infinity;
  constructor(readonly registry = ObjectRegistry.defaults()) {}
  reset(seed: number) {
    this.seed = seed >>> 0 || 1;
    this.active.fill(0);
    this.columns.fill(Infinity);
    this.rows.fill(Infinity);
    this.centerX = this.centerZ = Infinity;
    this.generated = 0;
    this.revision++;
  }
  setVisibleHalfWidth(width: number) {
    const radius = Math.min(
      (Rules.maxColumns - 1) / 2,
      Math.max(2, Math.ceil(width / Rules.chunkSize) + 1),
    );
    if (radius !== this.radius) {
      this.radius = radius;
      this.centerX = Infinity;
    }
  }
  safeCenter(z: number, corridor = 0) {
    const phase = (this.seed % 4096) * 0.013;
    return (
      corridor * 32 +
      3 * (Math.sin(z / 48 + phase) - Math.sin(phase)) +
      2 * (Math.sin(z / 110 + phase * 2) - Math.sin(phase * 2))
    );
  }
  isRouteClear(x: number, z: number, halfX: number, halfZ: number) {
    const center = this.safeCenter(z);
    const gap = Math.abs(x - center - Math.round((x - center) / 32) * 32);
    // |route derivative| <= .081: Minkowski padding covers the full cactus,
    // avatar, 300ms delayed following and substep steering error, not just centres.
    return gap < halfX + Rules.playerRadius + 1.1 + 0.081 * halfZ;
  }
  private random(column: number, row: number, candidate: number, salt: number) {
    return (
      GridMath.hash(
        column,
        row,
        this.seed ^ Math.imul(candidate + 1, 0x9e3779b9) ^ salt,
      ) / 4294967296
    );
  }
  update(worldX: number, distance: number) {
    const cx = Math.floor(worldX / Rules.chunkSize);
    const cz = Math.floor(distance / Rules.chunkSize);
    if (cx === this.centerX && cz === this.centerZ) return;
    this.centerX = cx;
    this.centerZ = cz;
    // Retire only cells outside a generous visible/entry window; no GPU objects.
    for (let i = 0; i < Rules.poolSize; i++)
      if (
        Math.abs(this.columns[i] - cx) > this.radius ||
        this.rows[i] < cz - 1 ||
        this.rows[i] > cz + Rules.rowSlots - 2
      ) {
        this.active[i] = 0;
        this.columns[i] = this.rows[i] = Infinity;
      }
    for (let row = Math.max(0, cz - 1); row <= cz + Rules.rowSlots - 2; row++)
      for (
        let column = cx - this.radius;
        column <= cx + this.radius;
        column++
      ) {
        const first =
          (GridMath.mod(row, Rules.rowSlots) * Rules.maxColumns +
            GridMath.mod(column, Rules.maxColumns)) *
          Rules.slotsPerChunk;
        if (this.columns[first] === column && this.rows[first] === row)
          continue;
        for (let candidate = 0; candidate < Rules.slotsPerChunk; candidate++)
          this.populate(first + candidate, column, row, candidate);
      }
    this.revision++;
  }
  private populate(
    slot: number,
    column: number,
    row: number,
    candidate: number,
  ) {
    this.columns[slot] = column;
    this.rows[slot] = row;
    this.active[slot] = 0;
    this.generated++;
    const pickup = candidate >= Rules.candidatesPerChunk;
    const x =
      (column + this.random(column, row, candidate, 0x311a)) * Rules.chunkSize;
    const z =
      (row + this.random(column, row, candidate, 0x741d)) * Rules.chunkSize;
    // Denser than old rows; fewer candidates per second as natural speed grows.
    // World-distance-based acceptance stays deterministic through slowdown/reentry.
    const speed = Math.min(Rules.maxSpeed, Rules.startSpeed + z * 0.008);
    if (
      z < (pickup ? 12 : Rules.firstRow) ||
      this.random(column, row, candidate, 0x17f3) >
        0.96 - (speed - Rules.startSpeed) * 0.012
    )
      return;
    const definition = this.registry.pick(
      this.random(column, row, candidate, 0x8db3),
      pickup,
    );
    if (!definition) return;
    const variant = Math.floor(
      this.random(column, row, candidate, 0x51ac) * definition.colliders.length,
    );
    const angle = this.random(column, row, candidate, 0xad27) * Math.PI * 2;
    const bounds = definition.colliders[variant],
      cos = Math.abs(Math.cos(angle)),
      sin = Math.abs(Math.sin(angle));
    this.kinds[slot] = definition.kind;
    this.variants[slot] = variant;
    this.angles[slot] = angle;
    this.x[slot] = x;
    this.z[slot] = z;
    if (definition.animation === "spin-bob") {
      // Authored pickup bounds already enclose every yaw. Do not rotate this
      // envelope again using the spawn angle (which the shared motion ignores).
      this.halfX[slot] = this.halfZ[slot] = Math.max(
        bounds.halfX,
        bounds.halfZ,
      );
    } else {
      this.halfX[slot] = bounds.halfX * cos + bounds.halfZ * sin;
      this.halfZ[slot] = bounds.halfZ * cos + bounds.halfX * sin;
    }
    this.height[slot] = bounds.height;
    this.baseY[slot] = bounds.baseY ?? 0;
    // Pickups must never be hidden inside a cactus. Check the deterministic
    // candidate field, not active slots (which depend on window/reentry order).
    // Conservative padding also excludes a few thinned/non-spawned candidates.
    if (pickup) {
      const cacti = this.registry.get(ObjectKind.Cactus);
      let reach = 0;
      if (cacti && cacti.weight > 0)
        for (const b of cacti.colliders)
          reach = Math.max(reach, Math.hypot(b.halfX, b.halfZ));
      if (reach > 0) {
        reach +=
          Math.hypot(bounds.halfX, bounds.halfZ) + Rules.playerRadius + 0.3;
        for (let rz = row - 1; rz <= row + 1; rz++)
          for (let cx = column - 1; cx <= column + 1; cx++)
            for (let n = 0; n < Rules.candidatesPerChunk; n++) {
              const nx =
                (cx + this.random(cx, rz, n, 0x311a)) * Rules.chunkSize;
              const nz =
                (rz + this.random(cx, rz, n, 0x741d)) * Rules.chunkSize;
              if ((nx - x) ** 2 + (nz - z) ** 2 < reach * reach) return;
            }
      }
    }
    if (
      definition.blocking &&
      this.isRouteClear(x, z, this.halfX[slot], this.halfZ[slot])
    )
      return;
    // Deterministic hard-core thinning over this and neighbouring chunks avoids
    // interpenetrating clusters without storing an unbounded spatial index.
    if (definition.blocking) {
      const priority = this.random(column, row, candidate, 0xa193);
      for (let rz = row - 1; rz <= row + 1; rz++)
        for (let cx = column - 1; cx <= column + 1; cx++)
          for (let n = 0; n < Rules.candidatesPerChunk; n++) {
            if (this.random(cx, rz, n, 0xa193) >= priority) continue;
            const nx = (cx + this.random(cx, rz, n, 0x311a)) * Rules.chunkSize;
            const nz = (rz + this.random(cx, rz, n, 0x741d)) * Rules.chunkSize;
            if ((nx - x) ** 2 + (nz - z) ** 2 < 3.3 ** 2) return;
          }
    }
    this.active[slot] = 1;
  }
  consume(slot: number) {
    this.active[slot] = 0;
  }
}

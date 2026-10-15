import { Rules, GridMath } from "./config";
import colliders from "./assets/model-colliders.json";

export enum ObjectKind {
  Cactus,
  Coin,
  Diamond,
  Bonus,
  Enemy,
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
  readonly destruction?: DestructionDefinition;
}

export class ObjectRegistry {
  private readonly definitions: ObjectDefinition[] = [];
  private readonly byKind = new Map<ObjectKind, ObjectDefinition>();
  private totalWeight = 0;
  register(definition: ObjectDefinition) {
    if (
      this.byKind.has(definition.kind) ||
      !Number.isInteger(definition.kind) ||
      definition.kind < 0 ||
      definition.kind > 255 ||
      !Number.isFinite(definition.weight) ||
      definition.weight < 0 ||
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
    this.totalWeight += entry.weight;
  }
  get(kind: ObjectKind) {
    return this.byKind.get(kind);
  }
  pick(random: number) {
    let value = random * this.totalWeight;
    for (const definition of this.definitions) {
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
      colliders,
    });
    const pickup = [{ halfX: 0.25, halfZ: 0.25, height: 0.6 }];
    registry.register({
      kind: ObjectKind.Coin,
      weight: 0,
      blocking: false,
      colliders: pickup,
      reward: 1,
    });
    registry.register({
      kind: ObjectKind.Diamond,
      weight: 0,
      blocking: false,
      colliders: pickup,
      reward: 1,
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

/** Fixed 2D ring of numeric cells, not scene objects. No history/map growth. */
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
  radius = 6;
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
      Math.max(3, Math.ceil(width / Rules.columnWidth) + 1),
    );
    if (radius !== this.radius) {
      this.radius = radius;
      this.centerX = Infinity;
    }
  }
  safeOffset(row: number) {
    const phase = row + (this.seed % 4096) * 0.1;
    // Derivative is bounded by .732 columns/row: flooring cannot jump >1.
    // Two independent phases avoid a short, visibly repeating zig-zag route.
    return Math.floor(
      Math.sin(phase * 0.37) * 1.65 + Math.sin(phase * 0.11) * 1.1,
    );
  }
  isSafe(column: number, row: number) {
    return GridMath.mod(column - this.safeOffset(row), 5) === 0;
  }
  update(worldX: number, distance: number) {
    const cx = Math.floor(worldX / Rules.columnWidth);
    const cz = Math.floor((distance - Rules.firstRow) / Rules.rowGap);
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
        const slot =
          GridMath.mod(row, Rules.rowSlots) * Rules.maxColumns +
          GridMath.mod(column, Rules.maxColumns);
        if (this.columns[slot] === column && this.rows[slot] === row) continue;
        this.populate(slot, column, row);
      }
    this.revision++;
  }
  private populate(slot: number, column: number, row: number) {
    this.columns[slot] = column;
    this.rows[slot] = row;
    this.active[slot] = 0;
    this.generated++;
    const hash = GridMath.hash(column, row, this.seed);
    // Empty first row at the player's initial column; every fifth column has a
    // connected safe route which moves at most one column between rows.
    if (hash / 4294967296 > 0.56) return;
    const definition = this.registry.pick(
      GridMath.hash(column, row, this.seed ^ 0x8db3) / 4294967296,
    );
    if (!definition || (definition.blocking && this.isSafe(column, row)))
      return;
    const variant =
      GridMath.hash(column, row, this.seed ^ 0x51ac) %
      definition.colliders.length;
    const angle =
      (GridMath.hash(column, row, this.seed ^ 0xad27) / 4294967296) *
      Math.PI *
      2;
    const bounds = definition.colliders[variant],
      cos = Math.abs(Math.cos(angle)),
      sin = Math.abs(Math.sin(angle));
    this.kinds[slot] = definition.kind;
    this.variants[slot] = variant;
    this.angles[slot] = angle;
    this.x[slot] = column * Rules.columnWidth;
    this.z[slot] = Rules.firstRow + row * Rules.rowGap;
    this.halfX[slot] = bounds.halfX * cos + bounds.halfZ * sin;
    this.halfZ[slot] = bounds.halfZ * cos + bounds.halfX * sin;
    this.height[slot] = bounds.height;
    this.baseY[slot] = bounds.baseY ?? 0;
    this.active[slot] = 1;
  }
  consume(slot: number) {
    this.active[slot] = 0;
  }
}

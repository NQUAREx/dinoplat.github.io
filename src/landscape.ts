import { GridMath } from "./config";
import { Tuning } from "./tuning";

export enum Biome {
  Desert,
  Lava,
  Meadow,
}
export enum Surface {
  Land,
  Water,
  Pit,
  Lava,
  Bridge,
}
export interface LandscapeSample {
  biome: Biome;
  cover: number;
  surface: Surface;
  height: number;
  floor: number;
  colour: number;
  waterLevel: number;
}
const COLOURS = [
  0xf4cf78, 0xeab360, 0xe79d66, 0x66526b, 0x8e5d57, 0x493f59, 0x83c94e,
  0x60b95a, 0xa2d768,
];
const smooth = (v: number) => v * v * (3 - 2 * v);

/** Stateless world coordinates are the save: no growing chunk/history cache. */
export class LandscapeField {
  static readonly tile = 4;
  enabled = true;
  seed: number;
  // One query only: fixed 64-byte coordinate/weight storage, no history.
  private readonly triangle = new Float64Array(8);
  private queryX = NaN;
  private queryZ = NaN;
  private querySeed = 0;
  private queryEnabled = false;
  private bridgeSeed = NaN;
  private bridgeCos = 1;
  private bridgeSin = 0;
  constructor(seed = 1) {
    this.seed = seed >>> 0 || 1;
  }
  reset(seed: number) {
    this.seed = seed >>> 0 || 1;
    this.queryX = NaN;
  }
  get revision() {
    return Tuning.landscape.heightScale * 10000 + Tuning.landscape.biomeSize;
  }
  hash(x: number, z: number, salt = 0) {
    return GridMath.hash(x, z, this.seed ^ salt) / 4294967296;
  }
  noise(x: number, z: number, scale: number, salt = 0) {
    x /= scale;
    z /= scale;
    const ix = Math.floor(x),
      iz = Math.floor(z),
      u = smooth(x - ix),
      v = smooth(z - iz);
    const a = this.hash(ix, iz, salt),
      b = this.hash(ix + 1, iz, salt),
      c = this.hash(ix, iz + 1, salt),
      d = this.hash(ix + 1, iz + 1, salt);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }
  biomeAt(x: number, z: number): Biome {
    if (!this.enabled) return Biome.Desert;
    if (Math.hypot(x, z) < 24) return Biome.Desert;
    // Feature centres stay >=224m from their macro-cell edges, so a 65m
    // summit island needs only this cell. Same centres/salt as vertexHeight.
    const mx = Math.floor(x / 640), mz = Math.floor(z / 640);
    if (this.hash(mx, mz, 114) < 0.32) {
      const px = (mx + 0.35 + 0.3 * this.hash(mx, mz, 115)) * 640;
      const pz = (mz + 0.35 + 0.3 * this.hash(mx, mz, 116)) * 640;
      if (Math.hypot(x - px, z - pz) < 65)
        return this.hash(mx, mz, 117) < 0.5 ? Biome.Lava : Biome.Meadow;
    }
    const wx = x + 7 * (this.noise(x, z, 87, 71) - 0.5),
      wz = z + 7 * (this.noise(x, z, 91, 83) - 0.5);
    // Warped Voronoi patches with embedded islands, not distance milestones.
    const size = Tuning.landscape.biomeSize,
      cx = Math.floor(wx / size),
      cz = Math.floor(wz / size);
    let closest = Infinity,
      biome = Biome.Desert;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const gx = cx + dx,
          gz = cz + dz,
          px = (gx + 0.15 + 0.7 * this.hash(gx, gz, 2)) * size,
          pz = (gz + 0.15 + 0.7 * this.hash(gx, gz, 3)) * size;
        const d = (wx - px) ** 2 + (wz - pz) ** 2;
        if (d < closest) {
          closest = d;
          const kind = this.hash(gx, gz, 9);
          biome = kind < 0.5 ? Biome.Lava : Biome.Meadow;
        }
      }
    if (Math.hypot(x, z) < 24) return Biome.Desert;
    return closest < (size * 0.26) ** 2 ? biome : Biome.Desert;
  }
  vertexHeight(x: number, z: number) {
    if (!this.enabled) return 0;
    // 24m vertex clearing also keeps every interpolated point within 18m flat.
    const startup = smooth(Math.min(1, Math.max(0, (Math.hypot(x, z) - 24) / 96)));
    let feature = 0;
    const ix = Math.floor(x / 640), iz = Math.floor(z / 640);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const gx = ix + dx, gz = iz + dz, kind = this.hash(gx, gz, 114);
      if (kind > 0.48) continue;
      const px = (gx + 0.35 + 0.3 * this.hash(gx, gz, 115)) * 640;
      const pz = (gz + 0.35 + 0.3 * this.hash(gx, gz, 116)) * 640;
      const radius = kind < 0.32 ? 190 : 100;
      const t = Math.max(0, 1 - Math.hypot(x - px, z - pz) / radius);
      feature += (kind < 0.32 ? 126 : -15) * smooth(t);
    }
    const rolling = (this.noise(x, z, 100, 111) - 0.5) * 3 +
      (this.noise(x, z, 37, 112) - 0.5) * 0.2;
    // Disjoint feature supports; hard bounds remain explicit under future edits.
    return Tuning.landscape.heightScale * startup * Math.max(-16.6, Math.min(130, feature + rolling));
  }
  /** Integer lattice indices; radial displacement < 0.85m, no cache. */
  gridX(ix: number, iz: number) {
    return ix * 4 + (this.enabled ? (this.hash(ix, iz, 301) - 0.5) * 1.2 : 0);
  }
  gridZ(ix: number, iz: number) {
    return iz * 4 + (this.enabled ? (this.hash(ix, iz, 302) - 0.5) * 1.2 : 0);
  }
  /** Exactly the same triangle interpolation used by the ground mesh. */
  heightAt(x: number, z: number) {
    if (!this.enabled) return 0;
    return this.triangleValue(x, z, 0);
  }
  private triangleValue(x: number, z: number, mode: number): number {
    if (x !== this.queryX || z !== this.queryZ || this.seed !== this.querySeed || this.enabled !== this.queryEnabled)
      this.locateTriangle(x, z);
    const p = this.triangle;
    if (mode === 3) return this.rawKindAt((p[0] + p[2] + p[4]) / 3, (p[1] + p[3] + p[5]) / 3);
    // Cache geometry only: tuning edits and overridden vertex fields remain live.
    const a = this.vertexValue(p[0], p[1], mode);
    return a + (this.vertexValue(p[2], p[3], mode) - a) * p[6] + (this.vertexValue(p[4], p[5], mode) - a) * p[7];
  }
  private locateTriangle(x: number, z: number) {
    const ix = Math.floor(x / 4), iz = Math.floor(z / 4);
    // Central cell first; jitter bounds leave only eight possible neighbours.
    for (let cell = 0; cell < 9; cell++) {
      const index = cell === 0 ? 4 : cell <= 4 ? cell - 1 : cell;
      const dx = index % 3 - 1, dz = Math.floor(index / 3) - 1;
      const gx = ix + dx, gz = iz + dz;
      for (let triangle = 0; triangle < 2; triangle++) {
        const ax = this.gridX(gx + triangle, gz + triangle), az = this.gridZ(gx + triangle, gz + triangle);
        const bx = this.gridX(gx + 1 - triangle, gz + triangle), bz = this.gridZ(gx + 1 - triangle, gz + triangle);
        const cx = this.gridX(gx + triangle, gz + 1 - triangle), cz = this.gridZ(gx + triangle, gz + 1 - triangle);
        const det = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
        const u = ((x - ax) * (cz - az) - (z - az) * (cx - ax)) / det;
        const v = ((bx - ax) * (z - az) - (bz - az) * (x - ax)) / det;
        if (u >= -1e-10 && v >= -1e-10 && u + v <= 1 + 1e-10) {
          const p = this.triangle;
          p[0] = ax; p[1] = az; p[2] = bx; p[3] = bz; p[4] = cx; p[5] = cz; p[6] = u; p[7] = v;
          this.queryX = x; this.queryZ = z; this.querySeed = this.seed; this.queryEnabled = this.enabled;
          return;
        }
      }
    }
    throw new Error("Warped landscape lattice did not contain point");
  }
  private vertexValue(x: number, z: number, mode: number) {
    return mode === 0 ? this.vertexHeight(x, z) : mode === 1 ? this.hazardAt(x, z) : this.bridgeMaskAt(x, z);
  }
  routeX(z: number, corridor = 0) {
    const p = (this.seed % 4096) * 0.013;
    return (
      corridor * 32 +
      3 * (Math.sin(z / 48 + p) - Math.sin(p)) +
      2 * (Math.sin(z / 110 + p * 2) - Math.sin(p * 2))
    );
  }
  safeAt(x: number, z: number, padding = 2.8) {
    const d = x - this.routeX(z);
    return (
      Math.abs(d - Math.round(d / 32) * 32) < padding ||
      Math.abs(z - Math.round(z / 64) * 64) < padding
    );
  }
  /** Raw signed vertex field, in metres; renderer interpolates within triangles. */
  hazardAt(x: number, z: number) {
    if (!this.enabled) return -1;
    let mask = 3.5 - Math.abs(Math.sin((z - 70 + 13 * Math.sin(x / 29) + 5 * Math.sin(x / 57)) / 62)) * 62;
    const size = Tuning.landscape.biomeSize, ix = Math.floor(x / size), iz = Math.floor(z / size);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const gx = ix + dx, gz = iz + dz;
      const px = (gx + 0.15 + 0.7 * this.hash(gx, gz, 2)) * size;
      const pz = (gz + 0.15 + 0.7 * this.hash(gx, gz, 3)) * size;
      // Lakes lie at the heart of meadow oases; lava has smaller pools.
      const radius = this.hash(gx, gz, 9) < 0.5 ? size * 0.085 : size * 0.13;
      mask = Math.max(mask, radius - Math.hypot(x - px, z - pz));
    }
    const pit = 4 - Math.abs(x + 11 * Math.sin(z / 53) - 150 * Math.round((x + 11 * Math.sin(z / 53)) / 150));
    mask = Math.max(mask, Math.min(pit, 14 - Math.abs(z - 180 * Math.round(z / 180))));
    // Extra lattice guard ensures interpolated hazards cannot enter radius 36m.
    return Math.min(mask, Math.hypot(x, z) - 42);
  }
  private rawKindAt(x: number, z: number): Surface {
    const pit = Math.abs(x + 11 * Math.sin(z / 53) - 150 * Math.round((x + 11 * Math.sin(z / 53)) / 150));
    if (pit < 5 && Math.abs(z - 180 * Math.round(z / 180)) < 16) return Surface.Pit;
    return this.biomeAt(x, z) === Biome.Lava ? Surface.Lava : Surface.Water;
  }
  /** Constant underlying kind per warped triangle, including beneath bridges. */
  hazardKindAt(x: number, z: number): Surface {
    return this.triangleValue(x, z, 3);
  }
  bridgeMaskAt(x: number, z: number) {
    this.updateBridgeRotation();
    const d = x - this.routeX(z);
    const route = 4.1 - Math.abs(d - Math.round(d / 32) * 32);
    const along = -x * this.bridgeSin + z * this.bridgeCos;
    const normal = x * this.bridgeCos + z * this.bridgeSin - 9 * Math.sin(along / 83);
    return Math.max(route, 3.6 - Math.abs(normal - Math.round(normal / 96) * 96));
  }
  bridgeAngleAt(x: number, z: number) {
    this.updateBridgeRotation();
    const d = x - this.routeX(z), route = 4.1 - Math.abs(d - Math.round(d / 32) * 32);
    const along = -x * this.bridgeSin + z * this.bridgeCos;
    const normal = x * this.bridgeCos + z * this.bridgeSin - 9 * Math.sin(along / 83);
    if (route >= 3.6 - Math.abs(normal - Math.round(normal / 96) * 96)) {
      const p = (this.seed % 4096) * 0.013;
      return -Math.atan(3 / 48 * Math.cos(z / 48 + p) + 2 / 110 * Math.cos(z / 110 + p * 2));
    }
    const derivative = 9 / 83 * Math.cos(along / 83);
    // Tangent for increasing local along; heading forward is (-sin, cos).
    return Math.atan2(this.bridgeSin - this.bridgeCos * derivative, this.bridgeCos + this.bridgeSin * derivative);
  }
  private updateBridgeRotation() {
    if (this.bridgeSeed === this.seed) return;
    const angle = this.hash(0, 0, 303) * Math.PI * 2;
    this.bridgeCos = Math.cos(angle); this.bridgeSin = Math.sin(angle);
    this.bridgeSeed = this.seed;
  }
  /** Stable longitudinal coordinate: never dot global positions with a changing
   * per-face tangent. That would tear plank stripes at large world coordinates.
   * A shared reference selects grain at a crossing between the two route families. */
  bridgePlankAt(x: number, z: number, referenceX = x, referenceZ = z) {
    this.updateBridgeRotation();
    const d = referenceX - this.routeX(referenceZ),
      route = 4.1 - Math.abs(d - Math.round(d / 32) * 32),
      along = -referenceX * this.bridgeSin + referenceZ * this.bridgeCos,
      across = referenceX * this.bridgeCos + referenceZ * this.bridgeSin - 9 * Math.sin(along / 83),
      rotated = 3.6 - Math.abs(across - Math.round(across / 96) * 96);
    return route >= rotated ? z : -x * this.bridgeSin + z * this.bridgeCos;
  }
  surfaceAt(x: number, z: number): Surface {
    if (!this.enabled || this.triangleValue(x, z, 1) <= 0) return Surface.Land;
    return this.triangleValue(x, z, 2) > 0 ? Surface.Bridge : this.hazardKindAt(x, z);
  }
  supportAt(x: number, z: number) {
    const surface = this.surfaceAt(x, z);
    return surface === Surface.Bridge || surface === Surface.Land;
  }
  sample(x: number, z: number, out: LandscapeSample) {
    const biome = this.biomeAt(x, z),
      cover = Math.min(2, Math.floor(this.noise(x, z, 14, 37) * 3.4));
    const height = this.heightAt(x, z),
      surface = this.surfaceAt(x, z);
    out.biome = biome;
    out.cover = cover;
    out.surface = surface;
    out.height = height;
    out.floor =
      surface === Surface.Land ? height : height - (this.hazardKindAt(x, z) === Surface.Pit ? 14 : 4.8);
    out.waterLevel = height - 0.9;
    out.colour = COLOURS[biome * 3 + cover];
    return out;
  }
}

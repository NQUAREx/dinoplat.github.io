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
  constructor(seed = 1) {
    this.seed = seed >>> 0 || 1;
  }
  reset(seed: number) {
    this.seed = seed >>> 0 || 1;
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
    const wx = x + 35 * (this.noise(x, z, 87, 71) - 0.5),
      wz = z + 35 * (this.noise(x, z, 91, 83) - 0.5);
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
          biome = Math.floor(this.hash(gx, gz, 9) * 3);
        }
      }
    if (Math.hypot(x, z) < 24) return Biome.Desert;
    return biome;
  }
  vertexHeight(x: number, z: number) {
    if (!this.enabled) return 0;
    const startup = Math.min(1, Math.max(0, (Math.hypot(x, z) - 18) / 24));
    const mountain = Math.max(0, this.noise(x, z, 140, 114) - 0.5) ** 2 * 70;
    return (
      Tuning.landscape.heightScale *
      startup *
      (mountain +
        (this.noise(x, z, 78, 111) - 0.5) * 13 +
        (this.noise(x, z, 27, 112) - 0.5) * 3 +
        (this.noise(x, z, 10, 113) - 0.5) * 0.65)
    );
  }
  /** Exactly the same triangle interpolation used by the ground mesh. */
  heightAt(x: number, z: number) {
    const s = LandscapeField.tile,
      ix = Math.floor(x / s) * s,
      iz = Math.floor(z / s) * s,
      u = (x - ix) / s,
      v = (z - iz) / s;
    const a = this.vertexHeight(ix, iz),
      b = this.vertexHeight(ix + s, iz),
      c = this.vertexHeight(ix, iz + s),
      d = this.vertexHeight(ix + s, iz + s);
    return u + v <= 1
      ? a + (b - a) * u + (c - a) * v
      : d + (c - d) * (1 - u) + (b - d) * (1 - v);
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
  private rawSurface(x: number, z: number, biome: Biome): Surface {
    if (!this.enabled || Math.hypot(x, z) < 36) return Surface.Land;
    const river = Math.abs(
      Math.sin((z - 70 + 13 * Math.sin(x / 29) + 5 * Math.sin(x / 57)) / 62),
    );
    if (river < 0.055)
      return biome === Biome.Lava ? Surface.Lava : Surface.Water;
    const gx = Math.floor(x / 48),
      gz = Math.floor(z / 48),
      px = (gx + 0.25 + this.hash(gx, gz, 23) * 0.5) * 48,
      pz = (gz + 0.25 + this.hash(gx, gz, 24) * 0.5) * 48;
    const kind = this.hash(gx, gz, 25),
      dx = x - px,
      dz = z - pz;
    if (kind < 0.38 && (dx * dx) / 81 + (dz * dz) / 49 < 1)
      return biome === Biome.Lava ? Surface.Lava : Surface.Water;
    if (kind > 0.76 && (dx * dx) / 49 + (dz * dz) / 36 < 1) return Surface.Pit;
    // Narrow eroded ravines with visible walls and periodic crossing bridges.
    if (
      kind > 0.62 &&
      kind < 0.72 &&
      Math.abs(dx + 2 * Math.sin(dz / 4)) < 2.5 &&
      Math.abs(dz) < 15
    )
      return Surface.Pit;
    return Surface.Land;
  }
  surfaceAt(x: number, z: number): Surface {
    const s = LandscapeField.tile,
      cx = (Math.floor(x / s) + 0.5) * s,
      cz = (Math.floor(z / s) + 0.5) * s;
    const raw = this.rawSurface(cx, cz, this.biomeAt(cx, cz));
    return raw !== Surface.Land && this.safeAt(cx, cz, 4.1)
      ? Surface.Bridge
      : raw;
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
      surface === Surface.Pit
        ? height - 7
        : surface === Surface.Water || surface === Surface.Lava
          ? height - 2.4
          : height;
    out.waterLevel = height - 0.9;
    out.colour = COLOURS[biome * 3 + cover];
    return out;
  }
}

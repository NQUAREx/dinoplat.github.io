import {
  Box3, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage,
  Mesh, MeshLambertMaterial, Sphere,
} from "three";
import { Biome, LandscapeField, Surface, type LandscapeSample } from "./landscape";
import type { RenderPose } from "./render-pose";

const CELLS = 56;
const TILE = LandscapeField.tile;
const HALF = (CELLS * TILE) / 2;
const STRIDE = CELLS + 2;
// Essential surfaces fit for every possible cell arrangement. Decorative
// planks/rails and foam use the remaining fixed space, never growing a buffer.
const GROUND_TRIANGLES = CELLS * CELLS * 2 + CELLS * (CELLS - 1) * 4 + CELLS * 8;
const WATER_TRIANGLES = 8192;
const BRIDGE_TRIANGLES = 24576;
// Converted to linear once, then packed as normalized vertex colours.
const COLOURS = [
  0xf4cf78, 0xeab360, 0xe79d66,
  0x66526b, 0x8e5d57, 0x493f59,
  0x83c94e, 0x60b95a, 0xa2d768,
  0x39b9d1, 0xff6b26, 0xffedb0, 0xad713e, 0xce9651,
];
const WATER_COLOUR = 9, LAVA_COLOUR = 10, FOAM_COLOUR = 11;
const WOOD_COLOUR = 12, LIGHT_WOOD_COLOUR = 13;
const LINEAR_COLOURS = new Float32Array(COLOURS.length * 3);
const colour = new Color();
for (let i = 0; i < COLOURS.length; i++) {
  colour.setHex(COLOURS[i]);
  LINEAR_COLOURS[i * 3] = colour.r * 255;
  LINEAR_COLOURS[i * 3 + 1] = colour.g * 255;
  LINEAR_COLOURS[i * 3 + 2] = colour.b * 255;
}

/** Reused CPU/GPU buffers, flat face normals, one persistent upload range. */
class GeometryBank {
  readonly geometry = new BufferGeometry();
  readonly mesh: Mesh<BufferGeometry, MeshLambertMaterial>;
  private readonly positions: BufferAttribute;
  private readonly normals: BufferAttribute;
  private readonly colours: BufferAttribute;
  private readonly positionRange = { start: 0, count: 0 };
  private readonly normalRange = { start: 0, count: 0 };
  private readonly colourRange = { start: 0, count: 0 };
  private vertices = 0;
  private minY = Infinity;
  private maxY = -Infinity;

  constructor(material: MeshLambertMaterial, triangles: number, name: string) {
    const vertices = triangles * 3;
    this.positions = new BufferAttribute(new Float32Array(vertices * 3), 3).setUsage(DynamicDrawUsage);
    this.normals = new BufferAttribute(new Float32Array(vertices * 3), 3).setUsage(DynamicDrawUsage);
    this.colours = new BufferAttribute(new Uint8Array(vertices * 3), 3, true).setUsage(DynamicDrawUsage);
    const index = vertices > 65535 ? new Uint32Array(vertices) : new Uint16Array(vertices);
    for (let i = 0; i < vertices; i++) index[i] = i;
    this.geometry.setAttribute("position", this.positions);
    this.geometry.setAttribute("normal", this.normals);
    this.geometry.setAttribute("color", this.colours);
    // Identity indices never change, and therefore never need another upload.
    this.geometry.setIndex(new BufferAttribute(index, 1));
    this.geometry.setDrawRange(0, 0);
    this.geometry.boundingBox = new Box3();
    this.geometry.boundingSphere = new Sphere();
    this.mesh = new Mesh(this.geometry, material);
    this.mesh.name = name;
    this.mesh.visible = false;
    this.mesh.frustumCulled = true;
  }

  begin() {
    this.vertices = 0;
    this.minY = Infinity;
    this.maxY = -Infinity;
  }

  triangle(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    tint: number, shade = 1,
  ) {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-10) return;
    if (this.vertices + 3 > this.positions.count)
      throw new Error(`Landscape bank overflow: ${this.mesh.name}`);
    nx /= length; ny /= length; nz /= length;
    const i = this.vertices;
    this.positions.setXYZ(i, ax, ay, az);
    this.positions.setXYZ(i + 1, bx, by, bz);
    this.positions.setXYZ(i + 2, cx, cy, cz);
    const ci = tint * 3;
    const r = Math.min(255, Math.round(LINEAR_COLOURS[ci] * shade));
    const g = Math.min(255, Math.round(LINEAR_COLOURS[ci + 1] * shade));
    const b = Math.min(255, Math.round(LINEAR_COLOURS[ci + 2] * shade));
    for (let v = i; v < i + 3; v++) {
      this.normals.setXYZ(v, nx, ny, nz);
      // setXYZ on a normalized attribute expects 0..1, not packed bytes.
      this.colours.array[v * 3] = r;
      this.colours.array[v * 3 + 1] = g;
      this.colours.array[v * 3 + 2] = b;
    }
    this.minY = Math.min(this.minY, ay, by, cy);
    this.maxY = Math.max(this.maxY, ay, by, cy);
    this.vertices += 3;
  }

  quad(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    tint: number, shade = 1,
  ) {
    this.triangle(ax, ay, az, bx, by, bz, cx, cy, cz, tint, shade);
    this.triangle(ax, ay, az, cx, cy, cz, dx, dy, dz, tint, shade);
  }

  /** Local X/Z are bounded doubles before reaching a Float32 attribute. */
  top(x: number, z: number, a: number, b: number, c: number, d: number, tint: number, shade = 1) {
    this.triangle(x, a, -z, x + TILE, b, -z, x, c, -z - TILE, tint, shade);
    this.triangle(x + TILE, d, -z - TILE, x, c, -z - TILE, x + TILE, b, -z, tint, shade * 0.97);
  }

  finish() {
    this.geometry.setDrawRange(0, this.vertices);
    this.mesh.visible = this.vertices > 0;
    if (!this.vertices) return;
    this.upload(this.positions, this.positionRange, this.vertices * 3);
    this.upload(this.normals, this.normalRange, this.vertices * 3);
    this.upload(this.colours, this.colourRange, this.vertices * 3);
    const box = this.geometry.boundingBox!, sphere = this.geometry.boundingSphere!;
    box.min.set(-HALF, this.minY - 0.02, -HALF);
    box.max.set(HALF, this.maxY + 0.02, HALF);
    sphere.center.set(0, (this.minY + this.maxY) / 2, 0);
    sphere.radius = Math.hypot(HALF, HALF, (this.maxY - this.minY) / 2 + 0.02);
  }

  private upload(attribute: BufferAttribute, range: { start: number; count: number }, count: number) {
    range.count = count;
    attribute.clearUpdateRanges();
    attribute.updateRanges.push(range);
    attribute.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
  }
}

/**
 * Owns four geometries, four meshes, and three materials (wood shares ground).
 * Ground delegates disposal here; the supplied LandscapeField is never owned.
 */
export class TerrainSurface {
  static readonly cellSize = TILE;
  static readonly span = HALF * 2;
  readonly mesh: Mesh<BufferGeometry, MeshLambertMaterial>;
  readonly extraMeshes: readonly Mesh<BufferGeometry, MeshLambertMaterial>[];
  readonly geometry: BufferGeometry;
  anchorX = Infinity;
  anchorDistance = Infinity;
  private seed = NaN;
  private revision = NaN;
  private enabled = false;
  private disposed = false;
  private readonly groundMaterial = new MeshLambertMaterial({ vertexColors: true });
  private readonly waterMaterial = new MeshLambertMaterial({ vertexColors: true, emissive: 0x126b86, emissiveIntensity: 0.08 });
  private readonly lavaMaterial = new MeshLambertMaterial({ vertexColors: true, emissive: 0xff4b13, emissiveIntensity: 0.38 });
  // Two bed triangles per cell, two wall triangles per distinct interior edge,
  // and two per perimeter edge is the exact worst-case ground requirement.
  private readonly ground = new GeometryBank(this.groundMaterial, GROUND_TRIANGLES, "landscape-ground");
  private readonly water = new GeometryBank(this.waterMaterial, WATER_TRIANGLES, "landscape-water");
  private readonly lava = new GeometryBank(this.lavaMaterial, CELLS * CELLS * 2, "landscape-lava");
  private readonly bridge = new GeometryBank(this.groundMaterial, BRIDGE_TRIANGLES, "landscape-bridges");
  private readonly banks = [this.ground, this.water, this.lava, this.bridge];
  private readonly heights = new Float64Array((CELLS + 1) * (CELLS + 1));
  private readonly surfaces = new Uint8Array(STRIDE * STRIDE);
  private readonly biomes = new Uint8Array(STRIDE * STRIDE);
  private readonly covers = new Uint8Array(STRIDE * STRIDE);
  private readonly floors = new Float64Array(STRIDE * STRIDE);
  private readonly levels = new Float64Array(STRIDE * STRIDE);
  private readonly bridgeBoundaries = new Uint8Array(CELLS * CELLS);
  private readonly bridgeDetails = new Uint8Array(CELLS * CELLS);
  private waterFoamTriangles = 0;
  private readonly sample: LandscapeSample = {
    biome: Biome.Desert, cover: 0, surface: Surface.Land,
    height: 0, floor: 0, colour: COLOURS[0], waterLevel: 0,
  };

  constructor(private readonly field: LandscapeField) {
    this.mesh = this.ground.mesh;
    this.geometry = this.ground.geometry;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = -2;
    this.extraMeshes = [this.water.mesh, this.lava.mesh, this.bridge.mesh];
  }

  heightAt(worldX: number, worldZ: number) {
    // Decks use these same triangles, so there is no visual foot offset.
    return this.field.heightAt(worldX, worldZ);
  }

  update(pose: RenderPose) {
    if (this.disposed) return;
    const x = Math.floor(pose.x / TILE) * TILE;
    const z = Math.floor(pose.z / TILE) * TILE;
    if (x !== this.anchorX || z !== this.anchorDistance || this.seed !== this.field.seed || this.revision !== this.field.revision || this.enabled !== this.field.enabled) {
      this.anchorX = x;
      this.anchorDistance = z;
      this.seed = this.field.seed;
      this.revision = this.field.revision;
      this.enabled = this.field.enabled;
      this.rebuild();
    }
    for (let i = 0; i < this.banks.length; i++) {
      const mesh = this.banks[i].mesh;
      mesh.position.x = x - pose.x;
      mesh.position.z = pose.z - z;
    }
  }

  private rebuild() {
    for (let i = 0; i < this.banks.length; i++) this.banks[i].begin();
    const startX = this.anchorX - HALF, startZ = this.anchorDistance - HALF;
    for (let z = 0; z <= CELLS; z++)
      for (let x = 0; x <= CELLS; x++)
        this.heights[z * (CELLS + 1) + x] = this.field.vertexHeight(startX + x * TILE, startZ + z * TILE);

    // One-cell halo gives visible boundaries exact neighbours without sample
    // allocations, including bridge underpass classification.
    for (let z = 0; z < STRIDE; z++) {
      for (let x = 0; x < STRIDE; x++) {
        const i = z * STRIDE + x;
        this.field.sample(startX + (x - 0.5) * TILE, startZ + (z - 0.5) * TILE, this.sample);
        this.surfaces[i] = this.sample.surface;
        this.biomes[i] = this.sample.biome;
        this.covers[i] = this.sample.biome * 3 + this.sample.cover;
        this.floors[i] = this.sample.floor - this.sample.height;
        this.levels[i] = this.sample.waterLevel - this.sample.height;
      }
    }
    // Bridge samples describe support. Infer the bed from adjacent pits;
    // a fully covered river defaults to water (lava in its own biome).
    for (let z = 0; z < STRIDE; z++) {
      for (let x = 0; x < STRIDE; x++) {
        const i = z * STRIDE + x;
        if (this.surfaces[i] !== Surface.Bridge) continue;
        const pit = (x > 0 && this.surfaces[i - 1] === Surface.Pit) ||
          (x + 1 < STRIDE && this.surfaces[i + 1] === Surface.Pit) ||
          (z > 0 && this.surfaces[i - STRIDE] === Surface.Pit) ||
          (z + 1 < STRIDE && this.surfaces[i + STRIDE] === Surface.Pit);
        this.floors[i] = pit ? -7 : -2.4;
      }
    }
    this.planDetails();
    for (let iz = 0; iz < CELLS; iz++) {
      for (let ix = 0; ix < CELLS; ix++) {
        const i = (iz + 1) * STRIDE + ix + 1;
        const vi = iz * (CELLS + 1) + ix;
        const x = ix * TILE - HALF, z = iz * TILE - HALF;
        const a = this.heights[vi], b = this.heights[vi + 1];
        const c = this.heights[vi + CELLS + 1], d = this.heights[vi + CELLS + 2];
        const surface = this.surfaces[i], floor = this.floors[i], tint = this.covers[i];
        this.ground.top(x, z, a + floor, b + floor, c + floor, d + floor, tint, floor < 0 ? 0.44 : 1);
        // Edge order follows the top perimeter. Wall fronts face lower beds;
        // every interior wall is submitted only by its higher side.
        this.edge(x, z, a, x + TILE, z, b, floor, this.floors[i - STRIDE], iz === 0, tint);
        this.edge(x + TILE, z, b, x + TILE, z + TILE, d, floor, this.floors[i + 1], ix === CELLS - 1, tint);
        this.edge(x + TILE, z + TILE, d, x, z + TILE, c, floor, this.floors[i + STRIDE], iz === CELLS - 1, tint);
        this.edge(x, z + TILE, c, x, z, a, floor, this.floors[i - 1], ix === 0, tint);
        const liquid = this.liquidAt(i);
        if (liquid !== Surface.Land) {
          const bank = liquid === Surface.Lava ? this.lava : this.water;
          const level = this.levels[i];
          bank.top(x, z, a + level, b + level, c + level, d + level, liquid === Surface.Lava ? LAVA_COLOUR : WATER_COLOUR);
          if (liquid === Surface.Water && surface !== Surface.Bridge)
            this.foam(i, x, z, a + level, b + level, c + level, d + level);
        }
        if (surface === Surface.Bridge) this.buildBridge(iz * CELLS + ix, x, z, a, b, c, d);
      }
    }
    for (let i = 0; i < this.banks.length; i++) this.banks[i].finish();
  }

  private planDetails() {
    let bridgeBase = 0, waterTop = 0;
    this.bridgeDetails.fill(0);
    this.bridgeBoundaries.fill(0);
    for (let iz = 0; iz < CELLS; iz++) {
      for (let ix = 0; ix < CELLS; ix++) {
        const k = iz * CELLS + ix, i = (iz + 1) * STRIDE + ix + 1;
        if (this.liquidAt(i) === Surface.Water) waterTop += 2;
        if (this.surfaces[i] !== Surface.Bridge) continue;
        // Caps on visible patch edges close the bounded mesh. Shared bridge
        // edges have neither duplicate deck walls nor decorative interior rails.
        let edges = 0;
        if (iz === 0 || this.surfaces[i - STRIDE] !== Surface.Bridge) edges |= 1;
        if (ix === CELLS - 1 || this.surfaces[i + 1] !== Surface.Bridge) edges |= 2;
        if (iz === CELLS - 1 || this.surfaces[i + STRIDE] !== Surface.Bridge) edges |= 4;
        if (ix === 0 || this.surfaces[i - 1] !== Surface.Bridge) edges |= 8;
        this.bridgeBoundaries[k] = edges;
        bridgeBase += 4 + 2 * ((edges & 1) + ((edges >> 1) & 1) + ((edges >> 2) & 1) + ((edges >> 3) & 1));
      }
    }
    this.waterFoamTriangles = WATER_TRIANGLES - waterTop;
    // A simple closed deck costs 4B + 2E triangles, where B is bridge cells
    // and E their exposed edges. E <= min(4B, 4(N-B)+224), hence at most
    // 19,152 essential triangles for this 56² patch, below the 24,576 cap.
    let remaining = BRIDGE_TRIANGLES - bridgeBase;
    // Prioritize detail near the player in four bounded rings. These passes
    // touch only cached numeric cells; there are no sorts or temporary arrays.
    for (let ring = 0; ring < 4; ring++) {
      for (let iz = 0; iz < CELLS; iz++) {
        for (let ix = 0; ix < CELLS; ix++) {
          const k = iz * CELLS + ix, i = (iz + 1) * STRIDE + ix + 1;
          if (this.surfaces[i] !== Surface.Bridge) continue;
          const x = (ix + 0.5) * TILE - HALF, z = (iz + 0.5) * TILE - HALF;
          const r2 = x * x + z * z;
          if ((r2 < 32 * 32 ? 0 : r2 < 48 * 48 ? 1 : r2 <= 80 * 80 ? 2 : 3) !== ring) continue;
          let detail = 0;
          if (r2 <= 80 * 80 && remaining >= 12) { detail |= 1; remaining -= 12; }
          if (this.surfaces[i - 1] !== Surface.Bridge && remaining >= 12) {
            detail |= 2; remaining -= 12;
            if (r2 < 48 * 48 && remaining >= 8) { detail |= 8; remaining -= 8; }
          }
          if (this.surfaces[i + 1] !== Surface.Bridge && remaining >= 12) {
            detail |= 4; remaining -= 12;
            if (r2 < 48 * 48 && remaining >= 8) { detail |= 16; remaining -= 8; }
          }
          this.bridgeDetails[k] = detail;
        }
      }
    }
  }

  private liquidAt(i: number) {
    const surface = this.surfaces[i];
    if (surface === Surface.Water || surface === Surface.Lava) return surface;
    if (surface === Surface.Bridge && this.floors[i] > -6)
      return this.biomes[i] === Biome.Lava ? Surface.Lava : Surface.Water;
    return Surface.Land;
  }

  private edge(x0: number, z0: number, h0: number, x1: number, z1: number, h1: number, top: number, bottom: number, outside: boolean, tint: number) {
    if (outside) bottom = top - 3;
    if (bottom >= top - 1e-8) return;
    this.ground.quad(x0, h0 + top, -z0, x0, h0 + bottom, -z0,
      x1, h1 + bottom, -z1, x1, h1 + top, -z1, tint, 0.64);
  }

  private interpolated(a: number, b: number, c: number, d: number, x: number, z: number) {
    const u = x / TILE, v = z / TILE;
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }

  private foam(i: number, x: number, z: number, a: number, b: number, c: number, d: number) {
    const width = 0.13;
    if (this.liquidAt(i - STRIDE) === Surface.Land && this.reserveFoam())
      this.water.quad(x, a + 0.004, -z, x + TILE, b + 0.004, -z,
        x + TILE, this.interpolated(a, b, c, d, TILE, width) + 0.004, -z - width,
        x, this.interpolated(a, b, c, d, 0, width) + 0.004, -z - width, FOAM_COLOUR);
    if (this.liquidAt(i + STRIDE) === Surface.Land && this.reserveFoam())
      this.water.quad(x, this.interpolated(a, b, c, d, 0, TILE - width) + 0.004, -z - TILE + width,
        x + TILE, this.interpolated(a, b, c, d, TILE, TILE - width) + 0.004, -z - TILE + width,
        x + TILE, d + 0.004, -z - TILE, x, c + 0.004, -z - TILE, FOAM_COLOUR);
    if (this.liquidAt(i - 1) === Surface.Land && this.reserveFoam())
      this.water.quad(x, a + 0.004, -z, x + width, this.interpolated(a, b, c, d, width, 0) + 0.004, -z,
        x + width, this.interpolated(a, b, c, d, width, TILE) + 0.004, -z - TILE, x, c + 0.004, -z - TILE, FOAM_COLOUR);
    if (this.liquidAt(i + 1) === Surface.Land && this.reserveFoam())
      this.water.quad(x + TILE - width, this.interpolated(a, b, c, d, TILE - width, 0) + 0.004, -z,
        x + TILE, b + 0.004, -z, x + TILE, d + 0.004, -z - TILE,
        x + TILE - width, this.interpolated(a, b, c, d, TILE - width, TILE) + 0.004, -z - TILE, FOAM_COLOUR);
  }

  private reserveFoam() {
    if (this.waterFoamTriangles < 2) return false;
    this.waterFoamTriangles -= 2;
    return true;
  }

  private buildBridge(k: number, x: number, z: number, a: number, b: number, c: number, d: number) {
    const bank = this.bridge;
    const detail = this.bridgeDetails[k], edges = this.bridgeBoundaries[k];
    const planks = detail & 1 ? 4 : 1;
    // Four planks clipped at the field diagonal. Unclipped strip quads would
    // interpolate the wrong support Y on a nonplanar terrain cell.
    for (let plank = 0; plank < planks; plank++) {
      const v0 = plank * TILE / planks, v1 = (plank + 1) * TILE / planks, u0 = TILE - v0, u1 = TILE - v1;
      const left0 = a + (c - a) * v0 / TILE, left1 = a + (c - a) * v1 / TILE;
      const diag0 = b + (c - b) * v0 / TILE, diag1 = b + (c - b) * v1 / TILE;
      const right0 = b + (d - b) * v0 / TILE, right1 = b + (d - b) * v1 / TILE;
      const tint = plank % 2 ? WOOD_COLOUR : LIGHT_WOOD_COLOUR;
      bank.quad(x, left0, -z - v0, x + u0, diag0, -z - v0,
        x + u1, diag1, -z - v1, x, left1, -z - v1, tint);
      bank.quad(x + u0, diag0, -z - v0, x + TILE, right0, -z - v0,
        x + TILE, right1, -z - v1, x + u1, diag1, -z - v1, tint);
    }
    if (edges & 1) this.bridgeWall(x, z, a, x + TILE, z, b);
    if (edges & 2) this.bridgeWall(x + TILE, z, b, x + TILE, z + TILE, d);
    if (edges & 4) this.bridgeWall(x + TILE, z + TILE, d, x, z + TILE, c);
    if (edges & 8) this.bridgeWall(x, z + TILE, c, x, z, a);
    bank.triangle(x, a - 0.18, -z, x, c - 0.18, -z - TILE, x + TILE, b - 0.18, -z, WOOD_COLOUR, 0.64);
    bank.triangle(x + TILE, d - 0.18, -z - TILE, x + TILE, b - 0.18, -z, x, c - 0.18, -z - TILE, WOOD_COLOUR, 0.64);
    // Safe routes predominantly follow world Z; rails sit on both X edges.
    for (let side = 0; side < 2; side++) {
      if (!(detail & (side ? 4 : 2))) continue;
      const rx = x + (side ? TILE - 0.16 : 0.04);
      const front = this.interpolated(a, b, c, d, rx - x + 0.06, 0);
      const back = this.interpolated(a, b, c, d, rx - x + 0.06, TILE);
      this.rail(rx, z, front + 0.65, back + 0.65);
      if (detail & (side ? 16 : 8)) {
        this.post(rx + 0.06, z + 0.17, this.interpolated(a, b, c, d, rx - x + 0.06, 0.17));
        this.post(rx + 0.06, z + TILE - 0.17, this.interpolated(a, b, c, d, rx - x + 0.06, TILE - 0.17));
      }
    }
  }

  private bridgeWall(x0: number, z0: number, h0: number, x1: number, z1: number, h1: number) {
    this.bridge.quad(x0, h0, -z0, x0, h0 - 0.18, -z0,
      x1, h1 - 0.18, -z1, x1, h1, -z1, WOOD_COLOUR, 0.72);
  }

  private rail(x: number, z: number, front: number, back: number) {
    const r = x + 0.12, far = z + TILE, f = front + 0.12, b = back + 0.12;
    const bank = this.bridge;
    bank.quad(x, f, -z, r, f, -z, r, b, -far, x, b, -far, LIGHT_WOOD_COLOUR);
    bank.quad(x, front, -z, x, back, -far, r, back, -far, r, front, -z, WOOD_COLOUR, 0.7);
    bank.quad(x, f, -z, x, front, -z, r, front, -z, r, f, -z, WOOD_COLOUR);
    bank.quad(r, f, -z, r, front, -z, r, back, -far, r, b, -far, WOOD_COLOUR);
    bank.quad(r, b, -far, r, back, -far, x, back, -far, x, b, -far, WOOD_COLOUR);
    bank.quad(x, b, -far, x, back, -far, x, front, -z, x, f, -z, WOOD_COLOUR);
  }

  /** Closed tapered tetrahedral posts: four outward-facing triangles each. */
  private post(x: number, z: number, h: number) {
    const r = 0.1, bank = this.bridge;
    bank.triangle(x - r, h, -z + r, x, h, -z - r, x + r, h, -z + r, WOOD_COLOUR);
    bank.triangle(x - r, h, -z + r, x, h + 0.71, -z, x, h, -z - r, LIGHT_WOOD_COLOUR);
    bank.triangle(x, h, -z - r, x, h + 0.71, -z, x + r, h, -z + r, WOOD_COLOUR);
    bank.triangle(x + r, h, -z + r, x, h + 0.71, -z, x - r, h, -z + r, WOOD_COLOUR);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (let i = 0; i < this.banks.length; i++) this.banks[i].dispose();
    this.groundMaterial.dispose();
    this.waterMaterial.dispose();
    this.lavaMaterial.dispose();
  }
}

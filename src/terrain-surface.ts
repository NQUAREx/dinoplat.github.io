import {
  Box3, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage,
  Mesh, MeshLambertMaterial, Sphere,
} from "three";
import { LandscapeField, Surface } from "./landscape";
import type { RenderPose } from "./render-pose";

const CELLS = 56, TILE = LandscapeField.tile, HALF = CELLS * TILE / 2;
const VERTICES = (CELLS + 1) ** 2, FACES = CELLS * CELLS * 2;
// Clip vertices: local world X, absolute Y, local world Z, hazard, bridge, plank.
const STRIDE = 6, EPS = 1e-7;
const COLOURS = [
  0xf4cf78, 0xeab360, 0xe79d66, 0x66526b, 0x8e5d57, 0x493f59,
  0x83c94e, 0x60b95a, 0xa2d768, 0x39b9d1, 0xff6b26, 0xce9651, 0xad713e,
];
const LINEAR = new Float32Array(COLOURS.length * 3), colour = new Color();
for (let i = 0; i < COLOURS.length; i++) {
  colour.setHex(COLOURS[i]);
  LINEAR[i * 3] = colour.r * 255;
  LINEAR[i * 3 + 1] = colour.g * 255;
  LINEAR[i * 3 + 2] = colour.b * 255;
}

/** Fixed arrays, cached upload ranges, no allocation during a rebuild. */
class GeometryBank {
  readonly geometry = new BufferGeometry();
  readonly mesh: Mesh<BufferGeometry, MeshLambertMaterial>;
  private readonly positions: BufferAttribute;
  private readonly normals: BufferAttribute;
  private readonly colours: BufferAttribute;
  private readonly haze: BufferAttribute;
  private readonly plank?: BufferAttribute;
  private readonly ranges = [{ start: 0, count: 0 }, { start: 0, count: 0 }, { start: 0, count: 0 }, { start: 0, count: 0 }, { start: 0, count: 0 }];
  private vertices = 0;
  private minY = Infinity;
  private maxY = -Infinity;
  constructor(material: MeshLambertMaterial, triangles: number, name: string, planks = false) {
    const count = triangles * 3;
    this.positions = new BufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage);
    this.normals = new BufferAttribute(new Float32Array(count * 3), 3).setUsage(DynamicDrawUsage);
    this.colours = new BufferAttribute(new Uint8Array(count * 3), 3, true).setUsage(DynamicDrawUsage);
    this.haze = new BufferAttribute(new Uint8Array(count), 1, true).setUsage(DynamicDrawUsage);
    // No index: each flat-shaded face owns its vertices; identity indices waste memory.
    this.geometry.setAttribute("position", this.positions);
    this.geometry.setAttribute("normal", this.normals);
    this.geometry.setAttribute("color", this.colours);
    this.geometry.setAttribute("ravineDepth", this.haze);
    if (planks) {
      this.plank = new BufferAttribute(new Float32Array(count), 1).setUsage(DynamicDrawUsage);
      this.geometry.setAttribute("plankCoordinate", this.plank);
    }
    this.geometry.setDrawRange(0, 0);
    this.geometry.boundingBox = new Box3();
    this.geometry.boundingSphere = new Sphere();
    this.mesh = new Mesh(this.geometry, material);
    this.mesh.name = name;
    this.mesh.visible = false;
  }
  begin() { this.vertices = 0; this.minY = Infinity; this.maxY = -Infinity; }
  triangle(ax: number, ay: number, az: number, bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number, tint: number, shade = 1, fa = 0, fb = fa, fc = fa, pa = 0, pb = pa, pc = pa) {
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-10) return;
    if (this.vertices + 3 > this.positions.count) throw Error(`Landscape bank overflow: ${this.mesh.name}`);
    nx /= length; ny /= length; nz /= length;
    const i = this.vertices, ci = tint * 3;
    this.positions.setXYZ(i, ax, ay, az); this.positions.setXYZ(i + 1, bx, by, bz); this.positions.setXYZ(i + 2, cx, cy, cz);
    for (let j = i; j < i + 3; j++) {
      this.normals.setXYZ(j, nx, ny, nz);
      for (let c = 0; c < 3; c++) this.colours.array[j * 3 + c] = Math.min(255, Math.round(LINEAR[ci + c] * shade));
    }
    this.haze.array[i] = Math.round(fa * 255); this.haze.array[i + 1] = Math.round(fb * 255); this.haze.array[i + 2] = Math.round(fc * 255);
    if (this.plank) { this.plank.array[i] = pa; this.plank.array[i + 1] = pb; this.plank.array[i + 2] = pc; }
    this.minY = Math.min(this.minY, ay, by, cy); this.maxY = Math.max(this.maxY, ay, by, cy);
    this.vertices += 3;
  }
  polygon(p: Float64Array, count: number, offset: number, tint: number, shade = 1, fog = 0, reverse = false, grain = NaN) {
    for (let i = 1; i + 1 < count; i++) {
      const b = (reverse ? i + 1 : i) * STRIDE, c = (reverse ? i : i + 1) * STRIDE;
      this.triangle(p[0], p[1] + offset, -p[2], p[b], p[b + 1] + offset, -p[b + 2], p[c], p[c + 1] + offset, -p[c + 2], tint, shade, fog, fog, fog,
        Number.isFinite(grain) ? p[5] - grain : 0, Number.isFinite(grain) ? p[b + 5] - grain : 0, Number.isFinite(grain) ? p[c + 5] - grain : 0);
    }
  }
  wall(p: Float64Array, a: number, b: number, top: number, bottom: number, tint: number, fog = 0) {
    const ax = p[a], az = -p[a + 2], ay = p[a + 1], bx = p[b], bz = -p[b + 2], by = p[b + 1];
    // Hazard polygon has positive world-XZ winding. Bank front faces inward.
    this.triangle(ax, ay + top, az, bx, by + bottom, bz, ax, ay + bottom, az, tint, 0.65, 0, fog, fog);
    this.triangle(ax, ay + top, az, bx, by + top, bz, bx, by + bottom, bz, tint, 0.65, 0, 0, fog);
  }
  finish() {
    this.geometry.setDrawRange(0, this.vertices); this.mesh.visible = this.vertices > 0;
    if (!this.vertices) return;
    this.upload(this.positions, 0, this.vertices * 3); this.upload(this.normals, 1, this.vertices * 3);
    this.upload(this.colours, 2, this.vertices * 3); this.upload(this.haze, 3, this.vertices);
    if (this.plank) this.upload(this.plank, 4, this.vertices);
    const extent = HALF + 0.9;
    this.geometry.boundingBox!.min.set(-extent, this.minY - 0.02, -extent);
    this.geometry.boundingBox!.max.set(extent, this.maxY + 0.02, extent);
    this.geometry.boundingSphere!.center.set(0, (this.minY + this.maxY) / 2, 0);
    this.geometry.boundingSphere!.radius = Math.hypot(extent, extent, (this.maxY - this.minY) / 2 + 0.02);
  }
  private upload(attribute: BufferAttribute, index: number, count: number) {
    const range = this.ranges[index]; range.count = count;
    attribute.clearUpdateRanges(); attribute.updateRanges.push(range); attribute.needsUpdate = true;
  }
  dispose() { this.mesh.removeFromParent(); this.geometry.dispose(); }
}

/** Sutherland–Hodgman on reusable six-component vertices; preserves exact support planes. */
function clip(input: Float64Array, count: number, output: Float64Array, component: number, sign: number, boundary = 0) {
  let result = 0;
  if (!count) return 0;
  let a = (count - 1) * STRIDE, va = (input[a + component] - boundary) * sign;
  for (let n = 0; n < count; n++) {
    const b = n * STRIDE, vb = (input[b + component] - boundary) * sign;
    if ((va >= 0) !== (vb >= 0)) {
      const t = va / (va - vb), dst = result++ * STRIDE;
      for (let c = 0; c < STRIDE; c++) output[dst + c] = input[a + c] + (input[b + c] - input[a + c]) * t;
      output[dst + component] = boundary;
    }
    if (vb >= 0) {
      const dst = result++ * STRIDE;
      for (let c = 0; c < STRIDE; c++) output[dst + c] = input[b + c];
    }
    a = b; va = vb;
  }
  return result;
}

/** Four opaque banks: irregular clipped shores, deep beds, liquids and arbitrary-angle bridge decks. */
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
  private readonly woodMaterial = new MeshLambertMaterial({ vertexColors: true });
  // Each triangle split by one shore yields <=3 top faces plus two bank faces.
  private readonly ground = new GeometryBank(this.groundMaterial, FACES * 5, "landscape-ground");
  private readonly water = new GeometryBank(this.waterMaterial, FACES * 2, "landscape-water");
  private readonly lava = new GeometryBank(this.lavaMaterial, FACES * 2, "landscape-lava");
  // Two clips yield <=5 vertices: 3 top+3 bottom+4 boundary-wall triangles.
  private readonly bridge = new GeometryBank(this.woodMaterial, FACES * 10, "landscape-bridges", true);
  private readonly banks = [this.ground, this.water, this.lava, this.bridge];
  private readonly grid = new Float64Array(VERTICES * STRIDE);
  private readonly face = new Float64Array(STRIDE * 3);
  private readonly land = new Float64Array(STRIDE * 10);
  private readonly hazard = new Float64Array(STRIDE * 10);
  private readonly deck = new Float64Array(STRIDE * 10);
  constructor(private readonly field: LandscapeField) {
    // Local depth haze, not layered transparent fog: no extra texture, draw or overdraw.
    this.groundMaterial.onBeforeCompile = shader => {
      shader.vertexShader = `attribute float ravineDepth; varying float vRavineDepth;\n${shader.vertexShader}`.replace("#include <begin_vertex>", "#include <begin_vertex>\nvRavineDepth = ravineDepth;");
      shader.fragmentShader = `varying float vRavineDepth;\n${shader.fragmentShader}`.replace("#include <opaque_fragment>", "outgoingLight = mix(outgoingLight, vec3(0.31, 0.335, 0.36), smoothstep(0.12, 1.0, vRavineDepth) * 0.96);\n#include <opaque_fragment>");
    };
    this.groundMaterial.customProgramCacheKey = () => "ravine-depth-haze-v1";
    // Grain changes colour, never support geometry. Extra geometric strip cuts
    // would create Float32 microcracks along otherwise identical shared edges.
    this.woodMaterial.onBeforeCompile = shader => {
      shader.vertexShader = `attribute float plankCoordinate; varying float vPlank;\n${shader.vertexShader}`.replace("#include <begin_vertex>", "#include <begin_vertex>\nvPlank = plankCoordinate;");
      shader.fragmentShader = `varying float vPlank;\n${shader.fragmentShader}`.replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= mix(0.78, 1.0, step(1.0, mod(floor(vPlank), 2.0)));");
    };
    this.woodMaterial.customProgramCacheKey = () => "continuous-bridge-grain-v1";
    this.mesh = this.ground.mesh; this.geometry = this.ground.geometry;
    this.mesh.receiveShadow = true; this.mesh.renderOrder = -2;
    this.bridge.mesh.receiveShadow = true;
    this.extraMeshes = [this.water.mesh, this.lava.mesh, this.bridge.mesh];
  }
  heightAt(worldX: number, worldZ: number) { return this.field.heightAt(worldX, worldZ); }
  update(pose: RenderPose) {
    if (this.disposed) return;
    const x = Math.floor(pose.x / TILE) * TILE, z = Math.floor(pose.z / TILE) * TILE;
    if (x !== this.anchorX || z !== this.anchorDistance || this.seed !== this.field.seed || this.revision !== this.field.revision || this.enabled !== this.field.enabled) {
      this.anchorX = x; this.anchorDistance = z; this.seed = this.field.seed;
      this.revision = this.field.revision; this.enabled = this.field.enabled;
      this.rebuild();
    }
    for (const bank of this.banks) { bank.mesh.position.x = x - pose.x; bank.mesh.position.z = pose.z - z; }
  }
  private rebuild() {
    for (const bank of this.banks) bank.begin();
    const startX = this.anchorX / TILE - CELLS / 2, startZ = this.anchorDistance / TILE - CELLS / 2;
    for (let z = 0; z <= CELLS; z++) for (let x = 0; x <= CELLS; x++) {
      const i = (z * (CELLS + 1) + x) * STRIDE;
      const wx = this.field.gridX(startX + x, startZ + z), wz = this.field.gridZ(startX + x, startZ + z);
      this.grid[i] = wx - this.anchorX; this.grid[i + 1] = this.field.vertexHeight(wx, wz);
      this.grid[i + 2] = wz - this.anchorDistance;
      this.grid[i + 3] = this.field.hazardAt(wx, wz); this.grid[i + 4] = this.field.bridgeMaskAt(wx, wz);
    }
    for (let z = 0; z < CELLS; z++) for (let x = 0; x < CELLS; x++) {
      const a = (z * (CELLS + 1) + x) * STRIDE, b = a + STRIDE, c = a + (CELLS + 1) * STRIDE, d = c + STRIDE;
      this.buildFace(a, b, c); this.buildFace(d, c, b);
    }
    for (const bank of this.banks) bank.finish();
  }
  private buildFace(a: number, b: number, c: number) {
    for (let j = 0; j < STRIDE; j++) { this.face[j] = this.grid[a + j]; this.face[STRIDE + j] = this.grid[b + j]; this.face[2 * STRIDE + j] = this.grid[c + j]; }
    const wx = this.anchorX + (this.face[0] + this.face[STRIDE] + this.face[2 * STRIDE]) / 3;
    const wz = this.anchorDistance + (this.face[2] + this.face[STRIDE + 2] + this.face[2 * STRIDE + 2]) / 3;
    const biome = this.field.biomeAt(wx, wz);
    const tint = biome * 3 + Math.min(2, Math.floor(this.field.noise(wx, wz, 14, 37) * 3.4));
    const landCount = clip(this.face, 3, this.land, 3, -1);
    this.ground.polygon(this.land, landCount, 0, tint);
    const hazardCount = clip(this.face, 3, this.hazard, 3, 1);
    if (hazardCount < 3) return;
    const kind = this.field.hazardKindAt(wx, wz), pit = kind === Surface.Pit, depth = pit ? -14 : -4.8;
    this.ground.polygon(this.hazard, hazardCount, depth, tint, 0.46, pit ? 1 : 0);
    for (let i = 0; i < hazardCount; i++) {
      const a = i * STRIDE, b = ((i + 1) % hazardCount) * STRIDE;
      if (Math.abs(this.hazard[a + 3]) < EPS && Math.abs(this.hazard[b + 3]) < EPS)
        this.ground.wall(this.hazard, a, b, 0, depth, tint, pit ? 1 : 0);
    }
    if (!pit) (kind === Surface.Lava ? this.lava : this.water).polygon(this.hazard, hazardCount, -0.9, kind === Surface.Lava ? 10 : 9);
    if (pit) return; // Dry ravines have no support deck: jump or go around.
    const deckCount = clip(this.hazard, hazardCount, this.deck, 4, 1);
    if (deckCount < 3) return;
    // Plank direction follows the crossing, not the terrain's storage axes.
    let lo = Infinity;
    for (let i = 0; i < deckCount; i++) {
      const k = i * STRIDE, v = this.field.bridgePlankAt(this.deck[k] + this.anchorX, this.deck[k + 2] + this.anchorDistance, wx, wz);
      this.deck[k + 5] = v; lo = Math.min(lo, v);
    }
    // Subtract an even integer before Float32 upload: period and grain match
    // across faces/rebases without losing sub-metre precision at 1,000,000m.
    this.bridge.polygon(this.deck, deckCount, 0, 11, 1, 0, false, Math.floor(lo / 2) * 2);
    this.bridge.polygon(this.deck, deckCount, -0.18, 12, 0.65, 0, true);
    for (let i = 0; i < deckCount; i++) {
      const a = i * STRIDE, b = ((i + 1) % deckCount) * STRIDE;
      if ((Math.abs(this.deck[a + 3]) < EPS && Math.abs(this.deck[b + 3]) < EPS) || (Math.abs(this.deck[a + 4]) < EPS && Math.abs(this.deck[b + 4]) < EPS))
        // Reverse deck boundary: the solid's front faces away from its centre.
        this.bridge.wall(this.deck, b, a, 0, -0.18, 12);
    }
  }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    for (const bank of this.banks) bank.dispose();
    this.groundMaterial.dispose(); this.waterMaterial.dispose(); this.lavaMaterial.dispose(); this.woodMaterial.dispose();
  }
}

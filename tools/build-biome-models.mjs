// Original, deterministic cartoon geometry. Run: node tools/build-biome-models.mjs
// Node built-ins only; no downloaded art, textures, authoring or generators at runtime.
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const TAU = Math.PI * 2;
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, s) => a.map((v) => v * s);
const dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const unit = (a) => mul(a, 1 / Math.hypot(...a));
const linear = (c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const palette = {
  bark: "a7542b", cut: "ffd58a", ring: "d48a40", green: "43b52c",
  lime: "7be344", pine: "168c55", teal: "25bd73", dry: "b9773e",
  straw: "e3ad43", basalt: "52637e", sand: "efac57", light: "c6dce5",
  blue: "25b5ed", cream: "fff2c3", coral: "ff704c", ink: "24374d",
};

class Model {
  constructor(name) {
    this.name = name;
    this.positions = []; this.normals = []; this.colors = []; this.indices = [];
  }
  face(points, color, outward) {
    let normal = unit(cross(sub(points[1], points[0]), sub(points[2], points[0])));
    if (outward && dot(normal, outward) < 0) {
      points = [...points].reverse(); normal = mul(normal, -1);
    }
    const hex = palette[color] ?? color;
    const rgb = [0, 2, 4].map((i) => Math.round(255 * linear(parseInt(hex.slice(i, i + 2), 16) / 255)));
    const start = this.positions.length / 3;
    for (const p of points) {
      this.positions.push(...p); this.normals.push(...normal); this.colors.push(...rgb);
    }
    for (let i = 1; i < points.length - 1; i++) this.indices.push(start, start + i, start + i + 1);
  }
  // Rings travel along an arbitrary axis. A zero radius produces one real pole.
  loft(origin, profiles, sides, color, scale = [1, 1], axis = [0, 1, 0], phase = 0) {
    const w = unit(axis);
    const u = unit(cross(w, Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0]));
    const v = cross(u, w);
    const centers = profiles.map(([y]) => add(origin, mul(w, y)));
    const rings = profiles.map(([, r], j) => Array.from({ length: r === 0 ? 1 : sides }, (_, i) => {
      const a = phase + i * TAU / sides;
      return add(centers[j], add(mul(u, Math.cos(a) * r * scale[0]), mul(v, Math.sin(a) * r * scale[1])));
    }));
    if (rings[0].length > 1) this.face(rings[0], color, mul(w, -1));
    for (let j = 1; j < rings.length; j++) {
      const a = rings[j - 1], b = rings[j];
      for (let i = 0; i < sides; i++) {
        const k = (i + 1) % sides;
        const points = a.length === 1 ? [a[0], b[i], b[k]] : b.length === 1 ? [a[i], b[0], a[k]] : [a[i], b[i], b[k], a[k]];
        const mid = mul(points.reduce(add, [0, 0, 0]), 1 / points.length);
        const axisPoint = add(origin, mul(w, dot(sub(mid, origin), w)));
        this.face(points, color, sub(mid, axisPoint));
      }
    }
    if (rings.at(-1).length > 1) this.face(rings.at(-1), color, w);
  }
  branch(a, b, r, top = r * 0.6, color = "bark", sides = 6) {
    this.loft(a, [[0, r], [Math.hypot(...sub(b, a)), top]], sides, color, [1, 1], sub(b, a));
  }
  blob(center, size, color, low = false, sides = 7) {
    const levels = low ? [[-1, 0], [0, 1], [1, 0]] : [[-1, 0], [-0.65, 0.76], [0.25, 1], [0.78, 0.62], [1, 0]];
    this.loft(center, levels.map(([y, r]) => [y * size[1], r]), sides, color, [size[0], size[2]], [0, 1, 0], Math.PI / sides);
  }
}

function tree(kind, low, dead = false) {
  const m = new Model(`${dead ? "dead-tree" : "tree"}-${low ? "lod-" : ""}${kind}`);
  const n = low ? 4 : 6;
  if (kind === 0) {
    m.branch([0, 0, 0], [0.08, 2.25, 0], 0.28, 0.15, "bark", n);
    const tips = [[-0.72, 2.65, 0], [0.72, 2.85, -0.05], [0, 3.12, 0.35]];
    tips.forEach((tip) => m.branch([0.04, 1.55, 0], tip, 0.14, dead ? 0.035 : 0.08, "bark", n));
    if (!dead) {
      const crowns = [[-0.72, 2.78, 0, 0.98, 0.85, 0.87], [0.65, 2.95, -0.06, 1.05, 0.91, 0.94], [0.02, 3.45, 0.26, 1.03, 0.91, 0.95]];
      crowns.forEach((c, i) => m.blob(c.slice(0, 3), c.slice(3), i === 2 ? "lime" : "green", low));
      if (!low) m.blob([0, 2.68, -0.63], [0.79, 0.7, 0.67], "teal");
    } else if (!low) m.branch([-0.45, 2.2, 0], [-0.9, 2.25, -0.24], 0.07, 0.02);
  } else if (kind === 1) {
    m.branch([0, 0, 0], [0, 3.9, 0], 0.23, 0.045, "bark", n);
    if (dead) {
      for (let j = 0; j < (low ? 2 : 3); j++) for (let i = 0; i < 3; i++) {
        const a = i * TAU / 3 + j * 0.65, y = 1.1 + j * 0.85, r = 0.95 - j * 0.2;
        m.branch([0, y + 0.22, 0], [Math.cos(a) * r, y, Math.sin(a) * r], 0.085, 0.018, "dry", low ? 3 : 4);
      }
    } else for (let j = 0; j < 3; j++) {
      const r = 1.2 - j * 0.27, y = 0.65 + j * 0.9;
      m.loft([0, y, 0], low ? [[0, r], [1.75, 0]] : [[0, r * 0.82], [0.16, r], [0.9, r * 0.49], [1.75, 0]], low ? 5 : 7, ["pine", "green", "teal"][j]);
    }
  } else {
    m.branch([0, 0, 0], [0.25, 1.9, 0], 0.24, 0.16, "bark", n);
    const tips = [[-1.2, 2.7, 0.05], [1.3, 2.82, 0], [0.15, 2.8, -0.65]];
    tips.forEach((tip) => m.branch([0.2, 1.6, 0], tip, 0.14, dead ? 0.025 : 0.07, "bark", n));
    if (!dead) tips.forEach((tip, i) => m.blob(add(tip, [0, 0.18, 0]), [1.25, 0.48, 0.91], i === 1 ? "lime" : "green", low, low ? 6 : 8));
    else if (!low) {
      m.branch([-0.5, 2.24, 0.02], [-0.55, 2.85, -0.3], 0.065, 0.018);
      m.branch([0.8, 2.42, 0], [1.25, 2.57, 0.45], 0.065, 0.018);
    }
  }
  return m;
}

function blade(m, x, z, height, angle, color, width = 0.09) {
  const direction = [Math.cos(angle), 0, Math.sin(angle)];
  const side = [-direction[2], 0, direction[0]];
  const base = [x, 0, z];
  const corners = [add(base, mul(side, width)), add(base, mul(direction, 0.035)), add(base, mul(side, -width)), add(base, mul(direction, -0.035))];
  const tip = add(add(base, mul(direction, height * 0.33)), [0, height, 0]);
  m.face(corners, color, [0, -1, 0]);
  for (let i = 0; i < 4; i++) m.face([corners[i], tip, corners[(i + 1) % 4]], color, sub(corners[i], base));
}

export function buildBiomeModels() {
  const models = [];
  for (const dead of [false, true]) for (const low of [false, true]) for (let k = 0; k < 3; k++) models.push(tree(k, low, dead));
  for (let k = 0; k < 3; k++) {
    const m = new Model(`rock-${k}`), color = ["basalt", "sand", "light"][k];
    if (k === 0) {
      m.loft([0, 0, 0], [[0, 0.65], [0.18, 0.79], [0.9, 0.62], [1.12, 0.38]], 5, color, [1, 0.8]);
      m.loft([0.55, 0, 0.13], [[0, 0.38], [0.44, 0.4], [0.59, 0.24]], 5, color);
    } else if (k === 1) {
      m.loft([0, 0, 0], [[0, 0.86], [0.14, 1], [0.5, 0.92], [0.66, 0.68]], 6, color, [1, 0.65], [0, 1, 0], 0.18);
      m.loft([-0.15, 0.5, 0], [[0, 0.61], [0.31, 0.51], [0.42, 0.31]], 5, "efbb69", [1, 0.75]);
    } else {
      m.blob([0, 0.58, 0], [0.85, 0.58, 0.7], color, false, 5);
      m.blob([0.62, 0.21, 0.1], [0.33, 0.21, 0.31], "e2edf0", true, 5);
    }
    models.push(m);
  }
  for (let k = 0; k < 3; k++) {
    const m = new Model(`grass-${k}`);
    for (let i = 0; i < 5 + k; i++) {
      const a = i * 2.4 + k * 0.3;
      blade(m, Math.cos(a) * 0.16, Math.sin(a) * 0.16, 0.36 + (i % 3) * 0.15 + k * 0.04, a, ["green", "lime", "straw"][k]);
    }
    models.push(m);
  }
  const shrub = new Model("shrub-0");
  [[-0.33, 0.4, 0, 0.47, 0.4, 0.4], [0.28, 0.45, 0, 0.5, 0.45, 0.46], [0, 0.65, -0.15, 0.43, 0.4, 0.39]].forEach((c, i) => shrub.blob(c.slice(0, 3), c.slice(3), i === 2 ? "lime" : "green", false, 6));
  models.push(shrub);
  const reed = new Model("reed-0");
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.18, z = (i % 2) * 0.12, h = 0.9 + i * 0.16;
    reed.branch([x, 0, z], [x + 0.06, h, z], 0.026, 0.018, "green", 4);
    reed.loft([x + 0.06, h - 0.1, z], [[0, 0.07], [0.26, 0.07], [0.31, 0.035]], 5, "dry");
    blade(reed, x, z, h * 0.65, i * 2.3, "lime", 0.065);
  }
  models.push(reed);
  const flower = new Model("flower-0");
  flower.branch([0, 0, 0], [0, 0.6, 0], 0.035, 0.025, "green", 4);
  blade(flower, 0, 0, 0.36, 0, "lime", 0.11);
  for (let i = 0; i < 5; i++) {
    const a = i * TAU / 5;
    flower.blob([Math.cos(a) * 0.18, 0.6, Math.sin(a) * 0.18], [0.16, 0.08, 0.16], "coral", true, 5);
  }
  flower.blob([0, 0.66, 0], [0.1, 0.075, 0.1], "cut", true, 6);
  models.push(flower);
  const log = new Model("log-0");
  // Grounded horizontal log: axis Y=.3, lower bark at Y=0, crest Y=.6.
  log.loft([-0.95, 0.3, 0], [[0, 0.26], [0.1, 0.3], [1.8, 0.3], [1.9, 0.26]], 8, "bark", [1, 1], [1, 0, 0]);
  for (const [x, axis] of [[-0.951, [-1, 0, 0]], [0.951, [1, 0, 0]]]) {
    log.loft([x, 0.3, 0], [[0, 0.22], [0.005, 0.22]], 8, "cut", [1, 1], axis);
    log.loft([x + axis[0] * 0.006, 0.3, 0], [[0, 0.115], [0.001, 0.115]], 6, "ring", [1, 1], axis);
  }
  log.branch([0.2, 0.43, 0], [0.3, 0.75, 0.12], 0.105, 0.075);
  models.push(log);
  const stump = new Model("stump-0");
  stump.loft([0, 0, 0], [[0, 0.52], [0.13, 0.38], [0.57, 0.31], [0.65, 0.34]], 7, "bark");
  stump.loft([0, 0.651, 0], [[0, 0.285], [0.002, 0.285]], 7, "cut");
  stump.loft([0, 0.654, 0], [[0, 0.15], [0.001, 0.15]], 6, "ring");
  models.push(stump);
  const tumble = new Model("tumbleweed-0");
  // Three interlaced woody hoops. Overall radius .45; pivot remains at ground Y=0.
  for (let plane = 0; plane < 3; plane++) {
    const pts = Array.from({ length: 8 }, (_, i) => {
      const a = i * TAU / 8, c = Math.cos(a) * 0.412, s = Math.sin(a) * 0.412;
      return plane === 0 ? [c, 0.45 + s, 0] : plane === 1 ? [0, 0.45 + c, s] : [s, 0.45, c];
    });
    for (let i = 0; i < 8; i++) tumble.branch(pts[i], pts[(i + 1) % 8], 0.038, 0.038, plane === 1 ? "dry" : "straw", 3);
  }
  models.push(tumble);
  const bird = new Model("bird-body");
  // Forward is render -Z (logical +Z). After normalization: shoulder [+/-.14,.16,0].
  bird.blob([0, 0.22, 0], [0.23, 0.22, 0.4], "blue", false, 6);
  bird.blob([0, 0.4, -0.27], [0.19, 0.18, 0.19], "blue", true, 6);
  bird.blob([0, 0.17, -0.18], [0.18, 0.14, 0.19], "cream", true, 5);
  bird.branch([0, 0.37, -0.4], [0, 0.35, -0.63], 0.1, 0, "cut", 4);
  bird.branch([0, 0.21, 0.28], [0, 0.27, 0.62], 0.09, 0.025, "teal", 4);
  for (const x of [-0.17, 0.17]) bird.blob([x, 0.45, -0.32], [0.035, 0.04, 0.045], "ink", true, 4);
  models.push(bird);
  const wing = new Model("bird-wing");
  // Right wing root at local origin. Mirror across X for the left wing.
  const outline = [[0, 0, -0.1], [0.22, 0, -0.17], [0.76, 0, 0.13], [0.53, 0, 0.23], [0, 0, 0.13]];
  const top = outline.map((p) => add(p, [0, 0.035, 0]));
  const bottom = outline.map((p) => add(p, [0, -0.025, 0]));
  wing.face(top, "blue", [0, 1, 0]);
  wing.face(bottom, "blue", [0, -1, 0]);
  for (let i = 0; i < outline.length; i++) {
    const j = (i + 1) % outline.length;
    wing.face([top[i], top[j], bottom[j], bottom[i]], "teal", sub(outline[i], [0.27, 0, 0.04]));
  }
  models.push(wing);
  // Match static collider heights. LODs use the SAME detailed normalization.
  // Broad crowns intentionally overhang the trunk-only collision radius.
  function fit(model, minY, scaleY, scaleXZ = 1) {
    for (let i = 0; i < model.positions.length; i += 3) {
      model.positions[i] *= scaleXZ;
      model.positions[i + 1] = (model.positions[i + 1] - minY) * scaleY;
      model.positions[i + 2] *= scaleXZ;
      const normal = unit([model.normals[i] / scaleXZ, model.normals[i + 1] / scaleY, model.normals[i + 2] / scaleXZ]);
      model.normals.splice(i, 3, ...normal);
    }
  }
  for (const m of models) {
    const height = m.name.startsWith("tree-") ? 3.4 : m.name.startsWith("dead-tree-") ? 3.1 : m.name.startsWith("rock-") ? 1.1 : m.name === "log-0" ? 0.65 : m.name === "bird-body" ? 0.38 : undefined;
    if (m.name.includes("lod") || m.name === "bird-wing" || m.name === "tumbleweed-0") continue;
    const ys = m.positions.filter((_, i) => i % 3 === 1);
    const minY = Math.min(...ys), scaleY = height === undefined ? 1 : height / (Math.max(...ys) - minY);
    fit(m, minY, scaleY, m.name === "bird-body" ? 0.75 : 1);
    if (m.name.startsWith("tree-") || m.name.startsWith("dead-tree-")) {
      fit(models.find((lod) => lod.name === m.name.replace(/-(\d)$/, "-lod-$1")), minY, scaleY);
    }
    if (m.name === "bird-body") fit(wing, 0, scaleY, 0.75);
  }
  return models;
}

/** Tiny deterministic glTF 2 writer: one node/mesh/primitive per model. */
export function encodeGlb(models) {
  const chunks = [], views = [], accessors = [];
  let byteLength = 0;
  function attribute(data, componentType, type, target, bounds = false, normalized = false) {
    const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const padded = Buffer.alloc((bytes.length + 3) & ~3); bytes.copy(padded);
    const view = views.length;
    views.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length, target });
    chunks.push(padded); byteLength += padded.length;
    const width = type === "VEC3" ? 3 : 1;
    const accessor = { bufferView: view, componentType, count: data.length / width, type };
    if (normalized) accessor.normalized = true;
    if (bounds) {
      accessor.min = Array.from({ length: width }, (_, j) => { let n = Infinity; for (let i = j; i < data.length; i += width) n = Math.min(n, data[i]); return n; });
      accessor.max = Array.from({ length: width }, (_, j) => { let n = -Infinity; for (let i = j; i < data.length; i += width) n = Math.max(n, data[i]); return n; });
    }
    accessors.push(accessor); return accessors.length - 1;
  }
  const meshes = models.map((m) => {
    const count = m.indices.length / 3;
    if (count >= (m.name.startsWith("tree-") || m.name.startsWith("dead-tree-") ? 500 : 200)) throw new Error(`${m.name}: triangle budget ${count}`);
    return { name: m.name, primitives: [{
      attributes: {
        POSITION: attribute(new Float32Array(m.positions), 5126, "VEC3", 34962, true),
        NORMAL: attribute(new Float32Array(m.normals), 5126, "VEC3", 34962),
        COLOR_0: attribute(new Uint8Array(m.colors), 5121, "VEC3", 34962, false, true),
      }, indices: attribute(new Uint16Array(m.indices), 5123, "SCALAR", 34963), material: 0, mode: 4,
    }] };
  });
  const document = {
    asset: { version: "2.0", generator: "Dino Run original offline biome geometry" },
    scene: 0, scenes: [{ nodes: models.map((_, i) => i) }],
    nodes: models.map((m, mesh) => ({ name: m.name, mesh })), meshes,
    // The runtime owns Lambert shading; this opaque transport material is discarded.
    materials: [{ name: "biome-vertex-colors", alphaMode: "OPAQUE", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 } }],
    accessors, bufferViews: views, buffers: [{ byteLength }],
  };
  const json = Buffer.from(JSON.stringify(document));
  const jsonChunk = Buffer.alloc((json.length + 3) & ~3, 0x20); json.copy(jsonChunk);
  const header = Buffer.alloc(20);
  header.write("glTF"); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jsonChunk.length + byteLength, 8);
  header.writeUInt32LE(jsonChunk.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(byteLength); binHeader.writeUInt32LE(0x004e4942, 4);
  const result = Buffer.concat([header, jsonChunk, binHeader, ...chunks]);
  if (result.length >= 250000) throw new Error(`GLB budget: ${result.length} bytes`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const models = buildBiomeModels();
  const glb = encodeGlb(models);
  await writeFile(new URL("../src/assets/biome-models.glb", import.meta.url), glb);
  for (const m of models) console.log(`${m.name}: ${m.indices.length / 3} triangles`);
  console.log(`biome-models.glb: ${glb.length} bytes, ${models.length} meshes`);
}

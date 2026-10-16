import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BufferGeometry, Material, Mesh, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import type { BiomeModels as Library } from "../src/biome-models.ts";

const bytes = await readFile(new URL("../src/assets/biome-models.glb", import.meta.url));
const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const document = JSON.parse(bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)));
const gltf = await new GLTFLoader().parseAsync(data, "");
const meshes = new Map<string, Mesh>();
gltf.scene.traverse((object) => { if (object instanceof Mesh) meshes.set(object.name, object); });
const names = [
  ...["tree", "tree-lod", "dead-tree", "dead-tree-lod", "rock", "grass"].flatMap((kind) => Array.from({ length: 3 }, (_, i) => `${kind}-${i}`)),
  "shrub-0", "reed-0", "flower-0", "log-0", "stump-0", "tumbleweed-0", "bird-body", "bird-wing",
];
function bounds(name: string) {
  const geometry = meshes.get(name)!.geometry;
  geometry.computeBoundingBox();
  return geometry.boundingBox!;
}
after(() => {
  const materials = new Set<Material>();
  for (const mesh of meshes.values()) {
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
  }
  for (const material of materials) material.dispose();
});

test("biome bundle has 26 original opaque indexed vertex-colour meshes within budgets", () => {
  assert.equal(bytes.toString("ascii", 0, 4), "glTF");
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.ok(bytes.length < 250000);
  assert.deepEqual([...meshes.keys()].sort(), [...names].sort());
  assert.equal(document.meshes.length, 26);
  for (const field of ["images", "textures", "skins", "animations", "extensionsRequired"]) assert.equal(document[field], undefined);
  assert.equal(document.buffers.length, 1);
  assert.equal(document.buffers[0].uri, undefined);
  for (const mesh of document.meshes) {
    assert.equal(mesh.primitives.length, 1);
    const primitive = mesh.primitives[0];
    assert.equal(primitive.mode, 4);
    assert.equal(document.accessors[primitive.indices].componentType, 5123);
    const triangles = document.accessors[primitive.indices].count / 3;
    assert.ok(triangles > 0 && triangles < (/^(dead-)?tree-/.test(mesh.name) ? 500 : 200), mesh.name);
    const colors = document.accessors[primitive.attributes.COLOR_0];
    assert.equal(colors.componentType, 5121);
    assert.equal(colors.normalized, true);
    assert.equal(colors.type, "VEC3", "no per-vertex alpha");
    const material = document.materials[primitive.material];
    assert.equal(material.alphaMode, "OPAQUE");
    assert.equal(material.pbrMetallicRoughness.baseColorFactor[3], 1);
  }
  for (const mesh of meshes.values()) {
    assert.equal(mesh.geometry.groups.length, 0);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      assert.equal(material.transparent, false);
      assert.equal(material.opacity, 1);
      assert.equal(material.alphaTest, 0);
    }
  }
});

test("every indexed face has finite unit outward normals, real volume and reused vertices", () => {
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), normal = new Vector3(), authored = new Vector3();
  for (const [name, mesh] of meshes) {
    const geometry = mesh.geometry, position = geometry.getAttribute("position"), normals = geometry.getAttribute("normal"), index = geometry.index!;
    assert.ok(position.count < index.count, `${name}: actual indexed vertex reuse`);
    assert.equal(normals.count, position.count);
    assert.equal(geometry.getAttribute("color").count, position.count);
    let volume = 0;
    for (let i = 0; i < position.count; i++) {
      a.fromBufferAttribute(position, i);
      assert.ok(a.toArray().every(Number.isFinite), name);
      authored.fromBufferAttribute(normals, i);
      assert.ok(Math.abs(authored.length() - 1) < 1e-5, name);
    }
    for (let i = 0; i < index.count; i += 3) {
      const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      assert.ok(ids.every((id) => id >= 0 && id < position.count), name);
      a.fromBufferAttribute(position, ids[0]); b.fromBufferAttribute(position, ids[1]); c.fromBufferAttribute(position, ids[2]);
      normal.crossVectors(b.clone().sub(a), c.clone().sub(a));
      assert.ok(normal.length() > 1e-9, `${name}: no degenerate triangles`);
      authored.fromBufferAttribute(normals, ids[0]);
      assert.ok(normal.normalize().dot(authored) > 0.98, `${name}: winding agrees with authored normal`);
      volume += a.dot(b.clone().cross(c)) / 6;
    }
    assert.ok(volume > 0.00001, `${name}: positive enclosed volume`);
    const size = bounds(name).getSize(new Vector3());
    assert.ok(Math.min(size.x, size.y, size.z) > 0.01, name);
  }
});

test("ground bases and collider-sized heights match renderer conventions", () => {
  for (const name of names) {
    if (name === "bird-wing" || name === "tumbleweed-0") continue;
    assert.ok(Math.abs(bounds(name).min.y) < 1e-6, `${name} base at Y=0`);
  }
  for (const [prefix, height] of [["tree", 3.4], ["dead-tree", 3.1], ["rock", 1.1]] as const) {
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(bounds(`${prefix}-${i}`).max.y - height) < 1e-5);
  }
  assert.ok(Math.abs(bounds("log-0").max.y - 0.65) < 1e-6);
  const log = bounds("log-0");
  assert.ok(log.max.x - log.min.x > 1.8 && log.max.z - log.min.z < 0.7, "log lies horizontally");
  for (let i = 0; i < 3; i++) {
    assert.ok(bounds(`tree-${i}`).max.x > 0.58, "crown overhangs trunk-only collider");
    assert.ok(Math.max(Math.abs(bounds(`rock-${i}`).min.x), bounds(`rock-${i}`).max.x) <= 1.01);
  }
});

test("LODs retain ground, height and silhouette in the same coordinate system", () => {
  for (const prefix of ["tree", "dead-tree"]) for (let i = 0; i < 3; i++) {
    const detail = meshes.get(`${prefix}-${i}`)!.geometry, low = meshes.get(`${prefix}-lod-${i}`)!.geometry;
    assert.ok(low.index!.count < detail.index!.count * 0.55);
    const a = bounds(`${prefix}-${i}`), b = bounds(`${prefix}-lod-${i}`);
    assert.ok(Math.abs(a.max.y - b.max.y) < 0.03, "same transform; only polygonal branch-cap extrema may differ");
    assert.ok(Math.abs(a.min.y - b.min.y) < 1e-6);
    assert.ok(a.getCenter(new Vector3()).distanceTo(b.getCenter(new Vector3())) < 0.16);
    for (const axis of ["x", "z"] as const) assert.ok(Math.abs(a.getSize(new Vector3())[axis] - b.getSize(new Vector3())[axis]) < 0.35);
  }
});

test("bird faces -Z with body Y=0 and shoulder-rooted mirrorable wing; tumbleweed center Y=.45", () => {
  const bird = bounds("bird-body");
  assert.ok(Math.abs(bird.min.y) < 1e-6 && Math.abs(bird.max.y - 0.38) < 1e-6);
  assert.ok(bird.min.z < -0.46 && bird.max.z < 0.48, "beak is the forward -Z extremity");
  const positions = meshes.get("bird-body")!.geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) assert.ok(Math.hypot(positions.getX(i), positions.getZ(i)) <= 0.48);
  const wing = bounds("bird-wing");
  assert.equal(wing.min.x, 0);
  assert.ok(wing.max.x > 0.5 && wing.max.x < 0.65);
  assert.ok(wing.min.y < 0 && wing.max.y > 0 && wing.min.z < 0 && wing.max.z > 0, "shoulder origin remains inside root");
  const tumble = bounds("tumbleweed-0");
  assert.ok(tumble.getCenter(new Vector3()).distanceTo(new Vector3(0, 0.45, 0)) < 1e-6);
  const p = meshes.get("tumbleweed-0")!.geometry.getAttribute("position");
  let radius = 0;
  for (let i = 0; i < p.count; i++) radius = Math.max(radius, Math.hypot(p.getX(i), p.getY(i) - 0.45, p.getZ(i)));
  assert.ok(radius > 0.43 && radius <= 0.450001);
});

test("offline authoring reproduces the exact committed bundle", async () => {
  const moduleUrl = new URL("../tools/build-biome-models.mjs", import.meta.url).href;
  const { buildBiomeModels, encodeGlb } = await import(moduleUrl);
  assert.deepEqual(encodeGlb(buildBiomeModels()), bytes);
});

test("BiomeModels loads cached geometry, throws on missing names, and disposes success/failure resources once", async (t) => {
  // Exercise the actual runtime class in Node, replacing only Vite's ?url transform.
  const source = (await readFile(new URL("../src/biome-models.ts", import.meta.url), "utf8"))
    .replace(/import modelUrl from "[^\"]+";/, 'const modelUrl = "https://biome.test/biome-models.glb";');
  const compiled = transpileModule(source, { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2020 } }).outputText
    .replace(/from "(three[^\"]*)"/g, (_, specifier: string) => `from ${JSON.stringify(import.meta.resolve(specifier))}`);
  const { BiomeModels } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`) as { BiomeModels: { load(): Promise<Library> } };
  const geometryDisposals = new Map<BufferGeometry, number>(), materialDisposals = new Map<Material, number>();
  t.mock.method(BufferGeometry.prototype, "dispose", function (this: BufferGeometry) { geometryDisposals.set(this, (geometryDisposals.get(this) ?? 0) + 1); });
  t.mock.method(Material.prototype, "dispose", function (this: Material) { materialDisposals.set(this, (materialDisposals.get(this) ?? 0) + 1); });
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(bytes));
  const library = await BiomeModels.load();
  assert.equal(library.geometries.size, 26);
  assert.equal(library.get("tree-0"), library.get("tree-0"));
  assert.ok(library.get("tree-0").boundingBox && library.get("tree-0").boundingSphere);
  assert.throws(() => library.get("missing"), /Missing biome model/);
  assert.equal(geometryDisposals.size, 0);
  assert.equal(materialDisposals.size, 1);
  library.dispose(); library.dispose();
  assert.equal(geometryDisposals.size, 26);
  assert.ok([...geometryDisposals.values()].every((count) => count === 1));
  assert.throws(() => library.get("tree-0"), /disposed/);

  fetchMock.mock.mockImplementation(async () => new Response(null, { status: 503 }));
  await assert.rejects(BiomeModels.load(), (error: Error & { cause?: Error }) => error.cause?.message === "HTTP 503");
  fetchMock.mock.mockImplementation(async () => new Response("invalid GLB"));
  await assert.rejects(BiomeModels.load(), /Failed to load biome models/);

  const parse = GLTFLoader.prototype.parseAsync;
  for (const failure of ["missing", "duplicate"]) {
    geometryDisposals.clear(); materialDisposals.clear();
    fetchMock.mock.mockImplementation(async () => new Response(bytes));
    const parseMock = t.mock.method(GLTFLoader.prototype, "parseAsync", async function (this: GLTFLoader, buffer: ArrayBuffer, path: string) {
      const loaded = await parse.call(this, buffer, path);
      loaded.scene.getObjectByName("grass-2")!.name = failure === "duplicate" ? "tree-0" : "unknown";
      return loaded;
    });
    await assert.rejects(BiomeModels.load(), /Failed to load biome models/);
    assert.equal(geometryDisposals.size, 26, `${failure}: release every geometry after validation failure`);
    assert.ok([...geometryDisposals.values()].every((count) => count === 1));
    assert.equal(materialDisposals.size, 1);
    assert.ok([...materialDisposals.values()].every((count) => count === 1));
    parseMock.mock.restore();
  }
});

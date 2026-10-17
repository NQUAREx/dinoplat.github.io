import { test } from "node:test";
import assert from "node:assert/strict";
import { BufferAttribute, FrontSide, Raycaster, Scene, Vector3 } from "three";
import { Ground } from "../src/ground.ts";
import { Biome, LandscapeField, Surface } from "../src/landscape.ts";
import { RenderPose } from "../src/render-pose.ts";
import { Simulation } from "../src/simulation.ts";

const near = (a: number, b: number, epsilon = 3e-5) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const banks = (g: Ground) => [g.mesh, ...g.extraMeshes];
function ray(mesh: Ground["mesh"], origin: Vector3, direction: Vector3) {
  mesh.updateMatrixWorld(true);
  return new Raycaster(origin, direction).intersectObject(mesh, false)[0];
}
function down(mesh: Ground["mesh"], pose: RenderPose, x: number, z: number) {
  return ray(mesh, new Vector3(x - pose.x, 200, pose.z - z), new Vector3(0, -1, 0));
}

/** Only vertex fields are overridden; production CPU interpolation/classification is tested. */
class Fixture extends LandscapeField {
  mode = "shore";
  kind = Surface.Water;
  changes = 0;
  calls = 0;
  angle = 0.71;
  constructor(readonly ox = 0, readonly oz = 0) { super(19); }
  override get revision() { return this.changes; }
  override vertexHeight(x: number, z: number) {
    this.calls++;
    return this.enabled ? 3 + Math.sin((x - this.ox) / 7) * 0.8 + Math.cos((z - this.oz) / 11) * 0.6 : 0;
  }
  override biomeAt(): Biome { return Biome.Meadow; }
  override hazardKindAt() { return this.kind; }
  override pitMaskAt(x: number, z: number) {
    return this.kind === Surface.Pit ? this.hazardAt(x, z) : -1;
  }
  override hazardAt(x: number, z: number) {
    if (!this.enabled || this.mode === "land") return -1;
    if (this.mode === "alternating") return (Math.round(x / 4) + Math.round(z / 4)) % 2 === 0 ? 1 : -1;
    return this.mode === "shore" ? x - this.ox + 0.63 * (z - this.oz) - 1.37 : 1;
  }
  override bridgeMaskAt(x: number, z: number) {
    if (this.mode === "bridge") return 1;
    if (this.mode === "alternating") return Math.round(x / 4) % 2 === 0 ? 1 : -1;
    return this.mode === "corridor" ? 3.2 - Math.abs(Math.cos(this.angle) * (x - this.ox) + Math.sin(this.angle) * (z - this.oz)) : -1;
  }
  override bridgeAngleAt() { return this.angle; }
}

test("warped terrain and angled bridges agree with CPU across random points, seams and rebases", () => {
  for (const [ox, oz] of [[0, 0], [-147, -91], [1000000, -1000000]]) {
    const field = new Fixture(ox, oz), ground = new Ground(field), pose = new RenderPose();
    try {
      for (const mode of ["land", "corridor", "shore"]) {
        field.mode = mode; field.changes++;
        for (const shift of [0.01, 3.99, 4.01, -0.01, 0.01]) {
          field.angle = shift < 0 ? -1.13 : shift > 4 ? 2.37 : 0.71;
          field.changes++;
          pose.x = ox + shift; pose.z = oz - shift; ground.surface.update(pose);
          const points: number[][] = [];
          for (let i = 0; i < 24; i++) points.push([ox + (field.hash(i, 3) - 0.5) * 80, oz + (field.hash(i, 7) - 0.5) * 80]);
          const ix = Math.floor(ox / 4), iz = Math.floor(oz / 4);
          const bx = field.gridX(ix + 1, iz), bz = field.gridZ(ix + 1, iz);
          const cx = field.gridX(ix, iz + 1), cz = field.gridZ(ix, iz + 1);
          points.push([bx, bz], [(bx + cx) / 2, (bz + cz) / 2], [(bx + cx) / 2 + 1e-4, (bz + cz) / 2]);
          for (const [x, z] of points) {
            const surface = field.surfaceAt(x, z), height = field.heightAt(x, z);
            const deck = down(ground.extraMeshes[2], pose, x, z), terrain = down(ground.mesh, pose, x, z);
            assert.equal(!!deck, surface === Surface.Bridge, `${mode} deck at ${x},${z}`);
            assert.ok(terrain, `missing terrain at ${x},${z}`);
            near((deck ?? terrain)!.point.y, height - (surface === Surface.Water ? 4.8 : 0));
            near(ground.surface.heightAt(x, z), height, 1e-9);
            if (surface === Surface.Water) near(down(ground.extraMeshes[0], pose, x, z)!.point.y, height - 0.9);
          }
        }
      }
    } finally { ground.dispose(); }
  }
});

test("oblique pit shores face the hole; gray depth haze needs no extra material or texture", () => {
  const field = new Fixture(), ground = new Ground(field), pose = new RenderPose(); field.kind = Surface.Pit;
  try {
    ground.surface.update(pose);
    const g = ground.mesh.geometry, p = g.getAttribute("position"), n = g.getAttribute("normal"), haze = g.getAttribute("ravineDepth");
    let walls = 0, deep = 0;
    for (let i = 0; i < g.drawRange.count; i += 3) {
      if (Math.abs(n.getY(i)) < 0.01) {
        walls++;
        assert.ok(n.getX(i) - 0.63 * n.getZ(i) > 0, "front must face positive hazard");
        assert.ok(Math.abs(n.getX(i)) > 0.1 && Math.abs(n.getZ(i)) > 0.1, "non-axis shoreline");
        const center = new Vector3(), normal = new Vector3(n.getX(i), n.getY(i), n.getZ(i));
        for (let j = 0; j < 3; j++) center.add(new Vector3(p.getX(i + j), p.getY(i + j), p.getZ(i + j)).multiplyScalar(1 / 3));
        assert.ok(ray(ground.mesh, center.clone().addScaledVector(normal, 0.1), normal.clone().negate()));
      }
      for (let j = 0; j < 3; j++) if (haze.getX(i + j) > 0.99) deep++;
    }
    assert.ok(walls > 20 && deep > 100);
    assert.ok(ground.extraMeshes.slice(0, 2).every(m => m.geometry.drawRange.count === 0));
    const shader = { vertexShader: "#include <begin_vertex>", fragmentShader: "#include <opaque_fragment>" };
    ground.material.onBeforeCompile(shader as never, null as never);
    assert.match(shader.vertexShader, /attribute float ravineDepth/);
    assert.match(shader.fragmentShader, /vec3\(0\.31, 0\.335, 0\.36\)/);
    assert.match(shader.fragmentShader, /vRavineDepth/);
    assert.equal(haze.array.constructor, Uint8Array); assert.equal(haze.normalized, true);
  } finally { ground.dispose(); }
});

test("angled bridge has top, underside and outward sides, with no internal walls", () => {
  const field = new Fixture(), ground = new Ground(field), pose = new RenderPose(); field.mode = "corridor";
  try {
    ground.surface.update(pose);
    const bridge = ground.extraMeshes[2], p = bridge.geometry.getAttribute("position"), n = bridge.geometry.getAttribute("normal");
    let sides = 0, bottoms = 0;
    for (let i = 0; i < bridge.geometry.drawRange.count; i += 3) {
      if (n.getY(i) < -0.8) bottoms++;
      if (Math.abs(n.getY(i)) > 0.01) continue;
      sides++;
      const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
      const z = -(p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      // The clipped edge follows the interpolated vertex mask, including where
      // a triangle straddles the absolute-value cusp of the raw corridor.
      assert.equal(field.surfaceAt(x - n.getX(i) * 0.01, z + n.getZ(i) * 0.01), Surface.Bridge);
      assert.equal(field.surfaceAt(x + n.getX(i) * 0.01, z - n.getZ(i) * 0.01), Surface.Water);
      assert.ok((n.getX(i) * Math.cos(field.angle) - n.getZ(i) * Math.sin(field.angle)) * (x * Math.cos(field.angle) + z * Math.sin(field.angle)) > 0);
    }
    assert.ok(sides > 20 && bottoms > 20);
    for (const t of [-40.2, -4.3, 0.7, 25.1, 60.3]) {
      const x = -Math.sin(field.angle) * t, z = Math.cos(field.angle) * t;
      assert.equal(field.surfaceAt(x, z), Surface.Bridge);
      near(down(bridge, pose, x, z)!.point.y, field.heightAt(x, z));
      const underside = ray(bridge, new Vector3(x, -30, -z), new Vector3(0, 1, 0));
      assert.ok(underside); near(underside.point.y, field.heightAt(x, z) - 0.18);
    }
  } finally { ground.dispose(); }
});

test("fixed buffers survive all-land/water/pit/lava/bridge and alternating masks", t => {
  const field = new Fixture(), ground = new Ground(field), pose = new RenderPose();
  const meshes = banks(ground), geometries = meshes.map(m => m.geometry);
  const attributes = geometries.map(g => Object.values(g.attributes) as BufferAttribute[]);
  const arrays = attributes.map(as => as.map(a => a.array));
  const bytes = arrays.flat().reduce((n, a) => n + a.byteLength, 0);
  const scratch = Object.values(ground.surface).reduce((n, v) => n + (ArrayBuffer.isView(v) ? v.byteLength : 0), 0);
  assert.ok(bytes + scratch <= 12 * 1024 * 1024, `${bytes + scratch} CPU buffer bytes`);
  t.diagnostic(`${bytes} geometry bytes per CPU/GPU copy; ${scratch} CPU scratch bytes; ${bytes + scratch} total CPU buffer bytes`);
  try {
    for (let pass = 0; pass < 2; pass++) for (const mode of ["land", "water", "pit", "lava", "bridge", "alternating"]) {
      field.mode = mode; field.kind = mode === "pit" ? Surface.Pit : mode === "lava" ? Surface.Lava : Surface.Water;
      field.changes++; pose.x = pass * -1000000; pose.z = pass * 1000000;
      assert.doesNotThrow(() => ground.surface.update(pose), mode);
      for (let b = 0; b < meshes.length; b++) {
        const g = meshes[b].geometry;
        assert.equal(g, geometries[b]); assert.equal(g.index, null);
        assert.ok(g.drawRange.count >= 0 && g.drawRange.count <= g.getAttribute("position").count);
        assert.equal(g.drawRange.count % 3, 0);
        Object.values(g.attributes).forEach((a, i) => {
          assert.equal(a, attributes[b][i]); assert.equal(a.array, arrays[b][i]);
          for (let j = 0; j < g.drawRange.count * a.itemSize; j++) assert.ok(Number.isFinite(a.array[j]));
        });
      }
      if (mode === "bridge" || mode === "land") for (let i = 0; i < 12; i++) {
        const x = pose.x + i * 3.17, z = pose.z - i * 2.71;
        near(down(mode === "bridge" ? meshes[3] : meshes[0], pose, x, z)!.point.y, field.heightAt(x, z));
      }
    }
  } finally { ground.dispose(); }
});

test("normal frames upload nothing; anchor/seed/revision/enabled invalidate", () => {
  const field = new Fixture(), ground = new Ground(field), pose = new RenderPose(), game = new Simulation(7);
  try {
    ground.update(game, pose);
    const attrs = banks(ground).flatMap(m => Object.values(m.geometry.attributes) as BufferAttribute[]);
    const versions = attrs.map(a => a.version), ranges = attrs.map(a => a.updateRanges[0]), calls = field.calls;
    for (let i = 0; i < 100; i++) {
      pose.x = i * 0.01; pose.z = i * 0.02; pose.heading += 0.1; pose.distance += 10000; game.time += 0.1; ground.update(game, pose);
    }
    assert.equal(field.calls, calls);
    attrs.forEach((a, i) => { assert.equal(a.version, versions[i]); assert.equal(a.updateRanges[0], ranges[i]); });
    for (const change of [() => { pose.x = 4.1; }, () => field.reset(8), () => { field.changes++; }, () => { field.enabled = false; }]) {
      const version = attrs[0].version; change(); ground.update(game, pose); assert.equal(attrs[0].version, version + 1);
    }
    assert.ok(ground.extraMeshes.every(m => !m.visible));
  } finally { ground.dispose(); }
});

test("real fields retain bounded triangles and exact CPU support", t => {
  const field = new LandscapeField(), ground = new Ground(field), pose = new RenderPose();
  let maximum = 0, supported = 0, bridges = 0, dryPits = 0;
  try {
    for (const [seed, x, z] of [[1, 0, 0], [12, -999043, -1397], [32, -997303, -3937], [38, -996781, -4699], [1979, 1000000, -1000000]]) {
      field.reset(seed); pose.x = x; pose.z = z; ground.surface.update(pose);
      const triangles = banks(ground).reduce((sum, m) => sum + m.geometry.drawRange.count / 3, 0);
      maximum = Math.max(maximum, triangles); assert.ok(triangles < 30000, `${seed}: ${triangles} triangles`);
      for (let i = 0; i < 100; i++) {
        const wx = x + (field.hash(i, 5) - 0.5) * 160, wz = z + (field.hash(i, 9) - 0.5) * 160;
        const surface = field.surfaceAt(wx, wz), deck = down(ground.extraMeshes[2], pose, wx, wz);
        assert.equal(!!deck, surface === Surface.Bridge);
        if (surface === Surface.Pit) {
          dryPits++;
          assert.equal(down(ground.extraMeshes[0], pose, wx, wz), undefined, "no cyan water triangle in dry pit");
          assert.equal(down(ground.extraMeshes[1], pose, wx, wz), undefined, "no lava triangle in dry pit");
        }
        if (!field.supportAt(wx, wz)) continue;
        supported++; if (deck) bridges++;
        near((deck ?? down(ground.mesh, pose, wx, wz))!.point.y, field.heightAt(wx, wz));
      }
    }
    assert.ok(supported > 100 && bridges > 0 && dryPits > 0);
    t.diagnostic(`maximum ${maximum} triangles; ${supported} support rays including ${bridges} bridges; ${dryPits} dry-pit rays without liquid`);
  } finally { ground.dispose(); }
});

test("four banks/four texture-free materials dispose exactly once", () => {
  const ground = new Ground(new Fixture()), scene = new Scene(), pose = new RenderPose();
  ground.surface.update(pose); scene.add(...banks(ground));
  const meshes = banks(ground), materials = [...new Set(meshes.map(m => m.material))];
  assert.equal(meshes.length, 4); assert.equal(materials.length, 4);
  const counts = new Map<object, number>();
  for (const resource of [...meshes.map(m => m.geometry), ...materials]) {
    counts.set(resource, 0); resource.addEventListener("dispose", () => counts.set(resource, counts.get(resource)! + 1));
  }
  for (const material of materials) {
    assert.equal(material.vertexColors, true); assert.equal(material.isMeshLambertMaterial, true);
    assert.equal(material.transparent, false); assert.equal(material.side, FrontSide);
    assert.ok(Object.values(material).every(v => !(v && typeof v === "object" && "isTexture" in v)));
  }
  const position = ground.mesh.geometry.getAttribute("position") as BufferAttribute, version = position.version;
  ground.surface.dispose(); ground.dispose(); ground.dispose(); pose.x = 40; ground.surface.update(pose);
  assert.equal(position.version, version); assert.equal(scene.children.length, 0);
  for (const count of counts.values()) assert.equal(count, 1);
});

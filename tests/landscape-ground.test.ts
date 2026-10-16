import { test } from "node:test";
import assert from "node:assert/strict";
import { BufferAttribute, Color, Mesh, Raycaster, Scene, Vector3, type BufferGeometry, type MeshLambertMaterial } from "three";
import { Ground } from "../src/ground.ts";
import { Biome, LandscapeField, Surface, type LandscapeSample } from "../src/landscape.ts";
import { RenderPose } from "../src/render-pose.ts";
import { Simulation } from "../src/simulation.ts";
import { TerrainSurface } from "../src/terrain-surface.ts";

const COVER_COLOURS = [0xf4cf78, 0xeab360, 0xe79d66, 0x66526b, 0x8e5d57, 0x493f59, 0x83c94e, 0x60b95a, 0xa2d768];
type GroundMesh = Mesh<BufferGeometry, MeshLambertMaterial>;
const near = (actual: number, expected: number, epsilon = 0.00002) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

/** Known nonplanar cells, all hazards, and all nine covers on a bounded field. */
class FixtureField extends LandscapeField {
  sampleCalls = 0;
  tuningRevision = 0;
  override get revision() { return this.tuningRevision; }
  sampleObject?: LandscapeSample;
  constructor(readonly originX = 0, readonly originZ = 0) { super(7); }
  override vertexHeight(x: number, z: number) {
    if (!this.enabled) return 0;
    x -= this.originX; z -= this.originZ;
    return 3 + Math.sin(x / 7) * 0.8 + Math.cos(z / 11) * 0.6;
  }
  override biomeAt(x: number): Biome {
    return (Math.floor((x - this.originX) / 12) % 3 + 3) % 3;
  }
  override surfaceAt(x: number, z: number): Surface {
    if (!this.enabled || Math.floor((z - this.originZ) / 4) !== 0) return Surface.Land;
    const cell = Math.floor((x - this.originX) / 4);
    return cell === 0 ? Surface.Water : cell === 1 ? Surface.Pit : cell === 2 ? Surface.Lava : cell === 3 ? Surface.Bridge : Surface.Land;
  }
  override sample(x: number, z: number, out: LandscapeSample) {
    this.sampleCalls++;
    if (this.sampleObject) assert.equal(out, this.sampleObject, "one cached sample object");
    this.sampleObject = out;
    out.biome = this.biomeAt(x);
    out.cover = (Math.floor((x - this.originX) / 4) % 3 + 3) % 3;
    out.surface = this.surfaceAt(x, z);
    out.height = this.heightAt(x, z);
    out.floor = out.height - (out.surface === Surface.Pit ? 7 : out.surface === Surface.Water || out.surface === Surface.Lava ? 2.4 : 0);
    out.waterLevel = out.height - 0.9;
    out.colour = COVER_COLOURS[out.biome * 3 + out.cover];
    return out;
  }
}

function hit(mesh: GroundMesh, pose: RenderPose, x: number, z: number) {
  mesh.updateMatrixWorld(true);
  const ray = new Raycaster(new Vector3(x - pose.x, 30, pose.z - z), new Vector3(0, -1, 0));
  return ray.intersectObject(mesh, false)[0];
}

class DenseField extends FixtureField {
  mode = 0;
  override surfaceAt(x: number, z: number): Surface {
    const ix = Math.floor(x / 4), iz = Math.floor(z / 4);
    const parity = ((ix + iz) % 2 + 2) % 2;
    if (this.mode === 0) return Surface.Bridge;
    if (this.mode === 1) return parity ? Surface.Bridge : Surface.Water;
    if (this.mode === 2) return parity ? Surface.Water : Surface.Land;
    if (this.mode === 3) return Surface.Water;
    if (this.mode === 4) return Surface.Lava;
    if (this.mode === 5) return parity ? Surface.Pit : Surface.Land;
    return [Surface.Land, Surface.Water, Surface.Pit][((ix + iz) % 3 + 3) % 3];
  }
}

test("fixed memory bounds survive dense bridges, checkerboards, and full water/lava fields", () => {
  const field = new DenseField(), ground = new Ground(field), pose = new RenderPose();
  const meshes = [ground.mesh, ...ground.extraMeshes];
  const arrays = meshes.flatMap(mesh => [mesh.geometry.index!.array, ...Object.values(mesh.geometry.attributes).map(a => a.array)]);
  const bytes = arrays.reduce((n, array) => n + array.byteLength, 0);
  assert.equal(bytes, 5200416);
  const bridgeCapacity = ground.extraMeshes[2].geometry.index!.count / 3;
  assert.equal(bridgeCapacity, 24576);
  try {
    for (let mode = 0; mode < 7; mode++) {
      field.mode = mode; field.tuningRevision++;
      ground.surface.update(pose);
      for (const mesh of meshes) {
        assert.ok(mesh.geometry.drawRange.count <= mesh.geometry.index!.count);
        assert.ok(mesh.geometry.drawRange.count >= 0);
      }
      if (mode === 0) {
        // Every bridge cell retains its complete support surface even after
        // optional plank detail exhausts the bank's fixed capacity.
        const p = ground.extraMeshes[2].geometry.getAttribute("position");
        const areas = new Float64Array(56 * 56);
        let simpleDecks = 0;
        const faces = new Uint8Array(56 * 56);
        for (let i = 0; i < ground.extraMeshes[2].geometry.drawRange.count; i += 3) {
          let support = true;
          for (let j = 0; j < 3; j++)
            if (Math.abs(p.getY(i + j) - field.heightAt(p.getX(i + j), -p.getZ(i + j))) > 0.00001) support = false;
          if (!support) continue;
          const ax = p.getX(i), az = -p.getZ(i), bx = p.getX(i + 1), bz = -p.getZ(i + 1), cx = p.getX(i + 2), cz = -p.getZ(i + 2);
          const cell = Math.floor(((az + bz + cz) / 3 + 112) / 4) * 56 + Math.floor(((ax + bx + cx) / 3 + 112) / 4);
          areas[cell] += ((bx - ax) * (cz - az) - (bz - az) * (cx - ax)) / 2;
          faces[cell]++;
        }
        for (let i = 0; i < areas.length; i++) {
          near(areas[i], 16);
          if (faces[i] === 2) simpleDecks++;
        }
        assert.ok(simpleDecks > 0, "dense fields fall back to simple decks");
      }
      if (mode === 2) assert.equal(ground.extraMeshes[0].geometry.drawRange.count / 3, 8192, "foam is capped after reserving all water tops");
      if (mode === 3) assert.equal(ground.extraMeshes[0].geometry.drawRange.count / 3, 6272);
      if (mode === 4) assert.equal(ground.extraMeshes[1].geometry.drawRange.count / 3, 6272);
      if (mode === 6) assert.equal(ground.mesh.geometry.drawRange.count / 3, 19040, "all interior ground edges can differ");
      const current = meshes.flatMap(mesh => [mesh.geometry.index!.array, ...Object.values(mesh.geometry.attributes).map(a => a.array)]);
      current.forEach((array, i) => assert.equal(array, arrays[i], "rebuilds retain every backing buffer"));
    }
  } finally { ground.dispose(); }
});

test("side-by-side bridge cells omit interior rails and duplicate deck walls", () => {
  class AdjacentBridgeField extends FixtureField {
    override surfaceAt(x: number, z: number): Surface {
      if (Math.floor(x / 4) === 4 && Math.floor(z / 4) === 0) return Surface.Bridge;
      return super.surfaceAt(x, z);
    }
  }
  const field = new AdjacentBridgeField(), ground = new Ground(field), pose = new RenderPose();
  try {
    ground.surface.update(pose);
    const geometry = ground.extraMeshes[2].geometry, p = geometry.getAttribute("position");
    assert.equal(geometry.drawRange.count / 3, 84);
    for (let i = 0; i < geometry.drawRange.count; i++)
      if (Math.abs(p.getX(i) - 16) < 0.3)
        assert.ok(p.getY(i) < field.heightAt(p.getX(i), -p.getZ(i)) + 0.3, "no rail crosses the shared interior edge");
    for (const x of [14, 15.9, 16.1, 18])
      near(hit(ground.extraMeshes[2], pose, x, 2.3)!.point.y, field.heightAt(x, 2.3));
  } finally { ground.dispose(); }
});

test("volumetric beds, water, lava, and bridge decks follow exact field triangles", () => {
  const field = new FixtureField(), ground = new Ground(field), pose = new RenderPose();
  try {
    ground.surface.update(pose);
    const [water, lava, bridge] = ground.extraMeshes;
    for (const [x, z] of [[-2.7, 1.2], [-0.4, 3.1], [18.2, 2.6], [-4.2, -2.8]]) {
      const top = hit(ground.mesh, pose, x, z)!;
      assert.ok(top);
      near(top.point.y, field.heightAt(x, z));
      assert.ok(top.face!.normal.y > 0.9);
    }
    for (const [x, surface, floor] of [[1.4, water, 2.4], [9.4, lava, 2.4]] as const) {
      near(hit(ground.mesh, pose, x, 2.2)!.point.y, field.heightAt(x, 2.2) - floor);
      near(hit(surface, pose, x, 2.2)!.point.y, field.heightAt(x, 2.2) - 0.9);
    }
    near(hit(ground.mesh, pose, 5.3, 2.4)!.point.y, field.heightAt(5.3, 2.4) - 7);
    assert.equal(hit(water, pose, 5.3, 2.4), undefined);
    assert.equal(hit(lava, pose, 5.3, 2.4), undefined);
    // Samples on both sides of u+v=1, including a bridge plank boundary.
    for (const [u, v] of [[0.4, 0.7], [1.2, 1.6], [2.2, 1.8], [3.1, 3.2], [2.7, 2.0]]) {
      const x = 12 + u;
      near(hit(bridge, pose, x, v)!.point.y, field.heightAt(x, v));
      assert.equal(ground.surface.heightAt(x, v), field.heightAt(x, v));
    }
    assert.equal(ground.mesh.position.y, 0);
    assert.equal(ground.extraMeshes.length, 3);
    assert.equal(TerrainSurface.span, 224);
    assert.equal(TerrainSurface.cellSize, 4);
  } finally { ground.dispose(); }
});

test("cliff fronts face the lower bed and all closed bridge parts wind outward", () => {
  const field = new FixtureField(), ground = new Ground(field), pose = new RenderPose();
  try {
    ground.surface.update(pose);
    const geometry = ground.surface.geometry, position = geometry.getAttribute("position"), normal = geometry.getAttribute("normal");
    for (const x of [0, 4]) {
      let wall = 0;
      for (let i = 0; i < geometry.drawRange.count; i += 3) {
        if (position.getX(i) !== x || position.getX(i + 1) !== x || position.getX(i + 2) !== x) continue;
        const z = -(position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3;
        if (z <= 0 || z >= 4 || Math.abs(normal.getY(i)) > 0.01) continue;
        assert.ok(normal.getX(i) > 0.99, `bank at x=${x} must face the hazard`);
        wall++;
      }
      assert.equal(wall, 2);
    }
    const bridge = ground.extraMeshes[2].geometry;
    assert.equal(bridge.drawRange.count / 3, 64);
    const p = bridge.getAttribute("position");
    // Deck, each rail and each individual tetrahedral post is a closed solid.
    let start = 0;
    for (const triangles of [24, 12, 4, 4, 12, 4, 4]) {
      let volume = 0;
      for (let i = start; i < start + triangles * 3; i += 3) {
        const ax = p.getX(i), ay = p.getY(i), az = p.getZ(i);
        const bx = p.getX(i + 1), by = p.getY(i + 1), bz = p.getZ(i + 1);
        const cx = p.getX(i + 2), cy = p.getY(i + 2), cz = p.getZ(i + 2);
        volume += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
      }
      assert.ok(volume > 0.001, `closed part at ${start} has outward winding: volume=${volume}`);
      start += triangles * 3;
    }
  } finally { ground.dispose(); }
});

test("million-metre and negative rebases retain exact geometry and absolute Y", () => {
  for (const [originX, originZ] of [[-1000000, 1000000], [1000000, -1000000]]) {
    const field = new FixtureField(originX, originZ), ground = new Ground(field), pose = new RenderPose();
    try {
      const x = originX + 14.7, z = originZ + 2.3, expected = field.heightAt(x, z);
      for (const delta of [-0.01, 0.01, 3.99, 4.01, -4.01]) {
        pose.x = originX + delta; pose.z = originZ - delta;
        pose.distance = 123456789; pose.heading += Math.PI / 2;
        ground.surface.update(pose);
        near(hit(ground.extraMeshes[2], pose, x, z)!.point.y, expected);
        assert.equal(ground.surface.heightAt(x, z), expected);
        for (const mesh of [ground.mesh, ...ground.extraMeshes]) {
          near(mesh.position.x + pose.x, ground.surface.anchorX, 1e-8);
          near(pose.z - mesh.position.z, ground.surface.anchorDistance, 1e-8);
          assert.equal(mesh.position.y, 0);
          const positions = mesh.geometry.getAttribute("position");
          for (let i = 0; i < mesh.geometry.drawRange.count; i++) {
            assert.ok(Math.abs(positions.getX(i)) <= 112.00001);
            assert.ok(Math.abs(positions.getZ(i)) <= 112.00001);
            assert.ok(mesh.geometry.boundingBox!.containsPoint(new Vector3().fromBufferAttribute(positions, i)));
          }
        }
      }
    } finally { ground.dispose(); }
  }
});

test("anchor/seed/enabled changes reuse banks; ordinary frames upload nothing", () => {
  const field = new FixtureField(), ground = new Ground(field), pose = new RenderPose(), game = new Simulation(7);
  try {
    ground.update(game, pose);
    const banks = [ground.mesh, ...ground.extraMeshes];
    const geometries = banks.map(mesh => mesh.geometry);
    const positions = geometries.map(geometry => geometry.getAttribute("position") as BufferAttribute);
    const versions = positions.map(attribute => attribute.version);
    const ranges = positions.map(attribute => attribute.updateRanges[0]);
    const calls = field.sampleCalls;
    for (let i = 0; i < 100; i++) {
      pose.x = i * 0.01; pose.z = i * 0.02; pose.distance += 10000; pose.heading += 0.1; game.time += 0.1;
      ground.update(game, pose);
    }
    assert.equal(field.sampleCalls, calls);
    for (let i = 0; i < banks.length; i++) {
      assert.equal(banks[i].geometry, geometries[i]);
      assert.equal(positions[i].version, versions[i]);
      assert.equal(positions[i].updateRanges[0], ranges[i]);
    }
    assert.notEqual(ground.extraMeshes[0].position.y, 0);
    pose.x = 4.1;
    ground.update(game, pose);
    assert.ok(field.sampleCalls > calls);
    assert.equal(positions[0].version, versions[0] + 1);
    assert.equal(positions[0].updateRanges[0], ranges[0]);
    const anchorVersion = positions[0].version;
    field.reset(8); ground.update(game, pose);
    assert.equal(positions[0].version, anchorVersion + 1);
    field.tuningRevision++; ground.update(game, pose);
    assert.equal(positions[0].version, anchorVersion + 2);
    field.enabled = false; ground.update(game, pose);
    assert.equal(positions[0].version, anchorVersion + 3);
    assert.ok(ground.extraMeshes.every(mesh => !mesh.visible && mesh.geometry.drawRange.count === 0));
    near(hit(ground.mesh, pose, 0.4, 0.7)!.point.y, 0);
    assert.equal(ground.surface.heightAt(0.4, 0.7), 0);
  } finally { ground.dispose(); }
});

test("nine cached cover colours, conservative bounds, four draws, and real-field triangle budget", () => {
  const field = new FixtureField(), ground = new Ground(field), pose = new RenderPose();
  try {
    ground.surface.update(pose);
    const geometry = ground.surface.geometry, colours = geometry.getAttribute("color"), normals = geometry.getAttribute("normal");
    const observed = new Set<string>();
    for (let i = 0; i < geometry.drawRange.count; i += 3) {
      if (normals.getY(i) > 0.9)
        observed.add([colours.getX(i), colours.getY(i), colours.getZ(i)].map(c => Math.round(c * 255)).join(","));
    }
    for (const hex of COVER_COLOURS) {
      const c = new Color(hex);
      assert.ok(observed.has([c.r, c.g, c.b].map(v => Math.round(v * 255)).join(",")), hex.toString(16));
    }
    for (const mesh of [ground.mesh, ...ground.extraMeshes]) {
      assert.equal(mesh.material.map, null);
      assert.equal(mesh.material.vertexColors, true);
      assert.equal(mesh.material.isMeshLambertMaterial, true);
      assert.equal(mesh.frustumCulled, true);
      assert.ok(mesh.geometry.index);
      assert.ok(mesh.geometry.boundingSphere!.radius >= Math.hypot(112, 112));
    }
  } finally { ground.dispose(); }

  const real = new LandscapeField(), landscape = new Ground(real);
  try {
    // Includes the densest bridge window found in the initial forty-seed scan.
    for (const [seed, x, z] of [[1, 0, 0], [12, -999043, -1397], [32, -997303, -3937], [38, -996781, -4699], [1979, 1000000, -1000000]]) {
      real.reset(seed); pose.x = x; pose.z = z;
      landscape.surface.update(pose);
      const banks = [landscape.mesh, ...landscape.extraMeshes];
      const triangles = banks.reduce((n, mesh) => n + mesh.geometry.drawRange.count / 3, 0);
      assert.ok(triangles < 18000, `seed ${seed}: ${triangles} triangles`);
      assert.ok(banks.filter(mesh => mesh.visible).length <= 4);
    }
  } finally { landscape.dispose(); }
});

test("surface is the sole resource owner and mixed/repeated disposal is idempotent", () => {
  const ground = new Ground(new LandscapeField()), scene = new Scene(), pose = new RenderPose();
  ground.surface.update(pose);
  const meshes = [ground.mesh, ...ground.extraMeshes];
  scene.add(...meshes);
  const geometries = meshes.map(mesh => mesh.geometry), materials = [...new Set(meshes.map(mesh => mesh.material))];
  const counts = new Map<object, number>();
  for (const resource of [...geometries, ...materials]) {
    counts.set(resource, 0);
    resource.addEventListener("dispose", () => counts.set(resource, counts.get(resource)! + 1));
  }
  const position = ground.surface.geometry.getAttribute("position") as BufferAttribute;
  const version = position.version;
  ground.surface.dispose(); ground.dispose(); ground.dispose();
  pose.x += 40; ground.surface.update(pose);
  assert.equal(position.version, version);
  assert.equal(geometries.length, 4);
  assert.equal(materials.length, 3);
  assert.equal(scene.children.length, 0);
  for (const count of counts.values()) assert.equal(count, 1);
});

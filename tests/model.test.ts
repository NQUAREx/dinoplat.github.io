import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("model asset contains eight run poses, death, six cacti and three voxel pickups without textures/decoders", async () => {
  const buffer = await readFile(
    new URL("../src/assets/voxel-models.glb", import.meta.url),
  );
  assert.equal(buffer.toString("ascii", 0, 4), "glTF");
  const json = JSON.parse(
    buffer.toString("utf8", 20, 20 + buffer.readUInt32LE(12)),
  );
  assert.equal(json.meshes.length, 18);
  assert.equal(json.images, undefined);
  assert.equal(json.textures, undefined);
  assert.equal(json.skins, undefined);
  assert.ok(buffer.length < 800000);
  const names = json.nodes.map((node: { name: string }) => node.name);
  for (let i = 0; i < 8; i++) assert.ok(names.includes(`run-${i}`));
  for (let i = 0; i < 6; i++) assert.ok(names.includes(`cactus-${i}`));
  for (const name of ["pickup-coin", "pickup-diamond", "pickup-heart"])
    assert.ok(names.includes(name));
  for (const mesh of json.meshes) {
    assert.equal(mesh.primitives.length, 1);
    const primitive = mesh.primitives[0];
    assert.ok(primitive.attributes.COLOR_0 !== undefined);
    assert.ok(json.accessors[primitive.indices].count / 3 <= 950);
  }
  for (const node of json.nodes.filter((node: { name?: string }) =>
    node.name?.startsWith("pickup-"),
  )) {
    const primitive = json.meshes[node.mesh].primitives[0];
    const bounds = json.accessors[primitive.attributes.POSITION];
    const radius = Math.hypot(
      Math.max(Math.abs(bounds.min[0]), Math.abs(bounds.max[0])),
      Math.max(Math.abs(bounds.min[2]), Math.abs(bounds.max[2])),
    );
    assert.ok(radius <= 0.46, `rotation envelope for ${node.name}`);
    assert.ok(Math.abs(bounds.min[1]) < 1e-6);
    assert.ok(bounds.max[1] >= 0.69 && bounds.max[1] <= 0.750001);
  }
});

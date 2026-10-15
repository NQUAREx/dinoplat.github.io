import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("reference asset contains eight run poses, death and six cactus variants with no textures/decoders", async () => {
  const buffer = await readFile(
    new URL("../src/assets/voxel-models.glb", import.meta.url),
  );
  assert.equal(buffer.toString("ascii", 0, 4), "glTF");
  const json = JSON.parse(
    buffer.toString("utf8", 20, 20 + buffer.readUInt32LE(12)),
  );
  assert.equal(json.meshes.length, 15);
  assert.equal(json.images, undefined);
  assert.equal(json.textures, undefined);
  assert.equal(json.skins, undefined);
  assert.ok(buffer.length < 650000);
  const names = json.nodes.map((node: { name: string }) => node.name);
  for (let i = 0; i < 8; i++) assert.ok(names.includes(`run-${i}`));
  for (let i = 0; i < 6; i++) assert.ok(names.includes(`cactus-${i}`));
  for (const mesh of json.meshes) {
    assert.equal(mesh.primitives.length, 1);
    const primitive = mesh.primitives[0];
    assert.ok(primitive.attributes.COLOR_0 !== undefined);
    assert.ok(json.accessors[primitive.indices].count / 3 <= 850);
  }
});

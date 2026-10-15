import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLAYER_RADIUS } from "../src/simulation.ts";

test("Blender GLB is one small indexed mesh with vertex colours and no textures/rig", () => {
  const bytes = readFileSync(
    new URL("../src/assets/dinosaur.glb", import.meta.url),
  );
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const gltf = JSON.parse(
    bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
  );
  assert.match(gltf.asset.generator, /Blender/);
  assert.equal(gltf.meshes.length, 1);
  assert.equal(gltf.meshes[0].primitives.length, 1);
  assert.equal(gltf.materials.length, 1);
  assert.equal((gltf.textures ?? []).length, 0);
  assert.equal((gltf.images ?? []).length, 0);
  assert.equal((gltf.skins ?? []).length, 0);
  assert.equal((gltf.animations ?? []).length, 0);
  assert.equal((gltf.extensionsRequired ?? []).length, 0);
  const primitive = gltf.meshes[0].primitives[0];
  assert.ok(primitive.attributes.COLOR_0 !== undefined);
  assert.ok(primitive.attributes.NORMAL !== undefined);
  assert.equal(primitive.attributes.TEXCOORD_0, undefined);
  const positions = gltf.accessors[primitive.attributes.POSITION];
  assert.ok(positions.max[0] - positions.min[0] <= PLAYER_RADIUS * 2);
  assert.equal(positions.min[1], 0); // Feet, not centre, define the jump origin.
  assert.ok(positions.max[1] > 1 && positions.max[1] < 1.4);
  assert.equal(gltf.accessors[primitive.indices].count / 3, 288);
  assert.ok(bytes.length < 32 * 1024);
  assert.ok(!gltf.buffers.some((buffer: { uri?: string }) => buffer.uri));
  const blend = readFileSync(new URL("../art/dinosaur.blend", import.meta.url));
  assert.equal(blend.subarray(0, 7).toString(), "BLENDER");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("model asset contains eight run poses, death, seven low-poly cacti and three voxel pickups without textures/decoders", async () => {
  const buffer = await readFile(
    new URL("../src/assets/voxel-models.glb", import.meta.url),
  );
  assert.equal(buffer.toString("ascii", 0, 4), "glTF");
  const json = JSON.parse(
    buffer.toString("utf8", 20, 20 + buffer.readUInt32LE(12)),
  );
  assert.equal(json.meshes.length, 19);
  assert.equal(json.images, undefined);
  assert.equal(json.textures, undefined);
  assert.equal(json.skins, undefined);
  assert.ok(buffer.length < 800000);
  const names = json.nodes.map((node: { name: string }) => node.name);
  for (let i = 0; i < 8; i++) assert.ok(names.includes(`run-${i}`));
  for (let i = 0; i < 7; i++) assert.ok(names.includes(`cactus-${i}`));
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
  // Slanted normals are essential: old voxel surfaces only had axis normals.
  const binaryStart = 20 + buffer.readUInt32LE(12) + 8;
  const colliders = JSON.parse(await readFile(new URL(
    "../src/assets/model-colliders.json", import.meta.url), "utf8"));
  for (let i = 0; i < 7; i++) {
    const node = json.nodes.find((n: { name: string }) => n.name === `cactus-${i}`);
    const primitive = json.meshes[node.mesh].primitives[0];
    const positions = json.accessors[primitive.attributes.POSITION];
    const colours = json.accessors[primitive.attributes.COLOR_0];
    assert.equal(colours.componentType, 5121, "packed byte colours, not float RGB");
    assert.equal(colours.normalized, true);
    const colourView = json.bufferViews[colours.bufferView], palette = new Set<string>();
    let creamSpines = 0, paleSpots = 0;
    for (let n = 0; n < colours.count; n++) {
      const p = binaryStart + (colourView.byteOffset || 0) +
        (colours.byteOffset || 0) + n * (colourView.byteStride || 3);
      const r = buffer[p], g = buffer[p+1], b = buffer[p+2];
      palette.add(`${r},${g},${b}`);
      if (r > 240 && g > 210 && b > 120) creamSpines++;
      if (r > 150 && r < 180 && g > 195 && b > 50 && b < 80) paleSpots++;
    }
    assert.ok(creamSpines > 0 && paleSpots > 0 && palette.size >= 5,
      "spines, areoles and varied rib colours on every cactus");
    assert.ok(Math.abs(positions.min[1]) < 1e-6, "feet at ground zero");
    assert.ok(Math.abs(positions.max[0] - colliders[i].halfX) < 1e-5);
    assert.ok(Math.abs(positions.max[2] - colliders[i].halfZ) < 1e-5);
    assert.ok(Math.abs(positions.max[1] - colliders[i].height) < 1e-5);
    assert.ok(json.accessors[primitive.indices].count / 3 <= 700);
    const normals = json.accessors[primitive.attributes.NORMAL];
    const view = json.bufferViews[normals.bufferView];
    let faceted = 0;
    for (let n = 0; n < normals.count; n++) {
      const offset = binaryStart + (view.byteOffset || 0) +
        (normals.byteOffset || 0) + n * (view.byteStride || 12);
      const length = Math.hypot(...[0, 4, 8].map(d => buffer.readFloatLE(offset + d)));
      assert.ok(Math.abs(length - 1) < 1e-5, "no zero/invalid pole normals");
      if ([0, 4, 8].filter(d => Math.abs(buffer.readFloatLE(offset + d)) > .05).length > 1)
        faceted++;
    }
    assert.ok(faceted > 20, "actual non-axis low-poly faces");
  }
});

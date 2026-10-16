import { test } from "node:test";
import assert from "node:assert/strict";
import { RenderQuality } from "../src/render-quality.ts";
import { CameraRig, ObjectVisibility } from "../src/camera.ts";
import { TerrainField } from "../src/terrain-field.ts";
import { WorldSpawner } from "../src/world.ts";
import { Simulation, STEP } from "../src/simulation.ts";
import { LightingRig } from "../src/lighting.ts";

test("stable Safari 30Hz does not progressively blur Retina rendering; severe overload recovers", () => {
  const q = new RenderQuality();
  for (let i = 0; i < 1800; i++) q.sample(1 / 30);
  assert.equal(q.quality, 1);
  assert.ok(q.ratio(390, 844, 3) > 1.9);
  for (let i = 0; i < 600; i++) q.sample(1 / 15);
  assert.ok(q.quality < 1);
  assert.ok(q.ratio(390, 844, 3) >= 1);
  for (let i = 0; i < 18000; i++) q.sample(1 / 60);
  assert.equal(q.quality, 1);
  for (const [w, h, dpr] of [
    [390, 844, 3],
    [320, 568, 2],
    [1024, 1366, 3],
  ])
    assert.ok(w * h * q.ratio(w, h, dpr) ** 2 <= RenderQuality.pixelBudget + 1);
});

test("camera follows unwrapped turns with delay, freezes on pause and catches up without seam snaps", () => {
  const rig = new CameraRig(true);
  rig.update(0, 0, 1 / 60, false, -Math.PI / 2);
  assert.ok(rig.heading < 0 && rig.heading > -Math.PI / 2);
  const h = rig.heading;
  rig.update(0, 0, 0, false, -Math.PI / 2);
  assert.equal(rig.heading, h);
  for (let i = 0; i < 240; i++) rig.update(0, 0, 1 / 60, false, -Math.PI * 2.5);
  assert.ok(Math.abs(rig.heading + Math.PI * 2.5) < 0.00001);
  assert.ok(rig.camera.position.x < -11.9);
});

test("full rotated frusta stay inside resident numeric chunks at positive and negative coordinates", () => {
  const rig = new CameraRig(true),
    visible = new ObjectVisibility(),
    world = new WorldSpawner();
  rig.resize(0.95);
  for (const origin of [-1000000, -16, 0, 1000000]) {
    world.update(origin, origin);
    for (let a = 0; a < 24; a++) {
      rig.update(0, 0, 10, false, (a * Math.PI) / 12);
      visible.update(rig.camera);
      for (let x = -140; x <= 140; x += 8)
        for (let z = -140; z <= 140; z += 8) {
          if (!visible.intersects(x, z, 1, 1, 3)) continue;
          assert.ok(
            Math.abs(Math.floor((origin + x) / 16) - Math.floor(origin / 16)) <=
              world.radius,
          );
          assert.ok(
            Math.abs(Math.floor((origin + z) / 16) - Math.floor(origin / 16)) <=
              world.radius,
          );
        }
    }
  }
});

test("swept collisions work facing west, east, south and north, including zero Z delta", () => {
  for (const h of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const g = new Simulation(123);
    g.phase = "running";
    g.x = g.previousX = 1000;
    g.z = g.previousZ = -1000;
    g.heading = g.previousHeading = h;
    g.world.update(g.x, g.z);
    g.world.active.fill(0);
    const w = g.world;
    w.active[0] = 1;
    w.kinds[0] = 0;
    w.x[0] = g.x - Math.sin(h) * 0.5;
    w.z[0] = g.z + Math.cos(h) * 0.5;
    w.halfX[0] = w.halfZ[0] = 0.4;
    w.height[0] = 3;
    w.baseY[0] = 0;
    g.step(STEP);
    assert.equal(g.health.lives, 2);
    assert.equal(g.hitStopRemaining, 1);
  }
});

test("2D biomes are deterministic, evenly distributed, reversible and neighbour-distinct", () => {
  const count = new Uint32Array(16);
  for (let x = -64; x < 64; x++)
    for (let z = -64; z < 64; z++) {
      const type = TerrainField.materialAt(x, z, 1979);
      count[type]++;
      assert.notEqual(type, TerrainField.materialAt(x + 1, z, 1979));
      assert.notEqual(type, TerrainField.materialAt(x, z + 1, 1979));
      assert.equal(
        type,
        TerrainField.at(
          x * 500 + 1 - TerrainField.originX,
          z * 500 + 1 - TerrainField.originZ,
          1979,
        ),
      );
    }
  assert.ok([...count].every((n) => n > 850 && n < 1200));
});

test("shadow focus follows the delayed view without rotating or duplicating the sun", () => {
  const rig = new LightingRig();
  const direction = rig.key.position.clone().sub(rig.key.target.position);
  rig.followView(Math.PI);
  assert.ok(
    rig.key.position
      .clone()
      .sub(rig.key.target.position)
      .distanceTo(direction) < 1e-10,
  );
  assert.equal(rig.key.target.position.z, 12);
  assert.equal(rig.key.shadow.mapSize.x, 256);
  rig.dispose();
});

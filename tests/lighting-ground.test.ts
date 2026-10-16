import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DataArrayTexture,
  LinearMipmapLinearFilter,
  Scene,
  BoxGeometry,
  MeshBasicMaterial,
  WebGLRenderTarget,
  Vector3,
} from "three";
import { DayCycle } from "../src/day-cycle.ts";
import { LightingRig } from "../src/lighting.ts";
import { Ground } from "../src/ground.ts";
import { Simulation } from "../src/simulation.ts";
import { RenderPose } from "../src/render-pose.ts";
import { TerrainLayout } from "../src/terrain.ts";
import { readFile } from "node:fs/promises";
import { InstancedObjectType } from "../src/object-renderer.ts";
import { ObjectKind } from "../src/world.ts";
import { CachedShadows } from "../src/shadows.ts";

test("day/night model is fixed-time deterministic, wraps and supports frozen time", () => {
  const day = new DayCycle();
  assert.equal(day.sample(0), 9);
  assert.equal(day.sample(180), 21);
  assert.equal(day.sample(360), 9);
  day.setTime(18);
  assert.equal(day.sample(999), 18);
  day.setTime(-1);
  assert.equal(day.sample(0), 23);
  day.setTime(6, true);
  day.cycleSeconds = 240;
  assert.equal(day.sample(60), 12);
  assert.throws(() => day.setTime(NaN));
  assert.throws(() => (day.cycleSeconds = 0));
});
test("moving sun reverses shadows and day/night changes fog and visibility without new lights", () => {
  const light = new LightingRig(),
    key = light.key,
    ambient = light.ambient;
  light.setTimeOfDay(9);
  light.update(0);
  const x = light.shadowSlope.x,
    morning = light.fogColour.getHex();
  assert.ok(light.shadowStrength > 0 && x > 0);
  light.setTimeOfDay(15);
  light.update(0);
  assert.ok(light.shadowSlope.x < 0);
  light.setTimeOfDay(0);
  light.update(0);
  assert.ok(light.shadowStrength > 0);
  assert.equal(light.source, "moon");
  assert.equal(light.moon.visible, true);
  assert.notEqual(light.fogColour.getHex(), morning);
  assert.ok(light.ambient.intensity > 0.3);
  light.setTimeOfDay(18);
  light.update(0);
  assert.notEqual(light.fogColour.getHex(), morning);
  light.setSunPosition(-8, 12, 4);
  light.update(0);
  assert.equal(light.key.position.x, -8);
  assert.ok(light.shadowSlope.x < 0);
  assert.ok(Math.hypot(light.shadowSlope.x, light.shadowSlope.y) <= 3.001);
  light.shadowsEnabled = false;
  light.update(0);
  assert.equal(light.shadowStrength, 0);
  assert.equal(light.key, key);
  assert.equal(light.ambient, ambient);
  assert.throws(() => light.setSunPosition(NaN, 0, 0));
  light.dispose();
});
test("one interpolated render origin is used at tile and biome boundaries, including negative X", () => {
  const game = new Simulation(1979),
    pose = new RenderPose();
  const ground = new Ground(new DataArrayTexture(new Uint8Array(4), 1, 1, 1));
  const uniforms = ground.uniforms;
  assert.equal(TerrainLayout.worldTileSize, 2.5);
  game.x = -4.9;
  game.previousX = -5.1;
  game.distance = 500.1;
  game.previousDistance = 499.9;
  game.terrain.advance(game.distance);
  pose.update(game, 0.25);
  ground.update(game, pose);
  assert.ok(Math.abs(pose.x + 5.05) < 1e-9);
  assert.ok(Math.abs(pose.distance - 499.95) < 1e-9);
  assert.ok(
    Math.abs(
      uniforms.terrainProgress.value -
        (ground.surface.anchorDistance - pose.distance) +
        0.05,
    ) < 1e-9,
  );
  for (const base of [-1000000, 0, 1000000]) {
    const pointX = base + 13.234,
      pointD = Math.abs(base) + 513.456;
    let previous: number[] | undefined;
    for (let i = 0; i <= 100; i++) {
      pose.x = base - 0.1 + i * 0.002;
      pose.distance = Math.abs(base) + 499.9 + i * 0.002;
      ground.update(game, pose);
      const u =
        (pointX - ground.surface.anchorX + uniforms.terrainOrigin.value.x) /
        2.5;
      const v =
        (pointD -
          ground.surface.anchorDistance +
          uniforms.terrainOrigin.value.y) /
        2.5;
      const sample = [
        (((Math.floor(u) + uniforms.terrainTiles.value.x) % 65536) + 65536) %
          65536,
        (((Math.floor(v) + uniforms.terrainTiles.value.y) % 65536) + 65536) %
          65536,
        u - Math.floor(u),
        v - Math.floor(v),
      ];
      if (previous)
        for (let c = 0; c < 4; c++)
          assert.ok(Math.abs(sample[c] - previous[c]) < 1e-8);
      previous = sample;
    }
  }
  assert.equal(ground.material.isMeshLambertMaterial, true);
  assert.equal(ground.mesh.receiveShadow, true);
  assert.equal(ground.surface.geometry.index!.count / 3, 1152);
  ground.surface.setHeightProvider(
    (x, z) => Math.sin(x / 20) * 0.1 + Math.sin(z / 20) * 0.1,
  );
  ground.update(game, pose);
  assert.ok(ground.surface.geometry.attributes.position.getY(0) !== -0.015);
  assert.ok(ground.surface.geometry.attributes.normal.getY(0) < 1);
  ground.dispose();
});

test("cached shadow map is rebased continuously, throttled even at minimum quality and invalidated on source/reset", () => {
  const game = new Simulation(),
    pose = new RenderPose(),
    light = new LightingRig(),
    cache = new CachedShadows();
  light.key.shadow.map = new WebGLRenderTarget(256, 256);
  light.update(0);
  pose.update(game, 1);
  assert.equal(cache.prepare(game, pose, light, 0.5), true);
  light.key.updateMatrixWorld();
  light.key.target.updateMatrixWorld();
  light.key.shadow.updateMatrices(light.key);
  cache.complete(light);
  const point = new Vector3(3, 0.02, -8).applyMatrix4(light.key.shadow.matrix);
  game.time = 0.02;
  pose.x = 0.1;
  pose.distance = 0.24;
  light.update(game.time);
  assert.equal(cache.prepare(game, pose, light, 0.5), false);
  const moved = new Vector3(3 - pose.x, 0.02, pose.distance - 8).applyMatrix4(
    light.key.shadow.matrix,
  );
  assert.ok(point.distanceTo(moved) < 1e-10);
  for (let i = 3; i <= 100; i++) {
    game.time = i / 100;
    pose.distance = game.time * 12;
    light.update(game.time);
    if (cache.prepare(game, pose, light, 0.5)) {
      light.key.updateMatrixWorld();
      light.key.target.updateMatrixWorld();
      light.key.shadow.updateMatrices(light.key);
      cache.complete(light);
    }
  }
  assert.ok(cache.updates <= 5);
  light.setTimeOfDay(0);
  light.update(game.time);
  assert.equal(cache.prepare(game, pose, light, 0.5), true);
  cache.invalidate();
  assert.equal(cache.prepare(game, pose, light, 0.5), true);
  light.dispose();
});
test("instance uploads reuse one range and send only the live prefix, empty banks are invisible", () => {
  const geometry = new BoxGeometry(),
    material = new MeshBasicMaterial();
  const instances = new InstancedObjectType(
    ObjectKind.Cactus,
    [geometry],
    material,
    new Scene(),
  );
  const mesh = instances.meshes[0];
  instances.begin();
  instances.place(0, 1, 2, 0);
  instances.finish();
  const range = mesh.instanceMatrix.updateRanges[0];
  assert.equal(range.count, 16);
  assert.equal(mesh.visible, true);
  mesh.instanceMatrix.clearUpdateRanges();
  instances.begin();
  instances.place(0, 2, 3, 0);
  instances.place(0, 3, 4, 0);
  instances.finish();
  assert.equal(mesh.instanceMatrix.updateRanges[0], range);
  assert.equal(range.count, 32);
  const version = mesh.instanceMatrix.version;
  instances.begin();
  instances.finish();
  assert.equal(mesh.visible, false);
  assert.equal(mesh.instanceMatrix.version, version);
  instances.dispose();
  geometry.dispose();
  material.dispose();
});
test("pixel magnification is retained while mip-level switches interpolate", async () => {
  const source = await readFile(
    new URL("../src/terrain-texture.ts", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes("texture.magFilter = NearestFilter"));
  assert.ok(source.includes("texture.minFilter = LinearMipmapLinearFilter"));
  assert.ok(LinearMipmapLinearFilter > 0);
});

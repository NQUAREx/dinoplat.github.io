import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { BoxGeometry, Scene, Matrix4 } from "three";
import { COSMETICS, COSMETIC_CATEGORIES } from "../src/cosmetics.ts";
import { PickupEffects } from "../src/pickup-effects.ts";
import { Simulation } from "../src/simulation.ts";
import { GameEvent } from "../src/events.ts";
import { Rules } from "../src/config.ts";
import { Tuning } from "../src/tuning.ts";
import { DeveloperDevice } from "../src/developer.ts";

test("110 cosmetic entries have unique IDs, real thumbnails, five complete categories", async () => {
  assert.equal(COSMETICS.length, 110);
  assert.equal(new Set(COSMETICS.map((i) => i.id)).size, 110);
  const expected = { dino: 24, hat: 23, boots: 23, watch: 20, gloves: 20 };
  for (const category of COSMETIC_CATEGORIES)
    assert.equal(
      COSMETICS.filter((i) => i.category === category).length,
      expected[category],
    );
  await Promise.all(
    COSMETICS.map((i) =>
      access(new URL(`../public/shop/${i.id}.webp`, import.meta.url)),
    ),
  );
  const bytes = await readFile(
    new URL("../src/assets/game-models.glb", import.meta.url),
  );
  const gltf = JSON.parse(
    bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)),
  );
  const node = gltf.nodes.find((n: { name: string }) => n.name === "dinosaur");
  const count =
    gltf.accessors[gltf.meshes[node.mesh].primitives[0].indices].count / 3;
  assert.equal(count, 788 * 1.5);
  assert.equal(Rules.lodNear, 22 * 1.2);
  assert.equal(Rules.lodFar, 30 * 1.2);
});

test("pickup rise/fade uses 32 bounded visual slots and keeps large world coordinates stable", () => {
  const game = new Simulation(1),
    geometry = new BoxGeometry(),
    scene = new Scene();
  const effects = new PickupEffects(
    game,
    { coin: geometry, diamond: geometry, heart: geometry },
    scene,
  );
  game.world.kinds[0] = 1;
  game.world.x[0] = 1000000.25;
  game.world.z[0] = -1000000.5;
  game.world.baseY[0] = 0.5;
  game.events.emit(GameEvent.CollectedVisual, 0);
  game.world.consume(0);
  effects.update(0, 1000000, -1000000, 0);
  assert.equal(effects.count, 1);
  const matrix = new Matrix4();
  effects.meshes[0].getMatrixAt(0, matrix);
  assert.equal(matrix.elements[12], 0.25);
  assert.equal(matrix.elements[14], 0.5);
  assert.equal(matrix.elements[13], 0.5);
  effects.update(Tuning.effects.pickupFade * 0.5, 1000000, -1000000, 0);
  effects.meshes[0].getMatrixAt(0, matrix);
  assert.ok(matrix.elements[13] > 0.5);
  const alpha = effects.meshes[0].geometry.getAttribute("instanceFade").getX(0);
  assert.ok(alpha > 0 && alpha < 1);
  effects.update(Tuning.effects.pickupFade, 1000000, -1000000, 0);
  assert.equal(effects.count, 0);
  const meshes = [...effects.meshes];
  for (let i = 0; i < 100; i++) game.events.emit(GameEvent.CollectedVisual, 0);
  effects.update(0, 1000000, -1000000, 0);
  assert.equal(effects.count, 32);
  assert.deepEqual(effects.meshes, meshes);
  game.events.emit(GameEvent.Start);
  effects.update(0, 0, 0, 0);
  assert.equal(effects.count, 0);
  effects.dispose();
  geometry.dispose();
  assert.equal(scene.children.length, 0);
});

test("developer identity restores only device flag and rejects wrong author code", async () => {
  const doc = { cookie: "dinorun-developer=1; another=1" };
  assert.equal(new DeveloperDevice("/DinoPlat3d/", doc).enabled, true);
  const locked = new DeveloperDevice("/DinoPlat3d/", { cookie: "" });
  assert.equal(await locked.unlock("wrong-code"), false);
  assert.equal(locked.enabled, false);
});

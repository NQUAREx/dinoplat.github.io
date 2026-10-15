import { test } from "node:test";
import assert from "node:assert/strict";
import { Terrain, TERRAIN_WEIGHTS, TERRAIN_LENGTH } from "../src/terrain.ts";

test("terrain changes at exact 500m boundaries, does not repeat and resets deterministically", () => {
  const terrain = new Terrain(1979),
    replay = new Terrain(1979);
  assert.equal(TERRAIN_LENGTH, 500);
  assert.equal(TERRAIN_WEIGHTS.length, 16);
  assert.ok(TERRAIN_WEIGHTS.every((weight) => weight === 1));
  const first = terrain.current;
  const next = terrain.next;
  terrain.advance(499.999);
  assert.equal(terrain.current, first);
  terrain.advance(500);
  assert.equal(terrain.previous, first);
  assert.equal(terrain.current, next);
  assert.notEqual(terrain.current, first);
  terrain.reset(1979);
  assert.deepEqual(terrain, replay);
  for (let i = 0; i < 1000; i++) {
    terrain.advance(i * 500);
    replay.advance(i * 500);
    assert.deepEqual(terrain, replay);
    assert.notEqual(terrain.current, terrain.next);
  }
});

test("all 16 equally weighted terrains have comparable long-run frequency", () => {
  const terrain = new Terrain(12345);
  const counts = new Uint32Array(16);
  for (let i = 0; i < 16000; i++) {
    terrain.advance(i * 500);
    counts[terrain.current]++;
  }
  for (const count of counts)
    assert.ok(count > 850 && count < 1150, String(count));
});

import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, STEP } from "../src/simulation.ts";
import { Rules } from "../src/config.ts";
import { GameEvent } from "../src/events.ts";
import { LandscapeField, Surface } from "../src/landscape.ts";
import { ObjectKind, ObjectRegistry } from "../src/world.ts";

const directions = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
const origins = [[0, 0], [-173, -291], [1_000_000, -1_000_000], [-1_000_000, 1_000_000]];

function isolated(seed = 1) {
  const registry = ObjectRegistry.defaults();
  for (const kind of Object.values(ObjectKind))
    if (typeof kind === "number") registry.setWeight(kind, 0);
  const game = new Simulation(seed, registry);
  game.landscape.enabled = true;
  game.world.active.fill(0);
  game.phase = "running";
  return game;
}

function place(game: Simulation, x: number, z: number, heading: number) {
  game.x = game.previousX = x;
  game.z = game.previousZ = z;
  game.heading = game.previousHeading = heading;
  game.groundY = game.previousGroundY = game.landscape.heightAt(x, z);
  game.world.update(x, z);
  game.world.active.fill(0);
}

function fixture(ox: number, oz: number, heading: number, ledge = true) {
  const game = isolated();
  const dx = -Math.sin(heading), dz = Math.cos(heading);
  const along = (x: number, z: number) => (x - ox) * dx + (z - oz) * dz;
  // A continuous 1.5m rise over 2m, with a flat approach and landing plateau.
  const ramp = (x: number, z: number) => Math.max(0, Math.min(1.5, (along(x, z) - 3) * 0.75));
  game.landscape.heightAt = (x, z) => 7 + ramp(x, z);
  game.landscape.ledgeHeightAt = ledge ? ramp : () => 0;
  game.landscape.surfaceAt = () => Surface.Land;
  place(game, ox, oz, heading);
  return { game, along };
}

function pose(game: Simulation) {
  return [game.x, game.z, game.y, game.groundY, game.distance];
}

for (const [ox, oz] of origins) for (const heading of directions) {
  const label = `origin ${ox},${oz}, heading ${heading}`;
  test(`standing ledge contact costs exactly one life and freezes for one second: ${label}`, () => {
    const { game, along } = fixture(ox, oz, heading);
    let hits = 0, footsteps = 0;
    game.events.on(GameEvent.Hit, () => hits++);
    game.events.on(GameEvent.Step, () => footsteps++);
    let previous = pose(game), previousSteps = 0;
    for (let i = 0; i < 60 && !game.hitStopRemaining; i++) {
      previous = pose(game); previousSteps = footsteps;
      game.step(STEP);
    }
    assert.equal(hits, 1);
    assert.equal(game.health.lives, 2);
    assert.deepEqual(pose(game), previous, "contact holds the last supported pose");
    assert.equal(footsteps, previousSteps, "no footstep on impact");
    assert.equal(game.hitStopRemaining, Rules.hitStopSeconds);
    assert.equal(game.health.immunity, Rules.immunitySeconds);
    assert.equal(game.speed, Rules.startSpeed);
    const frozen = [...pose(game), game.time, game.health.immunity, game.pickupMotion.bob];
    const feedback = game.feedbackTime;
    for (let i = 0; i < 120; i++) {
      game.move(1); game.jump(); game.down(); game.step(STEP);
      assert.deepEqual([...pose(game), game.time, game.health.immunity, game.pickupMotion.bob], frozen);
      assert.equal(hits, 1);
      if (i < 119) assert.ok(game.hitStopRemaining > 0);
    }
    assert.equal(game.hitStopRemaining, 0);
    assert.ok(game.feedbackTime >= feedback + 1 - 1e-9);
    game.step(STEP);
    assert.ok(game.distance > previous[4]);
    assert.ok(game.health.immunity < Rules.immunitySeconds);
    // Only the immunity earned by the actual hit permits crossing the face.
    for (let i = 0; i < 100; i++) game.step(STEP);
    assert.ok(along(game.x, game.z) > 5);
    assert.equal(hits, 1);
    assert.equal(game.health.lives, 2);
  });

  test(`a timed jump clears and lands atop the ledge: ${label}`, () => {
    const { game, along } = fixture(ox, oz, heading);
    let lands = 0, hits = 0;
    game.events.on(GameEvent.Land, () => lands++);
    game.events.on(GameEvent.Hit, () => hits++);
    game.jump();
    let airborneOverTop = false;
    for (let i = 0; i < 140; i++) {
      game.step(STEP);
      if (along(game.x, game.z) > 5 && game.y > 0) airborneOverTop = true;
      assert.equal(game.health.immunity, 0);
      assert.equal(game.health.lives, 3);
    }
    assert.ok(airborneOverTop);
    assert.equal(lands, 1);
    assert.equal(hits, 0);
    assert.equal(game.y, 0);
    assert.equal(game.groundY, 8.5);
    assert.equal(game.velocityY, 0);
  });

  test(`ordinary hill of identical grade remains walkable: ${label}`, () => {
    const { game, along } = fixture(ox, oz, heading, false);
    for (let i = 0; i < 90; i++) {
      game.step(STEP);
      assert.equal(game.health.lives, 3);
      assert.equal(game.health.immunity, 0);
      assert.equal(game.hitStopRemaining, 0);
      assert.equal(game.y, 0);
      assert.equal(game.groundY, game.landscape.heightAt(game.x, game.z));
    }
    assert.ok(along(game.x, game.z) > 5);
    assert.equal(game.groundY, 8.5);
  });
}

test("natural interpolated ledge blocks walking but permits a timed jump", t => {
  const field = new LandscapeField();
  let sample: { seed: number; x: number; z: number; heading: number } | undefined;
  // Bounded discovery, independent of any private ledge generator or route pilot.
  search: for (let seed = 1; seed <= 8; seed++) {
    field.reset(seed);
    for (let z = -160; z <= 160; z += 2) for (let x = -160; x <= 160; x += 2) {
      const h = field.ledgeHeightAt(x, z);
      if (h <= 0.12) continue;
      for (const heading of directions) {
        const dx = -Math.sin(heading), dz = Math.cos(heading), travel = Rules.startSpeed * STEP;
        if (field.ledgeHeightAt(x + dx * travel, z + dz * travel) - h <= travel * 0.28) continue;
        const startX = x - dx * 3, startZ = z - dz * 3;
        const base = field.heightAt(startX, startZ);
        let valid = true;
        // Require supported approach/landing and enough ballistic clearance.
        for (let i = 0; i <= 120; i++) {
          const time = i * STEP, px = startX + dx * Rules.startSpeed * time, pz = startZ + dz * Rules.startSpeed * time;
          const ground = field.heightAt(px, pz), surface = field.surfaceAt(px, pz);
          if (surface !== Surface.Land || Math.abs(ground - base) > 2.2 ||
              (i >= 20 && i <= 80 && ground + 0.1 > base + Rules.jumpSpeed * time - Rules.gravity * time * time / 2)) {
            valid = false; break;
          }
        }
        if (!valid) continue;
        sample = { seed, x, z, heading }; break search;
      }
    }
  }
  assert.ok(sample, "find a supported, jumpable natural rising ledge in the bounded seed range");
  const { seed, x, z, heading } = sample;
  const dx = -Math.sin(heading), dz = Math.cos(heading);
  const walk = isolated(seed);
  place(walk, x, z, heading);
  const before = pose(walk);
  walk.step(STEP);
  assert.equal(walk.health.lives, 2);
  assert.equal(walk.hitStopRemaining, Rules.hitStopSeconds);
  assert.deepEqual(pose(walk), before);
  const jump = isolated(seed);
  place(jump, x - dx * 3, z - dz * 3, heading);
  let lands = 0;
  jump.events.on(GameEvent.Land, () => lands++);
  jump.jump();
  for (let i = 0; i < 130; i++) {
    jump.step(STEP);
    assert.equal(jump.health.lives, 3);
    assert.equal(jump.health.immunity, 0);
    assert.equal(jump.hitStopRemaining, 0);
    assert.equal(jump.falling, false);
  }
  assert.ok((jump.x - x) * dx + (jump.z - z) * dz > 5);
  assert.equal(lands, 1);
  assert.equal(jump.y, 0);
  t.diagnostic(`natural ledge seed=${seed}, x=${x}, z=${z}, heading=${heading}`);
});

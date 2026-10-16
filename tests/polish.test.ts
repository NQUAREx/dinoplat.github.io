import { test } from "node:test";
import assert from "node:assert/strict";
import { DeathMotion } from "../src/death-motion.ts";
import { Simulation, STEP } from "../src/simulation.ts";
import { Rules } from "../src/config.ts";
import { GameSettings } from "../src/settings.ts";
import { COSMETICS } from "../src/cosmetics.ts";

test("root death falls sideways, bounces twice, is continuous and stops world travel", () => {
  const motion = new DeathMotion();
  motion.sample(0, 0);
  assert.equal(motion.y, 0);
  assert.ok(Math.abs(motion.roll) < 1e-10);
  motion.sample(0.5, 0);
  assert.equal(motion.roll, -Math.PI / 2);
  const contact = motion.y;
  motion.sample(0.7, 0);
  assert.ok(motion.y > contact + 0.2);
  motion.sample(1.075, 0);
  assert.ok(motion.y > contact + 0.06);
  for (const boundary of [0.5, 0.9, Rules.deathSeconds]) {
    motion.sample(boundary - 1e-7, 0.8);
    const y = motion.y,
      x = motion.x;
    motion.sample(boundary + 1e-7, 0.8);
    assert.ok(Math.abs(motion.y - y) < 1e-5 && Math.abs(motion.x - x) < 1e-5);
  }
  const game = new Simulation(1);
  game.phase = "dying";
  const frozen = [game.x, game.z, game.distance, game.time];
  for (let i = 0; i < 60; i++) game.step(STEP);
  assert.equal(game.phase, "dying");
  assert.deepEqual([game.x, game.z, game.distance, game.time], frozen);
  game.phase = "paused";
  const age = game.deathTime;
  game.step(2);
  assert.equal(game.deathTime, age);
  game.phase = "dying";
  for (let i = 0; i < 90; i++) game.step(STEP);
  assert.equal(game.phase, "over");
  game.reset(2);
  assert.equal(game.deathTime, 0);
});

test("catalogue triples existing prices and adds gold for exactly 1000 diamonds", () => {
  const prices = {
    "dino-white": 750,
    "dino-pink": 60,
    "hat-cap": 240,
    "hat-safari": 360,
    "hat-crown": 75,
    "boots-red": 270,
    "boots-blue": 360,
    "boots-gold": 60,
    "dino-gold": 1000,
  };
  for (const [id, price] of Object.entries(prices))
    assert.equal(COSMETICS.find((item) => item.id === id)!.price, price);
  assert.equal(new GameSettings().music, true);
});

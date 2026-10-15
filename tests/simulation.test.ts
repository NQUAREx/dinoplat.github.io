import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Simulation,
  STEP,
  ROW_COUNT,
  ROW_GAP,
  MAX_SPEED,
  SIDE_SPEED,
  LANE_WIDTH,
  CUBE_SIZE,
  PLAYER_RADIUS,
  laneX,
  LANES,
  MAX_PLAYER_X,
  MOVE_INCREMENT,
  MAX_HEADING,
} from "../src/simulation.ts";

function emptyGame() {
  const game = new Simulation(123);
  game.masks.fill(0);
  game.phase = "running";
  return game;
}

test("free X movement: one input shifts target by one unit, never by a column", () => {
  const game = emptyGame();
  assert.equal(LANES, 5);
  assert.equal(game.x, 0);
  assert.equal(laneX(0), -laneX(LANES - 1));
  game.move(1);
  assert.equal(game.targetX, MOVE_INCREMENT);
  assert.equal(game.x, 0);
  game.step(STEP);
  assert.ok(game.x > 0 && game.x < MOVE_INCREMENT);
  for (let i = 0; i < 30; i++) game.step(STEP);
  assert.equal(game.x, 1);
  assert.ok(
    !Array.from({ length: LANES }, (_, i) => laneX(i)).includes(game.x),
  );
  game.move(1);
  game.move(1);
  assert.equal(game.targetX, 3);
  for (let i = 0; i < 60; i++) game.step(STEP);
  assert.equal(game.x, 3);
  game.move(-1);
  for (let i = 0; i < 30; i++) game.step(STEP);
  assert.equal(game.x, 2);
});

test("free movement is clamped by road bounds, including repeated input at the edge", () => {
  const game = emptyGame();
  for (let i = 0; i < 240; i++) {
    game.move(1);
    game.step(STEP);
  }
  assert.equal(game.targetX, MAX_PLAYER_X);
  assert.equal(game.x, MAX_PLAYER_X);
  for (let i = 0; i < 240; i++) {
    game.move(-1);
    game.step(STEP);
  }
  assert.equal(game.targetX, -MAX_PLAYER_X);
  assert.equal(game.x, -MAX_PLAYER_X);
});

test("dinosaur turns to +/-45 degrees during lateral motion and forward after stopping", () => {
  for (const direction of [-1, 1]) {
    const game = emptyGame();
    game.move(direction);
    for (let i = 0; i < 10; i++) game.step(STEP);
    assert.equal(game.heading, -direction * MAX_HEADING);
    assert.equal(game.movingX, direction);
    for (let i = 0; i < 40; i++) game.step(STEP);
    assert.equal(game.heading, 0);
    assert.equal(game.movingX, 0);
    assert.equal(game.x, direction);
  }
});

test("collision uses actual continuous X, not the future target", () => {
  const game = emptyGame();
  game.rowZ[0] = 0.9;
  game.masks[0] = 1 << 2;
  game.move(1);
  game.step(STEP);
  assert.equal(game.phase, "over");
});

test("collisions work in every obstacle column, including the fifth", () => {
  for (let lane = 0; lane < LANES; lane++) {
    const game = emptyGame();
    game.x = game.targetX = laneX(lane);
    game.rowZ[0] = 0.9;
    game.masks[0] = 1 << lane;
    game.step(STEP);
    assert.equal(game.phase, "over", `lane ${lane}`);
  }
});

test("free position between two adjacent cubes passes through the real gap", () => {
  const game = emptyGame();
  game.x = game.targetX = LANE_WIDTH / 2;
  game.rowZ[0] = 1.5;
  game.masks[0] = (1 << 2) | (1 << 3);
  for (let i = 0; i < 60; i++) game.step(STEP);
  assert.equal(game.phase, "running");
});

test("a non-column-aligned body still collides when it actually overlaps a cube", () => {
  const game = emptyGame();
  game.x = game.targetX = 0.8;
  game.rowZ[0] = 0.9;
  game.masks[0] = 1 << 2;
  game.step(STEP);
  assert.equal(game.phase, "over");
});

test("generator uses all five lanes and never exceeds its five-bit mask", () => {
  let blocked = 0,
    safe = 0,
    densest = 0;
  for (let seed = 1; seed <= 1000; seed++) {
    const game = new Simulation(seed);
    for (let i = 0; i < ROW_COUNT; i++) {
      const mask = game.masks[i];
      assert.ok(mask > 0 && mask < (1 << LANES) - 1);
      blocked |= mask;
      safe |= 1 << game.safeLanes[i];
      let count = 0;
      for (let lane = 0; lane < LANES; lane++) if (mask & (1 << lane)) count++;
      densest = Math.max(densest, count);
    }
  }
  assert.equal(blocked, (1 << LANES) - 1);
  assert.equal(safe, (1 << LANES) - 1);
  assert.equal(densest, LANES - 1);
});

test("swept collision catches a cube crossed within one step", () => {
  const game = emptyGame();
  game.rowZ[0] = 2;
  game.masks[0] = 1 << 2;
  game.step(0.25);
  assert.equal(game.phase, "over");
});

test("a well-timed jump clears a cube at both minimum and maximum speeds", () => {
  for (const distance of [0, 2000]) {
    const game = emptyGame();
    game.distance = distance;
    game.rowZ[0] = distance ? 8 : 4;
    game.masks[0] = 1 << 2;
    game.jump();
    game.step(STEP);
    const velocity = game.velocityY;
    game.jump();
    assert.equal(game.velocityY, velocity);
    for (let i = 0; i < 120; i++) game.step(STEP);
    assert.equal(game.phase, "running");
    assert.equal(game.y, 0);
  }
});

test("pause freezes simulation and restart resets all state without replacing pools", () => {
  const game = emptyGame(),
    rows = game.rowZ,
    masks = game.masks;
  game.jump();
  game.step(STEP);
  game.phase = "paused";
  const distance = game.distance,
    y = game.y;
  game.step(1);
  assert.equal(game.distance, distance);
  assert.equal(game.y, y);
  game.reset(42);
  assert.equal(game.distance, 0);
  assert.equal(game.y, 0);
  assert.equal(game.velocityY, 0);
  assert.equal(game.x, 0);
  assert.equal(game.targetX, 0);
  assert.equal(game.heading, 0);
  assert.equal(game.movingX, 0);
  assert.equal(game.phase, "ready");
  assert.equal(game.rowZ, rows);
  assert.equal(game.masks, masks);
});

test("route timing has room for 300ms reaction plus one lane change at max speed", () => {
  const clearanceTime =
    (ROW_GAP - 2 * (CUBE_SIZE / 2 + PLAYER_RADIUS)) / MAX_SPEED;
  assert.ok(clearanceTime > 0.3 + LANE_WIDTH / SIDE_SPEED);
});

test("100 seeds: follow guaranteed route for 5 minutes at maximum speed, no jumps", () => {
  for (let seed = 1; seed <= 100; seed++) {
    const game = new Simulation(seed);
    game.phase = "running";
    game.distance = 2000;
    const rows = game.rowZ;
    let reaction = 0,
      target = -1;
    for (let step = 0; step < 300 / STEP; step++) {
      let next = -1,
        nearest = Infinity;
      for (let i = 0; i < ROW_COUNT; i++) {
        assert.ok(game.masks[i] > 0 && game.masks[i] < (1 << LANES) - 1);
        assert.ok(game.safeLanes[i] < LANES);
        assert.equal(game.masks[i] & (1 << game.safeLanes[i]), 0);
        if (game.rowZ[i] > -0.9 && game.rowZ[i] < nearest) {
          nearest = game.rowZ[i];
          next = i;
        }
      }
      if (next !== target) {
        target = next;
        reaction = 0.3;
      }
      reaction -= STEP;
      if (reaction <= 0)
        game.move(
          Math.sign(Math.round(laneX(game.safeLanes[next])) - game.targetX),
        );
      game.step(STEP);
      assert.equal(game.phase, "running", `seed=${seed}, step=${step}`);
    }
    assert.equal(game.rowZ, rows);
    assert.equal(rows.length, ROW_COUNT);
    assert.ok(Math.max(...rows) < ROW_COUNT * ROW_GAP);
  }
});

test("fixed-step simulation yields the same outcome at 15, 30, 60 and 120Hz", () => {
  const outcomes: number[] = [];
  for (const hz of [15, 30, 60, 120]) {
    const game = emptyGame();
    game.move(1);
    game.move(1);
    game.move(1);
    let accumulator = 0;
    for (let frame = 0; frame < hz * 2; frame++) {
      accumulator += 1 / hz;
      while (accumulator + 1e-12 >= STEP) {
        game.step(STEP);
        accumulator -= STEP;
      }
    }
    outcomes.push(game.distance);
    assert.equal(game.x, 3);
    assert.equal(game.heading, 0);
  }
  assert.ok(outcomes.every((value) => Math.abs(value - outcomes[0]) < 1e-9));
});

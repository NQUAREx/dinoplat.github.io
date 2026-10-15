import { test } from "node:test";
import assert from "node:assert/strict";
import { Simulation, STEP } from "../src/simulation.ts";
import { Rules } from "../src/config.ts";
import { ObjectRegistry, ObjectKind, WorldSpawner } from "../src/world.ts";
import { GameEvent, GameEvents } from "../src/events.ts";
import { BonusSystem, Currency, Wallet } from "../src/progression.ts";

function emptyGame(distance = 0, x = 0) {
  const registry = new ObjectRegistry();
  registry.register({
    kind: ObjectKind.Cactus,
    weight: 0,
    blocking: true,
    colliders: [{ halfX: 0.45, halfZ: 0.4, height: 1.5 }],
  });
  const game = new Simulation(123, registry);
  game.phase = "running";
  game.distance = game.previousDistance = distance;
  game.x = game.previousX = x;
  game.world.update(x, distance);
  return game;
}
function obstacle(game: Simulation, x: number, forward: number, height = 1.5) {
  const w = game.world;
  w.active[0] = 1;
  w.kinds[0] = ObjectKind.Cactus;
  w.x[0] = x;
  w.z[0] = game.distance + forward;
  w.halfX[0] = 0.45;
  w.halfZ[0] = 0.4;
  w.height[0] = height;
}

test("unbounded X: held movement crosses thousands of old road widths, release stops exactly", () => {
  const game = emptyGame();
  game.move(1);
  for (let i = 0; i < 20000; i++) game.step(STEP);
  assert.ok(game.x > 1000);
  const released = game.x;
  game.move(0);
  for (let i = 0; i < 20; i++) game.step(STEP);
  assert.equal(game.x, released);
  game.move(-1);
  for (let i = 0; i < 40000; i++) game.step(STEP);
  assert.ok(game.x < -1000);
});
test("fractional coordinates and +/-45 degree headings have no quantization", () => {
  const game = emptyGame();
  game.move(1);
  for (let i = 0; i < 10; i++) game.step(STEP);
  assert.ok(Math.abs(game.x - 2 / 3) < 1e-10);
  assert.equal(game.heading, -Math.PI / 4);
  game.move(0);
  for (let i = 0; i < 20; i++) game.step(STEP);
  assert.equal(game.heading, 0);
  game.move(-1);
  for (let i = 0; i < 10; i++) game.step(STEP);
  assert.equal(game.heading, Math.PI / 4);
});
test("2D cell pool is bounded, deterministic after reentry, and generates both axes", () => {
  const pool = new WorldSpawner();
  pool.reset(1979);
  pool.update(0, 100);
  const arrays = [pool.x, pool.z, pool.active];
  const snapshot = Array.from(pool.active, (active, i) => [
    active,
    pool.x[i],
    pool.z[i],
    pool.variants[i],
    pool.angles[i],
  ]);
  pool.update(1000, 100);
  pool.update(0, 100);
  for (let i = 0; i < pool.active.length; i++)
    if (snapshot[i][0])
      assert.deepEqual(
        [
          pool.active[i],
          pool.x[i],
          pool.z[i],
          pool.variants[i],
          pool.angles[i],
        ],
        snapshot[i],
      );
  let left = false,
    right = false,
    variants = 0;
  for (let i = 0; i < 2000; i++) {
    const x = (i % 2 ? -1 : 1) * i * 31.37;
    pool.update(x, i * 20);
    for (let slot = 0; slot < pool.active.length; slot++)
      if (pool.active[slot]) {
        assert.ok(
          Math.abs(pool.x[slot] - x) < (pool.radius + 1) * Rules.columnWidth,
        );
        left ||= pool.x[slot] < x;
        right ||= pool.x[slot] > x;
        variants |= 1 << pool.variants[slot];
        assert.equal(pool.isSafe(pool.columns[slot], pool.rows[slot]), false);
      }
  }
  assert.equal(left && right, true);
  assert.equal(variants, 63);
  assert.equal(pool.x, arrays[0]);
  assert.equal(pool.z, arrays[1]);
  assert.equal(pool.active, arrays[2]);
  assert.equal(pool.active.length, Rules.poolSize);
});
test("connected safe corridors move at most one column per row across unbounded X", () => {
  const pool = new WorldSpawner();
  for (let seed = 1; seed <= 100; seed++) {
    pool.reset(seed);
    for (let row = 1; row < 1000; row++) {
      assert.ok(Math.abs(pool.safeOffset(row) - pool.safeOffset(row - 1)) <= 1);
      for (const corridor of [-1000, 0, 1000])
        assert.equal(
          pool.isSafe(corridor * 5 + pool.safeOffset(row), row),
          true,
        );
    }
  }
});
test("100 seeds: safe route survives 5 minutes at max speed with 300ms reaction and all 3 lives", () => {
  for (let seed = 1; seed <= 100; seed++) {
    const game = new Simulation(seed);
    game.phase = "running";
    game.distance = 2000;
    game.x = game.world.safeOffset(98) * Rules.columnWidth;
    let targetRow = -1,
      reaction = 0;
    for (let n = 0; n < 300 / STEP; n++) {
      const row = Math.max(
        0,
        Math.ceil((game.distance - Rules.firstRow - 0.85) / Rules.rowGap),
      );
      if (row !== targetRow) {
        targetRow = row;
        reaction = 0.3;
      }
      reaction -= STEP;
      const delta = game.world.safeOffset(row) * Rules.columnWidth - game.x;
      game.move(
        reaction <= 0 && Math.abs(delta) > (Rules.sideSpeed * STEP) / 2
          ? Math.sign(delta)
          : 0,
      );
      game.step(STEP);
      assert.equal(game.health.lives, 3, `seed ${seed}, step ${n}`);
    }
  }
});
test("swept cactus collision works at arbitrary positive and negative world coordinates", () => {
  for (const x of [-5000.25, 0.35, 7340.7]) {
    const game = emptyGame(2000, x);
    obstacle(game, x, 2);
    game.step(0.2);
    assert.equal(game.health.lives, 2);
  }
});
test("swept lateral collision does not tunnel through a cactus", () => {
  const game = emptyGame(0, -2);
  obstacle(game, 0, 2);
  game.move(1);
  game.step(0.5);
  assert.equal(game.health.lives, 2);
});
test("jump clears tall cactus, double jump is rejected, landing emits exactly once", () => {
  for (const distance of [0, 2000]) {
    const game = emptyGame(distance);
    obstacle(game, 0, distance ? 9 : 4.5, 1.55);
    let landed = 0;
    game.events.on(GameEvent.Land, () => landed++);
    game.jump();
    game.step(STEP);
    const velocity = game.velocityY;
    game.jump();
    assert.equal(game.velocityY, velocity);
    for (let i = 0; i < 140; i++) game.step(STEP);
    assert.equal(game.health.lives, 3);
    assert.equal(game.y, 0);
    assert.equal(landed, 1);
  }
});
test("lives, damage immunity, game over, pause and reset retain bounded pools", () => {
  const game = emptyGame(),
    pool = game.world.active;
  for (let hit = 0; hit < 3; hit++) {
    game.health.immunity = 0;
    obstacle(game, game.x, 0.3);
    game.step(STEP);
    assert.equal(game.health.lives, 2 - hit);
    if (hit < 2) {
      game.step(STEP);
      assert.equal(game.health.lives, 2 - hit);
    }
  }
  assert.equal(game.phase, "over");
  game.reset(999);
  assert.equal(game.world.active, pool);
  assert.equal(game.health.lives, 3);
  assert.equal(game.distance, 0);
  assert.equal(game.steering, 0);
  game.phase = "paused";
  game.step(1);
  assert.equal(game.distance, 0);
});
test("wallet/bonuses/registry are extension points; pickups and destruction are not enabled", () => {
  const events = new GameEvents(),
    wallet = new Wallet(events),
    bonuses = new BonusSystem(events);
  wallet.add(Currency.Coin, 4);
  wallet.add(Currency.Diamond, 2);
  assert.equal(wallet.coins, 4);
  assert.equal(wallet.diamonds, 2);
  assert.throws(() => wallet.add(Currency.Coin, -1));
  bonuses.register({ id: 1, duration: 1, shield: true, speedFactor: 1.2 });
  assert.equal(bonuses.activate(1), true);
  assert.equal(bonuses.shield, true);
  bonuses.step(2);
  assert.equal(bonuses.shield, false);
  assert.equal(bonuses.speedFactor, 1);
  const registry = ObjectRegistry.defaults();
  for (const kind of [
    ObjectKind.Coin,
    ObjectKind.Diamond,
    ObjectKind.Bonus,
    ObjectKind.Enemy,
  ])
    assert.equal(registry.get(kind)?.weight, 0);
  assert.equal(registry.get(ObjectKind.Cactus)?.destruction, undefined);
});
test("registered pickups/bonuses flow through the same pool and speed stays within route budget", () => {
  const game = emptyGame(2000);
  game.world.registry.register({
    kind: ObjectKind.Coin,
    weight: 0,
    blocking: false,
    colliders: [{ halfX: 0.25, halfZ: 0.25, height: 0.6 }],
    reward: 3,
  });
  obstacle(game, game.x, 0.3, 0.6);
  game.world.kinds[0] = ObjectKind.Coin;
  game.step(STEP);
  assert.equal(game.wallet.coins, 3);
  assert.equal(game.world.active[0], 0);
  game.step(STEP);
  assert.equal(game.wallet.coins, 3);
  game.bonuses.register({
    id: 7,
    duration: 2,
    speedFactor: 2,
    jumpFactor: 1.2,
    shield: true,
  });
  game.world.registry.register({
    kind: ObjectKind.Bonus,
    weight: 0,
    blocking: false,
    colliders: [{ halfX: 0.25, halfZ: 0.25, height: 0.6 }],
    bonusId: 7,
  });
  obstacle(game, game.x, 0.3, 0.6);
  game.world.kinds[0] = ObjectKind.Bonus;
  game.step(STEP);
  assert.equal(game.bonuses.shield, true);
  game.step(STEP);
  assert.equal(game.speed, Rules.maxSpeed);
  game.jump();
  assert.ok(Math.abs(game.velocityY - Rules.jumpSpeed * 1.2) < 1e-9);
});

test("floating item collider has a real vertical range for future pickups/enemies", () => {
  const game = emptyGame();
  game.world.registry.register({
    kind: ObjectKind.Coin,
    weight: 0,
    blocking: false,
    colliders: [{ halfX: 0.25, halfZ: 0.25, height: 0.5, baseY: 1.5 }],
    reward: 1,
  });
  obstacle(game, 0, 0.3, 0.5);
  game.world.kinds[0] = ObjectKind.Coin;
  game.world.baseY[0] = 1.5;
  game.step(STEP);
  assert.equal(game.wallet.coins, 0);
  game.y = game.previousY = 0.5;
  game.step(STEP);
  assert.equal(game.wallet.coins, 1);
});

test("fixed steps preserve motion at 15/30/60/120Hz", () => {
  const results: number[] = [];
  for (const hz of [15, 30, 60, 120]) {
    const game = emptyGame();
    game.move(1);
    let accumulator = 0;
    for (let frame = 0; frame < hz * 2; frame++) {
      accumulator += 1 / hz;
      while (accumulator + 1e-12 >= STEP) {
        game.step(STEP);
        accumulator -= STEP;
      }
    }
    results.push(game.distance);
    assert.ok(Math.abs(game.x - 16) < 1e-10);
  }
  assert.ok(results.every((value) => Math.abs(value - results[0]) < 1e-10));
});

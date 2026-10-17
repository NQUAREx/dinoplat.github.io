import test from "node:test";
import assert from "node:assert/strict";
import { WorldSpawner, ObjectKind } from "../src/world";
import { LandscapeField, Biome } from "../src/landscape";
import { Rules, GridMath } from "../src/config";
import { Tuning } from "../src/tuning";
import { Simulation, STEP } from "../src/simulation";
import { GameEvent } from "../src/events";

function moving(kind: ObjectKind) {
  const world = new WorldSpawner(undefined, undefined, new LandscapeField(1979));
  world.reset(1979);
  world.update(0, 0);
  const slot = world.active.findIndex((active, i) => !!active && world.kinds[i] === kind);
  assert.ok(slot >= 0);
  world.active.fill(0);
  world.active[slot] = 1;
  world.motion[slot] = 0;
  return { world, slot };
}

test("birds launch across the entire front hemisphere and track a turning runner", () => {
  for (const angle of [-90, -75, 0, 75, 90]) {
    const { world: w, slot: i } = moving(ObjectKind.Bird);
    w.x[i] = Math.sin(angle * Math.PI / 180) * 40;
    w.z[i] = Math.cos(angle * Math.PI / 180) * 40;
    let x = 0, z = 0, closest = Infinity;
    for (let tick = 0; tick < 720; tick++) {
      const heading = tick / 120 * 1.6;
      x -= Math.sin(heading) * 24 / 120;
      z += Math.cos(heading) * 24 / 120;
      // Launch at the origin so exactly lateral endpoints are included.
      w.step(tick / 120, 1 / 120, tick ? x : 0, tick ? z : 0, tick ? heading : 0, 24);
      assert.ok(w.motion[i] === 3 || w.motion[i] === 4);
      closest = Math.min(closest, Math.hypot(w.x[i] - x, w.z[i] - z));
    }
    const contactRadius = 0.48 * Rules.cactusHitScale + Rules.blockingRadius;
    assert.ok(closest < contactRadius, `${angle} degrees: ${closest}`);
  }
});

test("rear birds wait; tumbleweed moves 7.5m/s and records its previous collider", () => {
  const rear = moving(ObjectKind.Bird);
  rear.world.x[rear.slot] = 0;
  rear.world.z[rear.slot] = -40;
  rear.world.step(0, 1 / 120, 0, 0, 0, 24);
  assert.equal(rear.world.motion[rear.slot], 0);
  const { world: w, slot: i } = moving(ObjectKind.Tumbleweed);
  w.x[i] = 0;
  w.z[i] = 40;
  w.step(0, 1 / 120, 0, 0, 0, 24);
  assert.equal(w.previousX[i], 0);
  assert.equal(w.previousZ[i], 40);
  assert.ok(Math.abs(w.x[i] - 7.5 / 120) < 1e-8);
});

test("rocks/logs offer indexed smooth absolute support without pickup or damage metadata", () => {
  const w = new WorldSpawner(undefined, undefined, new LandscapeField(1979));
  w.reset(1979); w.update(0, 0);
  const slot = w.active.findIndex((active, i) => !!active && w.kinds[i] === ObjectKind.Rock);
  assert.ok(slot >= 0);
  w.active.fill(0);
  for (const kind of [ObjectKind.Rock, ObjectKind.Log]) {
    const definition = w.registry.get(kind)!;
    assert.equal(definition.walkable, true);
    assert.equal(definition.blocking, false);
    assert.equal(definition.spawnGroup, undefined);
    w.active[slot] = 1;
    w.kinds[slot] = kind;
    w.x[slot] = 10; w.z[slot] = 20;
    w.halfX[slot] = w.halfZ[slot] = 1;
    w.baseY[slot] = 3; w.height[slot] = 0.5;
    assert.equal(w.walkHeightAt(10, 20, 3), 3.5);
    assert.equal(w.walkHeightAt(11, 20, 3), 3);
    assert.ok(w.walkHeightAt(10.99, 20, 3) < 3.001);
    assert.equal(w.walkHeightAt(10, 20, 4), 4);
  }
  w.consume(slot);
  assert.equal(w.walkHeightAt(10, 20, 3), 3);
  w.reset(1979);
  assert.equal(w.walkHeightAt(10, 20, 3), 3);
});

test("bird commits full velocity on encounter and never follows after a duck", () => {
  const { world: w, slot: i } = moving(ObjectKind.Bird);
  w.x[i] = 0; w.z[i] = 40;
  w.step(0, 1 / 120, 0, 0, 0, 24);
  w.x[i] = 0; w.z[i] = 0.5;
  w.step(1, 1 / 120, 0, 0, 0, 24);
  assert.equal(w.motion[i], 4);
  assert.ok(Math.abs(w.z[i] - 0.2) < 1e-6);
  for (let tick = 1; tick < 120; tick++) w.step(1 + tick / 120, 1 / 120, 10, 10, 0, 24);
  assert.equal(w.motion[i], 4);
  assert.equal(w.x[i], 0);
  assert.ok(Math.abs(w.z[i] - (0.5 - 36)) < 1e-5);
  w.step(11, 1 / 120, 0, 0, 0, 24);
  assert.equal(w.active[i], 0);
});

// Freeze terrain support/biome so density measures generation rather than changing terrain.
class DensityField extends LandscapeField {
  override supportAt() { return true; }
  override heightAt() { return 0; }
  override biomeAt() { return Biome.Desert; }
}

/** Original acceptance, 40% minor-object share and full-distance hard-core thinning.
 * Independent candidate enumeration: no snapshot counts or new-population filtering. */
function originalMajors(w: WorldSpawner, seed: number) {
  const random = (cx: number, rz: number, n: number, salt: number) =>
    GridMath.hash(cx, rz, seed ^ Math.imul(n + 1, 0x9e3779b9) ^ salt) / 4294967296;
  const colliders = w.registry.get(ObjectKind.Cactus)!.colliders;
  const center = Math.floor(500 / Rules.chunkSize);
  let count = 0;
  for (let row = center - w.radius; row <= center + w.radius; row++)
    for (let col = center - w.radius; col <= center + w.radius; col++)
      for (let n = 0; n < Rules.candidatesPerChunk; n++) {
        const x = (col + random(col, row, n, 0x311a)) * Rules.chunkSize;
        const z = (row + random(col, row, n, 0x741d)) * Rules.chunkSize;
        const radius = Math.hypot(x, z);
        const speed = Math.min(Rules.maxSpeed, Rules.startSpeed + radius * Tuning.generation.speedGrowth);
        if (radius < Rules.firstRow || random(col, row, n, 0x17f3) >
          Tuning.generation.acceptance - (speed - Rules.startSpeed) * Tuning.generation.speedPenalty) continue;
        if (random(col, row, n, 0xa12c) < 0.4) continue;
        const bounds = colliders[Math.floor(random(col, row, n, 0x51ac) * colliders.length)];
        const angle = random(col, row, n, 0xad27) * Math.PI * 2;
        const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
        if (w.isRouteClear(x, z, bounds.halfX * cos + bounds.halfZ * sin,
          bounds.halfZ * cos + bounds.halfX * sin)) continue;
        const priority = random(col, row, n, 0xa193);
        let thinned = false;
        for (let rz = row - 1; rz <= row + 1; rz++)
          for (let cx = col - 1; cx <= col + 1; cx++)
            for (let k = 0; k < Rules.candidatesPerChunk; k++) {
              if (random(cx, rz, k, 0xa193) >= priority) continue;
              const nx = (cx + random(cx, rz, k, 0x311a)) * Rules.chunkSize;
              const nz = (rz + random(cx, rz, k, 0x741d)) * Rules.chunkSize;
              if ((nx - x) ** 2 + (nz - z) ** 2 < Tuning.generation.spacing ** 2) thinned = true;
            }
        if (!thinned) count++;
      }
  return count;
}

test("major obstacle density approaches twice the original with fixed capacity and clear routes", (t) => {
  let majors = 0, original = 0;
  const fallChance = Tuning.landscape.fallChance;
  Tuning.landscape.fallChance = 0;
  t.after(() => { Tuning.landscape.fallChance = fallChance; });
  for (let seed = 1; seed <= 12; seed++) {
    const w = new WorldSpawner(undefined, undefined, new DensityField(seed));
    w.reset(seed); w.update(500, 500);
    original += originalMajors(w, seed);
    assert.equal(w.active.length, 2250);
    for (let i = 0; i < w.active.length; i++) {
      if (!w.active[i]) continue;
      if ([ObjectKind.Cactus, ObjectKind.Tree, ObjectKind.DeadTree].includes(w.kinds[i])) {
        majors++;
        assert.equal(w.isRouteClear(w.x[i], w.z[i], w.halfX[i], w.halfZ[i]), false);
      }
      assert.ok(Number.isFinite(w.previousX[i]));
      assert.ok(Number.isFinite(w.previousZ[i]));
    }
  }
  t.diagnostic(`original=${original}, new=${majors}, ratio=${majors / original}`);
  assert.ok(majors / original > 1.9 && majors / original < 2.1,
    `major count ${majors}, original ${original}`);
});

function flatSimulation(kind: ObjectKind) {
  const game = new Simulation(1979);
  // Keep enabled: world dynamics and previous-collider snapshots still execute.
  game.landscape.vertexHeight = () => 0;
  game.landscape.hazardAt = () => -1;
  game.reset(1979);
  const w = game.world;
  let slot = -1, nearest = Infinity;
  for (let i = 0; i < w.active.length; i++) {
    if (!w.active[i] || w.kinds[i] !== kind) continue;
    const distance = Math.hypot(w.x[i], w.z[i]);
    if (distance < nearest) { nearest = distance; slot = i; }
  }
  assert.ok(slot >= 0, `natural ${ObjectKind[kind]} slot`);
  w.active.fill(0);
  w.active[slot] = 1;
  // Isolate this encounter even when chunk updates populate the far edge.
  for (const kind of [ObjectKind.Cactus, ObjectKind.Coin, ObjectKind.Diamond, ObjectKind.Heart])
    w.registry.setWeight(kind, 0);
  game.groundY = game.previousGroundY = 0;
  game.phase = "running";
  return { game, w, slot };
}

test("simulation: natural birds hit standing turning runners and timed ducks clear the full flight", () => {
  for (const angle of [-80, 80]) for (const duck of [false, true]) {
    const { game, w, slot: i } = flatSimulation(ObjectKind.Bird);
    w.x[i] = w.previousX[i] = Math.sin(angle * Math.PI / 180) * 40;
    w.z[i] = w.previousZ[i] = Math.cos(angle * Math.PI / 180) * 40;
    w.baseY[i] = w.previousBaseY[i] = 1.05;
    game.distance = 1500; // Real speed calculation reaches its 24m/s cap.
    game.move(angle > 0 ? -1 : 1);
    let ducked = false, passed = false;
    for (let tick = 0; tick < 1200; tick++) {
      const dx = w.x[i] - game.x, dz = w.z[i] - game.z;
      const distance = Math.hypot(dx, dz);
      const closingSpeed = 36 + 24 * (-Math.sin(game.heading) * dx + Math.cos(game.heading) * dz) / distance;
      if (duck && !ducked && w.motion[i] === 3 && distance / closingSpeed < 0.4) {
        game.down(); ducked = true;
      }
      game.step(STEP);
      if (w.motion[i] === 4) passed = true;
      if (!duck && game.health.lives < 3) break;
    }
    assert.equal(game.health.lives, duck ? 3 : 2, `angle=${angle}, duck=${duck}`);
    if (duck) {
      assert.ok(ducked && passed);
      assert.equal(game.crouchRemaining, 0);
      assert.equal(game.crouch, 0);
      assert.equal(w.active[i], 0, "full flight expires without a delayed hit");
    } else {
      assert.equal(w.active[i], 0, "actual bird damage consumes its slot");
      assert.equal(game.hitStopRemaining, Rules.hitStopSeconds);
    }
  }
});

test("simulation: relative bird sweep crosses the runner between disjoint frame endpoints", () => {
  const { game, w, slot: i } = flatSimulation(ObjectKind.Bird);
  // Launch naturally to establish full forward velocity, then exercise a fly-through.
  w.x[i] = 0; w.z[i] = 40;
  w.step(0, STEP, 0, 0, 0, 24);
  w.motion[i] = 4;
  w.x[i] = w.previousX[i] = 0;
  w.z[i] = w.previousZ[i] = 0.7;
  w.baseY[i] = w.previousBaseY[i] = 1.05;
  const extent = w.halfZ[i] * Rules.cactusHitScale + Rules.blockingRadius;
  assert.ok(w.z[i] > extent);
  game.step(1 / 20);
  assert.ok(w.z[i] < -extent, "final collider also lies outside the player endpoint");
  assert.equal(game.health.lives, 2);
  assert.equal(w.active[i], 0);
  assert.equal(game.hitStopRemaining, Rules.hitStopSeconds);
  assert.ok(game.z > 0 && game.z < Rules.startSpeed / 20, "impact clamps within the tick");
});

test("simulation: cached natural rock supports a smooth walk-over without gameplay rewards or damage", () => {
  const { game, w, slot: i } = flatSimulation(ObjectKind.Rock);
  w.x[i] = w.previousX[i] = 0;
  w.z[i] = w.previousZ[i] = 3;
  w.baseY[i] = w.previousBaseY[i] = 0;
  game.health.lives = 2; // Healing must be observable rather than hidden by full health.
  let collected = 0, visuals = 0;
  game.events.on(GameEvent.Collected, () => collected++);
  game.events.on(GameEvent.CollectedVisual, () => visuals++);
  let maximum = 0, rose = false, fell = false;
  const coins = game.wallet.coins, diamonds = game.wallet.diamonds;
  for (let tick = 0; tick < 80; tick++) {
    const before = game.groundY;
    game.step(STEP);
    maximum = Math.max(maximum, game.groundY);
    rose ||= game.groundY > before;
    fell ||= game.groundY < before;
    const slopeBound = 1.54 * w.height[i] / w.halfZ[i];
    assert.ok(Math.abs(game.groundY - before) <= slopeBound * game.speed * STEP + 1e-6);
    assert.equal(game.y, 0);
    assert.equal(game.falling, false);
    assert.equal(w.active[i], 1);
    assert.equal(game.health.lives, 2);
  }
  assert.ok(rose && fell && maximum > w.height[i] * 0.95);
  assert.equal(game.groundY, 0);
  assert.equal(game.hitStopRemaining, 0);
  assert.equal(game.wallet.coins, coins);
  assert.equal(game.wallet.diamonds, diamonds);
  assert.equal(collected, 0);
  assert.equal(visuals, 0);
});

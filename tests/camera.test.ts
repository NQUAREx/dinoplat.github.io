import { test } from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Vector3 } from "three";
import { frameCamera, ObstacleVisibility, CAMERA_FOLLOW, FOG_END } from "../src/camera.ts";
import { MAX_PLAYER_X, ROW_RECYCLE_Z, LANES, laneX, Simulation, STEP } from "../src/simulation.ts";

test("close portrait camera: narrower FOV, larger dinosaur, bounded far fog", () => {
  const aspect = 390 / 844;
  const camera = new PerspectiveCamera();
  frameCamera(camera, aspect);
  const feet = new Vector3(0, 0, 0).project(camera);
  const head = new Vector3(0, 1.3235, 0).project(camera);
  assert.equal(camera.fov, 50);
  assert.equal(camera.far, 64);
  assert.ok(FOG_END < camera.far - 2);
  assert.ok(head.y - feet.y > 0.15); // >63 CSS px at 844px, previously ~29px.
  assert.ok(feet.y > -0.8 && head.y < 0.8);
});

test("camera follow keeps edge positions visible on narrow and short phones", () => {
  const camera = new PerspectiveCamera();
  for (const aspect of [320 / 1000, 390 / 844, 320 / 568]) {
    frameCamera(camera, aspect);
    for (const x of [-MAX_PLAYER_X, 0, MAX_PLAYER_X]) {
      camera.position.x = x * CAMERA_FOLLOW;
      camera.updateMatrixWorld();
      const projected = new Vector3(x, 0.7, 0).project(camera);
      assert.ok(Math.abs(projected.x) < 0.8);
    }
  }
});

test("a trailing cube survives the old -4 cutoff until its entire volume exits", () => {
  const camera = new PerspectiveCamera();
  frameCamera(camera, 390 / 844);
  const visibility = new ObstacleVisibility();
  visibility.update(camera);
  assert.equal(visibility.intersects(0, -4.01), true);
  assert.equal(visibility.intersects(0, -5), true);
  assert.equal(visibility.intersects(0, -8), false);
});

test("all pooled cubes recycle only after leaving the frustum on all supported aspects", () => {
  const camera = new PerspectiveCamera();
  const visibility = new ObstacleVisibility();
  for (const aspect of [320 / 1000, 390 / 844, 320 / 568]) {
    frameCamera(camera, aspect);
    for (const playerX of [-MAX_PLAYER_X, 0, MAX_PLAYER_X]) {
      camera.position.x = playerX * CAMERA_FOLLOW;
      visibility.update(camera);
      for (let lane = 0; lane < LANES; lane++) {
        const x = laneX(lane);
        assert.equal(visibility.intersects(x, ROW_RECYCLE_Z + 0.01), false);
        let entered = false, exited = false;
        for (let z = 60; z > ROW_RECYCLE_Z; z -= 0.05) {
          const visible = visibility.intersects(x, z);
          if (visible) { assert.equal(exited, false); entered = true; }
          else if (entered) exited = true;
        }
      }
    }
  }
  const game = new Simulation(123);
  game.phase = "running";
  game.masks.fill(0);
  game.rowZ[0] = -8;
  game.step(STEP);
  assert.ok(game.rowZ[0] < -8, "no early recycling at the old -8 threshold");
  game.rowZ[0] = ROW_RECYCLE_Z - 1;
  game.step(STEP);
  assert.ok(game.rowZ[0] > 0);
});

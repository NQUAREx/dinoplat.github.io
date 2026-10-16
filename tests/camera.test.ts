import { test } from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { CameraRig, ObjectVisibility, FOG_END } from "../src/camera.ts";
import { WorldSpawner } from "../src/world.ts";
import { Rules } from "../src/config.ts";

test("close dynamic camera remains bounded, and event pose can transition independently", () => {
  const rig = new CameraRig();
  rig.resize(390 / 844);
  const before = rig.camera.position.y;
  rig.update(1.1, 0, 0.016, true);
  assert.ok(Math.abs(rig.camera.position.y - before) <= 0.04);
  rig.setPose({ offsetX: 1.5, height: 12, distance: 14, fov: 45 }, 0.5);
  for (let i = 0; i < 120; i++) rig.update(i * 0.1, 0, 1 / 60, false);
  assert.ok(Math.abs(rig.camera.position.y - 12) < 0.01);
  assert.ok(Math.abs(rig.camera.fov - 45) < 0.01);
  assert.ok(Math.abs(rig.camera.position.x - 1.5) < 0.01);
  assert.ok(FOG_END < rig.camera.far - 2);
});
test("shake slider spans zero to three times original amplitude without altering baseline camera", () => {
  const rig = new CameraRig();
  rig.shakeMultiplier = 0;
  rig.impulse(0.075, 0.22);
  rig.update(1.1, 0, 0.016, true);
  assert.equal(rig.camera.position.y, 8.5);
  assert.equal(rig.camera.position.x, 0);
  const normal = new CameraRig();
  normal.update(1.1, 0, 0.016, true);
  normal.update(1.1, 0, 0.016, true);
  rig.shakeMultiplier = 3;
  rig.update(1.1, 0, 0.016, true);
  assert.ok(
    Math.abs(
      rig.camera.position.y - 8.5 - (normal.camera.position.y - 8.5) * 3,
    ) < 1e-10,
  );
  assert.equal(rig.camera.fov, 50);
  assert.equal(rig.camera.position.z, 12);
});
test("walking bob fades rather than snapping on jump, landing or pause", () => {
  const rig = new CameraRig();
  for (let i = 0; i < 60; i++) rig.update(1.1, 0, 1 / 60, true);
  const walking = rig.camera.position.y;
  rig.update(1.1, 0, 0, false);
  assert.equal(
    rig.camera.position.y,
    walking,
    "pause cannot reset bob instantly",
  );
  rig.update(1.1, 0, 1 / 120, false);
  assert.ok(Math.abs(rig.camera.position.y - walking) < 0.009);
});
test("cacti remain until their full volume exits; pool retirement never removes a visible cell", () => {
  const rig = new CameraRig(),
    visibility = new ObjectVisibility();
  for (const aspect of [320 / 1000, 390 / 844, 320 / 568, 0.95]) {
    rig.resize(aspect);
    rig.update(0, 0, 0, false);
    visibility.update(rig.camera);
    assert.equal(visibility.intersects(0, -4.1, 0.45, 0.45, 1.55), true);
    assert.equal(visibility.intersects(0, -16, 0.45, 0.45, 1.55), false);
    const pool = new WorldSpawner();
    pool.reset(1979);
    pool.setVisibleHalfWidth(
      rig.camera.far * Math.tan((rig.camera.fov * Math.PI) / 360) * aspect + 1,
    );
    for (const x of [-100000.5, 0, 100000.5]) {
      pool.update(x, 500);
      const cx = Math.floor(x / Rules.chunkSize);
      for (const side of [-1, 1]) {
        const retiredX = (cx + side * (pool.radius + 1)) * Rules.chunkSize - x;
        assert.equal(
          visibility.intersects(retiredX, 35, 0.55, 0.55, 1.55),
          false,
        );
      }
    }
    const head = new Vector3(0, 1.65, 0).project(rig.camera),
      feet = new Vector3(0, 0, 0).project(rig.camera);
    assert.ok(head.y - feet.y > 0.15);
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { CameraRig } from "../src/camera.ts";

test("terrain pitch follows ascent/descent in both views and every heading without changing flat baseline", () => {
  for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 7]) {
    for (const first of [false, true]) for (const grade of [-0.5, 0, 0.8, 1.4]) {
      const rig = new CameraRig(true), sx = -Math.sin(heading), sz = Math.cos(heading);
      const field = { heightAt: (x: number, z: number) => 13 + grade * (x * sx + z * sz) };
      rig.firstPerson = first; rig.heading = heading;
      for (let i = 0; i < 240; i++) rig.update(0, 0, 1 / 60, false, heading, 13, 0, 13, field, 0, 0);
      const target = Math.max(-0.55, Math.min(0.95, Math.atan(grade)));
      assert.ok(Math.abs(rig.terrainPitch - target) < 0.00002);
      const direction = rig.camera.getWorldDirection(new Vector3());
      if (grade >= 0.8) assert.ok(direction.y > 0, "look up the approaching mountain, not into it");
      if (grade < 0) assert.ok(direction.y < 0, "look down the descent");
      assert.ok(rig.camera.position.y >= field.heightAt(rig.camera.position.x, -rig.camera.position.z) + 0.19999);
      if (first && grade === 0) assert.equal(rig.camera.position.y, 14.45);
      if (!first && grade === 0) assert.equal(rig.camera.position.y, 21.5);
    }
  }
});

test("slope anticipation is frame-rate independent, bounded and frozen at zero delta", () => {
  const field = { heightAt: (_x: number, z: number) => z * 0.9 };
  const pitches: number[] = [];
  for (const fps of [15, 30, 60, 120]) {
    const rig = new CameraRig(true);
    for (let n = 0; n < fps; n++) rig.update(0, 0, 1 / fps, false, 0, 0, 0, 0, field);
    pitches.push(rig.terrainPitch);
    const position = rig.camera.position.clone(), rotation = rig.camera.quaternion.clone(), pitch = rig.terrainPitch;
    rig.update(0, 0, 0, false, 0, 0, 0, 0, field);
    assert.equal(rig.terrainPitch, pitch);
    assert.ok(rig.camera.position.distanceTo(position) < 1e-12);
    assert.ok(rig.camera.quaternion.angleTo(rotation) < 1e-7);
    rig.reset(); assert.equal(rig.terrainPitch, 0);
  }
  for (const pitch of pitches) assert.ok(Math.abs(pitch - pitches[0]) < 1e-12);
});

test("uphill points remain visible and mode reversal keeps the current camera pose", () => {
  const rig = new CameraRig(true), field = { heightAt: (_x: number, z: number) => z };
  rig.resize(390 / 844);
  for (let i = 0; i < 180; i++) rig.update(0, 0, 1 / 60, false, 0, 0, 0, 0, field);
  const ahead = new Vector3(0, 7, -6).project(rig.camera);
  assert.ok(ahead.y < 0.95 && ahead.y > -0.95);
  rig.firstPerson = true;
  rig.update(0, 0, 0.325, false, 0, 0, 0, 0, field);
  const p = rig.camera.position.clone(), q = rig.camera.quaternion.clone();
  rig.firstPerson = false;
  rig.update(0, 0, 0, false, 0, 0, 0, 0, field);
  assert.ok(p.distanceTo(rig.camera.position) < 1e-12);
  assert.ok(q.angleTo(rig.camera.quaternion) < 1e-7);
});

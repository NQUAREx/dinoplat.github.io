import { test } from "node:test";
import assert from "node:assert/strict";
import { Mesh, MeshBasicMaterial, BoxGeometry } from "three";
import { LightingRig } from "../src/lighting.ts";
import { DinosaurShadow } from "../src/dinosaur-shadow.ts";
import type { AnimatedDinosaur } from "../src/character.ts";
import { CameraRig, ObjectVisibility } from "../src/camera.ts";
import { WorldSpawner, ObjectKind } from "../src/world.ts";

test("full day is continuous across dawn, dusk, midnight and every sky stop", () => {
  const light = new LightingRig();
  let previous: number[] | undefined;
  for (let i = 0; i <= 24000; i++) {
    light.setTimeOfDay(i / 1000);
    light.update(0);
    const p = light.key.position, c = light.key.color, a = light.ambient;
    const values = [p.x, p.y, p.z, light.key.intensity, a.intensity,
      c.r, c.g, c.b, a.color.r, a.color.g, a.color.b,
      a.groundColor.r, a.groundColor.g, a.groundColor.b,
      light.shadowStrength, light.fogColour.r, light.fogColour.g, light.fogColour.b];
    if (previous) for (let n = 0; n < values.length; n++)
      assert.ok(Math.abs(values[n] - previous[n]) < (n < 3 ? .012 : .002),
        `discontinuity at hour ${i / 1000}, channel ${n}`);
    previous = values;
  }
  assert.equal("moon" in light, false);
  light.dispose();
});

test("dinosaur contact shadow follows interpolated jump, yaw, duck and night", () => {
  const shadow = new DinosaurShadow(), light = new LightingRig();
  const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  const dinosaur = { mesh } as unknown as AnimatedDinosaur;
  shadow.update(dinosaur, light, 0);
  const grounded = shadow.mesh.material.opacity;
  assert.equal(shadow.mesh.position.y, -.009);
  mesh.position.y = 3;
  mesh.rotation.y = Math.PI / 4;
  shadow.update(dinosaur, light, 0);
  assert.equal(shadow.mesh.position.x, -3 * light.shadowSlope.x);
  assert.equal(shadow.mesh.position.z, -3 * light.shadowSlope.y);
  assert.ok(shadow.mesh.material.opacity < grounded);
  assert.equal(shadow.mesh.rotation.y, Math.PI / 4);
  const width = shadow.mesh.scale.x;
  mesh.scale.set(1.12, .45, 1.12);
  shadow.update(dinosaur, light, 0);
  assert.ok(shadow.mesh.scale.x > width);
  light.setTimeOfDay(0); light.update(0);
  shadow.update(dinosaur, light, 0);
  assert.ok(shadow.mesh.material.opacity > .1);
  light.shadowsEnabled = false; light.update(0);
  shadow.update(dinosaur, light, 0);
  assert.equal(shadow.mesh.visible, false);
  shadow.dispose(); light.dispose(); mesh.geometry.dispose(); mesh.material.dispose();
});

test("visible cactus identities, transforms and ground bases survive moving ring boundaries", () => {
  const rig = new CameraRig(), visibility = new ObjectVisibility();
  rig.resize(390 / 844); visibility.update(rig.camera);
  for (const baseX of [-1000000, -16, 0, 1000000]) {
    const world = new WorldSpawner(); world.reset(1979);
    world.update(baseX - .1, 159.9);
    let previous = new Map<string, number[]>();
    for (let f = 0; f < 300; f++) {
      const x = baseX - .1 + f * .02, distance = 159.9 + f * .1;
      world.update(x, distance);
      const current = new Map<string, number[]>();
      for (let i = 0; i < world.active.length; i++) {
        if (!world.active[i] || world.kinds[i] !== ObjectKind.Cactus) continue;
        current.set(`${world.x[i]},${world.z[i]}`,
          [world.x[i], world.z[i], world.halfX[i], world.halfZ[i],
            world.height[i], world.baseY[i], world.variants[i], world.angles[i]]);
      }
      for (const [key, old] of previous) {
        if (visibility.intersects(old[0] - x, old[1] - distance, old[2], old[3], old[4], old[5]))
          assert.deepEqual(current.get(key), old, "visible cactus changed or retired");
      }
      for (const value of current.values()) assert.equal(value[5], 0);
      previous = current;
    }
  }
});

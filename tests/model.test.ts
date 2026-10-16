import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AnimationMixer, SkinnedMesh, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { AnimatedDinosaur } from "../src/character.ts";
import { Simulation } from "../src/simulation.ts";
import type { ModelLibrary } from "../src/models.ts";
import { COSMETICS, CosmeticInventory } from "../src/cosmetics.ts";
import { DinosaurCosmetics } from "../src/dinosaur-cosmetics.ts";

test("all wardrobe swaps reuse one rig and three attachment meshes, including animated crouch", async () => {
  const bytes = await readFile(
    new URL("../src/assets/game-models.glb", import.meta.url),
  );
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  const mesh = gltf.scene.getObjectByName("dinosaur") as SkinnedMesh;
  const geometries = new Map(
    COSMETICS.filter((i) => i.id !== "dino-green").map((i) => [
      i.id,
      (gltf.scene.getObjectByName(i.id) as SkinnedMesh).geometry,
    ]),
  );
  const game = new Simulation(1),
    inventory = new CosmeticInventory(game.wallet, {
      getItem: () => null,
      setItem: () => {},
    });
  game.wallet.add(0, 100000);
  game.wallet.add(1, 100000);
  const actor = new AnimatedDinosaur(
    { dinosaur: mesh, animations: gltf.animations } as ModelLibrary,
    game,
  );
  const contactLeft = new Vector3(),
    contactRight = new Vector3();
  game.phase = "running";
  game.distance = game.previousDistance = 4.444444444;
  actor.sampleContact(game, 0, contactLeft);
  actor.sampleContact(game, 1, contactRight);
  assert.ok(
    contactLeft.x < 0 && contactRight.x > 0,
    "dust comes from distinct animated foot transforms",
  );
  assert.ok(contactLeft.distanceTo(contactRight) > 0.3);
  for (const id of ["boots-red", "boots-blue", "boots-gold"]) {
    const geometry = geometries.get(id)!;
    geometry.computeBoundingBox();
    assert.ok(
      geometry.boundingBox!.min.y <= -0.389,
      "closed sole extends below the bare foot",
    );
    assert.ok(
      geometry.boundingBox!.min.z <= -0.5 &&
        geometry.boundingBox!.max.x >= 0.199,
    );
  }
  const wardrobe = new DinosaurCosmetics(
    { greenGeometry: mesh.geometry, cosmetics: geometries },
    mesh,
  );
  for (const item of COSMETICS) {
    inventory.choose(item.id);
    wardrobe.apply(inventory);
  }
  const attachments: string[] = [];
  mesh.traverse((o) => {
    if (o.type === "Mesh") attachments.push(o.uuid);
  });
  assert.equal(attachments.length, 3);
  for (let i = 0; i < 1000; i++) {
    inventory.choose(COSMETICS[i % COSMETICS.length].id);
    wardrobe.apply(inventory);
  }
  const after: string[] = [];
  mesh.traverse((o) => {
    if (o.type === "Mesh") after.push(o.uuid);
  });
  assert.deepEqual(after, attachments);
  assert.equal(mesh.skeleton.bones.length, 11);
  game.phase = "running";
  game.crouch = game.previousCrouch = 1;
  game.distance = game.previousDistance = 0.2;
  actor.update(game, 1);
  mesh.updateMatrixWorld(true);
  const shin = mesh.skeleton.bones.find((b) => b.name === "dino-shin-l")!,
    shoe = shin.children.find((o) => o.type === "Mesh")!;
  const start = shoe.getWorldPosition(new Vector3());
  game.distance = game.previousDistance = 1.2;
  actor.update(game, 1);
  mesh.updateMatrixWorld(true);
  assert.ok(
    shoe.getWorldPosition(new Vector3()).distanceTo(start) > 0.02,
    "shoe follows real crouch leg motion",
  );
  assert.equal(wardrobe.stats().hatParent, "dino-head");
  assert.equal(wardrobe.stats().rightParent, "dino-shin-r");
  actor.dispose();
  mesh.skeleton.dispose();
  gltf.scene.traverse((object) => {
    if ("geometry" in object) (object as SkinnedMesh).geometry.dispose();
  });
});

test("exported low-poly rig animates limbs and lowers the head when ducking", async () => {
  const bytes = await readFile(
    new URL("../src/assets/game-models.glb", import.meta.url),
  );
  const data = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const gltf = await new GLTFLoader().parseAsync(data, "");
  const mesh = gltf.scene.getObjectByName("dinosaur") as SkinnedMesh;
  const mixer = new AnimationMixer(mesh);
  const run = mixer
    .clipAction(gltf.animations.find((c) => c.name === "run")!)
    .play();
  mixer.setTime(0.1);
  mesh.updateMatrixWorld(true);
  const leg = mesh.skeleton.bones.find((b) => b.name === "dino-leg-l")!;
  const first = leg.quaternion.clone();
  mixer.setTime(0.3);
  mesh.updateMatrixWorld(true);
  assert.ok(
    first.angleTo(leg.quaternion) > 0.1,
    "run has real limb animation, not static geometry",
  );
  const head = mesh.skeleton.bones.find((b) => b.name === "dino-head")!;
  const standing = head.getWorldPosition(new Vector3()).y;
  run.stop();
  mixer.clipAction(gltf.animations.find((c) => c.name === "duck")!).play();
  mixer.setTime(0.5);
  mesh.updateMatrixWorld(true);
  assert.ok(head.getWorldPosition(new Vector3()).y < standing - 0.3);
  const duck = mixer.clipAction(
    gltf.animations.find((c) => c.name === "duck")!,
  );
  mixer.setTime(0.1);
  const duckLeg = leg.quaternion.clone();
  mixer.setTime(0.3);
  assert.ok(
    duckLeg.angleTo(leg.quaternion) > 0.1,
    "ducking must animate legs rather than slide",
  );
  assert.ok(
    duck.getClip().duration < 0.7,
    "static pose endpoints must not pad the gait loop",
  );
  mixer.stopAllAction();
  mixer.uncacheRoot(mesh);
  const game = new Simulation(123);
  game.phase = "running";
  game.y = game.previousY = 2;
  game.diving = true;
  game.velocityY = -22;
  game.heading = game.previousHeading = Math.PI / 2;
  const actor = new AnimatedDinosaur(
    { dinosaur: mesh, animations: gltf.animations } as ModelLibrary,
    game,
  );
  actor.update(game, 1);
  const forward = new Vector3(0, 0, -1).applyQuaternion(mesh.quaternion);
  assert.ok(
    Math.abs(forward.z) < 1e-8 && Math.abs(forward.y) > 0.1 && forward.x < -0.9,
    "jump/dive pitch follows local facing after a 90-degree turn",
  );
  actor.dispose();
  mesh.skeleton.dispose();
  gltf.scene.traverse((object) => {
    if ("geometry" in object) (object as SkinnedMesh).geometry.dispose();
  });
});

test("model asset contains an animated low-poly dinosaur, seven decorated cacti and three pickups", async () => {
  const buffer = await readFile(
    new URL("../src/assets/game-models.glb", import.meta.url),
  );
  assert.equal(buffer.toString("ascii", 0, 4), "glTF");
  const json = JSON.parse(
    buffer.toString("utf8", 20, 20 + buffer.readUInt32LE(12)),
  );
  assert.equal(json.meshes.length, 27);
  assert.equal(json.images, undefined);
  assert.equal(json.textures, undefined);
  assert.equal(json.skins.length, 4);
  assert.equal(json.skins[0].joints.length, 11);
  for (const skin of json.skins)
    assert.deepEqual(skin.joints, json.skins[0].joints);
  for (const name of [
    "hat-cap",
    "hat-safari",
    "hat-crown",
    "boots-red",
    "boots-blue",
    "boots-gold",
  ]) {
    const node = json.nodes.find((n: { name: string }) => n.name === name);
    assert.ok(node);
    assert.ok(
      json.accessors[json.meshes[node.mesh].primitives[0].indices].count / 3 <=
        96,
    );
  }
  assert.deepEqual(
    json.animations.map((a: { name: string }) => a.name),
    ["run", "jump", "duck", "hit", "death"],
  );
  assert.ok(buffer.length < 800000);
  for (const name of ["coin", "diamond", "heart"]) {
    const node = json.nodes.find(
      (n: { name: string }) => n.name === `pickup-${name}`,
    );
    const primitive = json.meshes[node.mesh].primitives[0];
    assert.ok(
      json.accessors[primitive.indices].count / 3 <= 200,
      "new faceted pickups are lighter than voxel meshes",
    );
    const bounds = json.accessors[primitive.attributes.POSITION];
    assert.ok(
      bounds.max[2] - bounds.min[2] > 0.19,
      "real 3D volume, not flat icons",
    );
  }
  const names = json.nodes.map((node: { name: string }) => node.name);
  assert.ok(names.includes("dinosaur"));
  assert.ok(!names.includes("run-0"));
  for (let i = 0; i < 7; i++) assert.ok(names.includes(`cactus-${i}`));
  for (let i = 0; i < 7; i++) {
    const lod = json.nodes.find(
      (n: { name: string }) => n.name === `cactus-lod-${i}`,
    );
    assert.ok(lod);
    const primitive = json.meshes[lod.mesh].primitives[0];
    assert.ok(json.accessors[primitive.indices].count / 3 <= 192);
    assert.ok(json.accessors[primitive.attributes.POSITION].min[1] > -1e-6);
  }
  for (const name of ["pickup-coin", "pickup-diamond", "pickup-heart"])
    assert.ok(names.includes(name));
  for (const mesh of json.meshes) {
    assert.equal(mesh.primitives.length, 1);
    const primitive = mesh.primitives[0];
    assert.ok(primitive.attributes.COLOR_0 !== undefined);
    assert.ok(json.accessors[primitive.indices].count / 3 <= 1000);
  }
  for (const node of json.nodes.filter((node: { name?: string }) =>
    node.name?.startsWith("pickup-"),
  )) {
    const primitive = json.meshes[node.mesh].primitives[0];
    const bounds = json.accessors[primitive.attributes.POSITION];
    const radius = Math.hypot(
      Math.max(Math.abs(bounds.min[0]), Math.abs(bounds.max[0])),
      Math.max(Math.abs(bounds.min[2]), Math.abs(bounds.max[2])),
    );
    assert.ok(radius <= 0.46, `rotation envelope for ${node.name}`);
    assert.ok(Math.abs(bounds.min[1]) < 1e-6);
    assert.ok(bounds.max[1] >= 0.69 && bounds.max[1] <= 0.750001);
  }
  // Slanted normals are essential: old voxel surfaces only had axis normals.
  const binaryStart = 20 + buffer.readUInt32LE(12) + 8;
  const colliders = JSON.parse(
    await readFile(
      new URL("../src/assets/model-colliders.json", import.meta.url),
      "utf8",
    ),
  );
  for (let i = 0; i < 7; i++) {
    const node = json.nodes.find(
      (n: { name: string }) => n.name === `cactus-${i}`,
    );
    const primitive = json.meshes[node.mesh].primitives[0];
    const positions = json.accessors[primitive.attributes.POSITION];
    const colours = json.accessors[primitive.attributes.COLOR_0];
    assert.equal(
      colours.componentType,
      5121,
      "packed byte colours, not float RGB",
    );
    assert.equal(colours.normalized, true);
    const colourView = json.bufferViews[colours.bufferView],
      palette = new Set<string>();
    let creamSpines = 0,
      paleSpots = 0;
    for (let n = 0; n < colours.count; n++) {
      const p =
        binaryStart +
        (colourView.byteOffset || 0) +
        (colours.byteOffset || 0) +
        n * (colourView.byteStride || 3);
      const r = buffer[p],
        g = buffer[p + 1],
        b = buffer[p + 2];
      palette.add(`${r},${g},${b}`);
      if (r > 240 && g > 210 && b > 120) creamSpines++;
      if (r > 150 && r < 180 && g > 195 && b > 50 && b < 80) paleSpots++;
    }
    assert.ok(
      creamSpines > 0 && paleSpots > 0 && palette.size >= 5,
      "spines, areoles and varied rib colours on every cactus",
    );
    assert.ok(Math.abs(positions.min[1]) < 1e-6, "feet at ground zero");
    assert.ok(Math.abs(positions.max[0] - colliders[i].halfX) < 1e-5);
    assert.ok(Math.abs(positions.max[2] - colliders[i].halfZ) < 1e-5);
    assert.ok(Math.abs(positions.max[1] - colliders[i].height) < 1e-5);
    assert.ok(json.accessors[primitive.indices].count / 3 <= 950);
    const normals = json.accessors[primitive.attributes.NORMAL];
    const view = json.bufferViews[normals.bufferView];
    let faceted = 0;
    for (let n = 0; n < normals.count; n++) {
      const offset =
        binaryStart +
        (view.byteOffset || 0) +
        (normals.byteOffset || 0) +
        n * (view.byteStride || 12);
      const length = Math.hypot(
        ...[0, 4, 8].map((d) => buffer.readFloatLE(offset + d)),
      );
      assert.ok(Math.abs(length - 1) < 1e-5, "no zero/invalid pole normals");
      if (
        [0, 4, 8].filter((d) => Math.abs(buffer.readFloatLE(offset + d)) > 0.05)
          .length > 1
      )
        faceted++;
    }
    assert.ok(faceted > 20, "actual non-axis low-poly faces");
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AnimationMixer, SkinnedMesh, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

test("exported dinosaur has connected, blended joint surfaces through every clip and crossfade", async () => {
  const bytes = await readFile(new URL("../src/assets/game-models.glb", import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "",
  );
  const mesh = gltf.scene.getObjectByName("dinosaur") as SkinnedMesh;
  const g = mesh.geometry, p = g.attributes.position;
  const weights = g.attributes.skinWeight, joints = g.attributes.skinIndex;
  assert.equal(g.index!.count / 3, 1182);
  assert.deepEqual(mesh.skeleton.bones.map((b) => b.name), [
    "root", "hips", "torso", "head", "tail", "leg-l", "shin-l",
    "leg-r", "shin-r", "arm-l", "arm-r",
  ].map((name) => `dino-${name}`));
  assert.deepEqual(gltf.animations.map((c) => c.name).sort(), ["death", "duck", "hit", "jump", "run"]);

  // Weld by position for topology only; retain all actual vertex copies so
  // differing weights at a coincident seam are caught by animated sampling.
  const groups = new Map<string, number[]>(), parent = Array.from({ length: p.count }, (_, i) => i);
  const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const union = (a: number, b: number) => { parent[find(a)] = find(b); };
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)].map((n) => n.toFixed(6)).join(",");
    const group = groups.get(key) ?? [];
    if (group.length) union(i, group[0]);
    group.push(i); groups.set(key, group);
    const sum = [0, 1, 2, 3].reduce((s, k) => s + weights.getComponent(i, k), 0);
    assert.ok(Math.abs(sum - 1) < 1e-6, "normalized skin weights");
  }
  const edges = new Map<string, number>();
  for (let f = 0; f < g.index!.count; f += 3) {
    const ids = [0, 1, 2].map((k) => g.index!.getX(f + k));
    for (let k = 0; k < 3; k++) union(ids[k], ids[(k + 1) % 3]);
  }
  const blendedPairs = new Set<string>();
  for (let i = 0; i < p.count; i++) {
    if (weights.getY(i) > 0 && weights.getX(i) > 0 && joints.getX(i) !== joints.getY(i)) {
      blendedPairs.add([joints.getX(i), joints.getY(i)].sort((a, b) => a - b).join(","));
    }
  }
  for (const pair of ["2,3", "2,4", "2,5", "2,7", "5,6", "7,8", "2,9", "2,10"])
    assert.ok(blendedPairs.has(pair), `blended bridge ${pair}`);
  const bodyVertex = Array.from({ length: p.count }, (_, i) => i).find((i) => joints.getX(i) === 2)!;
  for (const bone of [3, 4, 5, 6, 7, 8, 9, 10]) {
    assert.ok(Array.from({ length: p.count }, (_, i) => i).some((i) =>
      joints.getX(i) === bone && weights.getX(i) === 1 && find(i) === find(bodyVertex)),
    `bone ${bone} surface joins torso`);
  }
  // Every edge touching a blended ring has two incident triangles.
  const vertexKey = new Map<number, string>();
  for (const [key, ids] of groups) for (const id of ids) vertexKey.set(id, key);
  const edgeKey = (a: number, b: number) => [vertexKey.get(a), vertexKey.get(b)].sort().join("/");
  for (let f = 0; f < g.index!.count; f += 3) {
    const ids = [0, 1, 2].map((k) => g.index!.getX(f + k));
    for (let k = 0; k < 3; k++) {
      const key = edgeKey(ids[k], ids[(k + 1) % 3]);
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  for (let f = 0; f < g.index!.count; f += 3) {
    const ids = [0, 1, 2].map((k) => g.index!.getX(f + k));
    if (!ids.some((i) => weights.getX(i) > 0 && weights.getY(i) > 0)) continue;
    for (let k = 0; k < 3; k++) assert.equal(edges.get(edgeKey(ids[k], ids[(k + 1) % 3])), 2);
  }

  const mixer = new AnimationMixer(mesh), a = new Vector3(), b = new Vector3();
  const checkSeams = () => {
    gltf.scene.updateMatrixWorld(true); mesh.skeleton.update();
    for (const ids of groups.values()) {
      a.fromBufferAttribute(p, ids[0]); mesh.applyBoneTransform(ids[0], a);
      for (const id of ids.slice(1)) {
        b.fromBufferAttribute(p, id); mesh.applyBoneTransform(id, b);
        assert.ok(a.distanceTo(b) < 2e-6, "animated surface seam remains closed");
      }
    }
  };
  for (const clip of gltf.animations) {
    mixer.stopAllAction(); mixer.clipAction(clip).reset().play();
    for (let frame = 0; frame <= 24; frame++) {
      mixer.setTime(clip.duration * frame / 24); checkSeams();
    }
    for (const other of gltf.animations) {
      mixer.stopAllAction();
      mixer.clipAction(clip).reset().setEffectiveWeight(0.5).play();
      mixer.clipAction(other).reset().setEffectiveWeight(0.5).play();
      mixer.setTime(0.21); checkSeams();
    }
  }
  mixer.stopAllAction(); mixer.uncacheRoot(mesh);
  mesh.skeleton.dispose();
  gltf.scene.traverse((o) => { if ("geometry" in o) (o as SkinnedMesh).geometry.dispose(); });
});

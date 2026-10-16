import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AnimationMixer, BufferGeometry, FrontSide, LoopOnce, Material, SkinnedMesh, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { AnimatedDinosaur } from "../src/character.ts";
import { COSMETICS } from "../src/cosmetics.ts";
import type { ModelLibrary } from "../src/models.ts";
import { Simulation } from "../src/simulation.ts";

async function loadDinosaur() {
  const bytes = await readFile(new URL("../src/assets/game-models.glb", import.meta.url));
  return new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "",
  );
}

/** Weld positions only for topology. Keep actual copies to check skin seams. */
function closedSurface(g: BufferGeometry) {
  const p = g.attributes.position, index = g.index!;
  const groups = new Map<string, number[]>(), canonical: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const values = [p.getX(i), p.getY(i), p.getZ(i)];
    assert.ok(values.every(Number.isFinite), `finite vertex ${i}`);
    const key = values.map((n) => n.toFixed(6)).join(",");
    const ids = groups.get(key) ?? [];
    canonical[i] = ids[0] ?? i;
    ids.push(i); groups.set(key, ids);
  }
  const parent = Array.from({ length: p.count }, (_, i) => i);
  const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const edges = new Map<string, { from: number; to: number; face: number }[]>();
  const links = new Map<number, Map<number, number[]>>();
  const faces: number[][] = [], faceKeys = new Set<string>();
  for (let f = 0; f < index.count; f += 3) {
    const ids = [0, 1, 2].map((k) => index.getX(f + k));
    assert.ok(ids.every((i) => Number.isInteger(i) && i >= 0 && i < p.count), "valid face indices");
    const welded = ids.map((i) => canonical[i]);
    assert.equal(new Set(welded).size, 3, `collapsed face ${f / 3}`);
    const faceKey = [...welded].sort((a, b) => a - b).join(",");
    assert.ok(!faceKeys.has(faceKey), `duplicate face ${f / 3}`);
    faceKeys.add(faceKey); faces.push(ids);
    for (let k = 0; k < 3; k++) {
      const from = welded[k], to = welded[(k + 1) % 3], other = welded[(k + 2) % 3];
      parent[find(from)] = find(to);
      const edgeKey = [from, to].sort((a, b) => a - b).join(",");
      const incident = edges.get(edgeKey) ?? [];
      incident.push({ from, to, face: f / 3 }); edges.set(edgeKey, incident);
      const link = links.get(from) ?? new Map<number, number[]>();
      link.set(to, [...(link.get(to) ?? []), other]);
      link.set(other, [...(link.get(other) ?? []), to]);
      links.set(from, link);
    }
  }
  // Check EVERY edge, including rigid torso faces and both ends of each bridge.
  for (const [key, incident] of edges) {
    assert.equal(incident.length, 2, `closed manifold edge ${key}`);
    assert.equal(incident[0].from, incident[1].to,
      `opposite face winding at ${key}, faces ${incident.map((e) => e.face)}`);
    assert.equal(incident[0].to, incident[1].from, `opposite face winding at ${key}`);
  }
  // Two triangles per edge alone still permits a pinched, nonmanifold vertex.
  for (const [vertex, link] of links) {
    for (const neighbours of link.values()) assert.equal(neighbours.length, 2, `vertex link ${vertex}`);
    const seen = new Set<number>(), pending = [link.keys().next().value!];
    while (pending.length) {
      const id = pending.pop()!;
      if (seen.has(id)) continue;
      seen.add(id); pending.push(...link.get(id)!);
    }
    assert.equal(seen.size, link.size, `single manifold fan at vertex ${vertex}`);
  }
  const components = new Map<number, number[][]>();
  for (const face of faces) {
    const root = find(canonical[face[0]]), component = components.get(root) ?? [];
    component.push(face); components.set(root, component);
  }
  const componentOf = (id: number) => find(canonical[id]);
  return { groups, components, componentOf, faces };
}

function outwardVolumes(components: Map<number, number[][]>, positions: Vector3[], label: string) {
  const u = new Vector3(), v = new Vector3(), cross = new Vector3();
  for (const faces of components.values()) {
    const origin = positions[faces[0][0]];
    let volume = 0;
    for (const [ai, bi, ci] of faces) {
      const a = positions[ai], b = positions[bi], c = positions[ci];
      cross.crossVectors(u.subVectors(b, a), v.subVectors(c, a));
      assert.ok(cross.lengthSq() > 1e-18, `${label}: nondegenerate face ${ai},${bi},${ci}`);
      volume += u.subVectors(a, origin).dot(cross) / 6;
    }
    assert.ok(volume > 1e-12, `${label}: outward closed component, volume ${volume}`);
  }
}

function dispose(gltf: Awaited<ReturnType<typeof loadDinosaur>>) {
  const geometries = new Set<BufferGeometry>(), materials = new Set<Material>();
  gltf.scene.traverse((o) => {
    if (!(o instanceof SkinnedMesh) && o.type !== "Mesh") return;
    const mesh = o as SkinnedMesh;
    geometries.add(mesh.geometry);
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(m);
    if (mesh.isSkinnedMesh) mesh.skeleton.dispose();
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
}

test("every dinosaur face forms an outward closed manifold; all skins retain opaque front faces", async () => {
  const gltf = await loadDinosaur();
  try {
    const mesh = gltf.scene.getObjectByName("dinosaur") as SkinnedMesh, g = mesh.geometry;
    const topology = closedSurface(g);
    outwardVolumes(topology.components, Array.from({ length: g.attributes.position.count },
      (_, i) => new Vector3().fromBufferAttribute(g.attributes.position, i)), "bind pose");
    const skins = ["dinosaur", ...COSMETICS.filter((i) => i.category === "dino" && i.id !== "dino-green").map((i) => i.id)];
    assert.equal(skins.length, 24);
    for (const name of skins) {
      const variant = gltf.scene.getObjectByName(name) as SkinnedMesh;
      assert.ok(variant?.isSkinnedMesh, `skin ${name}`);
      assert.deepEqual(variant.geometry.index!.array, g.index!.array, `${name}: shared winding`);
      for (const attribute of ["position", "skinIndex", "skinWeight", "normal"])
        assert.deepEqual(variant.geometry.attributes[attribute].array, g.attributes[attribute].array, `${name}: shared ${attribute}`);
      for (const material of Array.isArray(variant.material) ? variant.material : [variant.material]) {
        assert.equal(material.transparent, false, `${name}: opaque GLB material`);
        assert.equal(material.opacity, 1);
        assert.equal(material.alphaTest, 0);
        assert.equal(material.depthWrite, true);
        assert.equal(material.side, FrontSide, `${name}: no DoubleSide workaround`);
      }
    }

    // These rigid torso regressions passed the former blended-edge-only test.
    const rigidTorsoFace = topology.faces.find((ids) => ids.every((i) =>
      g.attributes.skinIndex.getX(i) === 2 && g.attributes.skinWeight.getX(i) === 1))!;
    const start = topology.faces.indexOf(rigidTorsoFace) * 3;
    const missing = g.clone();
    missing.setIndex(Array.from(g.index!.array).filter((_, i) => i < start || i >= start + 3));
    assert.throws(() => closedSurface(missing), /closed manifold edge/);
    missing.dispose();
    const reversed = g.clone(), index = reversed.index!;
    index.setX(start, rigidTorsoFace[1]); index.setX(start + 1, rigidTorsoFace[0]);
    assert.throws(() => closedSurface(reversed), /opposite face winding/);
    reversed.dispose();
    const duplicate = g.clone();
    duplicate.setIndex([...g.index!.array, ...rigidTorsoFace]);
    assert.throws(() => closedSurface(duplicate), /duplicate face/);
    duplicate.dispose();
    const insideOut = g.clone();
    for (let i = 0; i < insideOut.index!.count; i += 3) {
      const a = insideOut.index!.getX(i);
      insideOut.index!.setX(i, insideOut.index!.getX(i + 1)); insideOut.index!.setX(i + 1, a);
    }
    assert.throws(() => outwardVolumes(closedSurface(insideOut).components,
      Array.from({ length: g.attributes.position.count }, (_, i) => new Vector3().fromBufferAttribute(g.attributes.position, i)),
      "inside out"), /outward closed component/);
    insideOut.dispose();
  } finally { dispose(gltf); }
});

test("all joint seams, faces and components survive every clip and crossfade", async () => {
  const gltf = await loadDinosaur();
  const mesh = gltf.scene.getObjectByName("dinosaur") as SkinnedMesh;
  const g = mesh.geometry, p = g.attributes.position, weights = g.attributes.skinWeight, joints = g.attributes.skinIndex;
  const topology = closedSurface(g), mixer = new AnimationMixer(mesh);
  try {
    assert.equal(g.index!.count / 3, 1182);
    assert.deepEqual(mesh.skeleton.bones.map((b) => b.name), [
      "root", "hips", "torso", "head", "tail", "leg-l", "shin-l",
      "leg-r", "shin-r", "arm-l", "arm-r",
    ].map((name) => `dino-${name}`));
    assert.deepEqual(gltf.animations.map((c) => c.name).sort(), ["death", "duck", "hit", "jump", "run"]);
    const blendedPairs = new Set<string>();
    for (let i = 0; i < p.count; i++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        const weight = weights.getComponent(i, k), joint = joints.getComponent(i, k);
        assert.ok(Number.isFinite(weight) && weight >= 0 && weight <= 1, "valid skin weight");
        assert.ok(Number.isInteger(joint) && joint >= 0 && joint < 11, "valid bone index");
        sum += weight;
      }
      assert.ok(Math.abs(sum - 1) < 1e-6, "normalized skin weights");
      if (weights.getX(i) > 0 && weights.getY(i) > 0 && joints.getX(i) !== joints.getY(i))
        blendedPairs.add([joints.getX(i), joints.getY(i)].sort((a, b) => a - b).join(","));
    }
    assert.deepEqual([...blendedPairs].sort(), ["2,3", "2,4", "2,5", "2,7", "5,6", "7,8", "2,9", "2,10"].sort());
    const bodyVertex = Array.from({ length: p.count }, (_, i) => i).find((i) => joints.getX(i) === 2)!;
    const bodyComponent = topology.componentOf(bodyVertex);
    assert.equal(topology.components.size, 25, "one anatomical body plus 24 closed decorative solids");
    assert.equal(topology.components.get(bodyComponent)!.length, 724, "all fourteen bridges and their body parts stay connected");
    for (let i = 0; i < p.count; i++) if (weights.getX(i) > 0 && weights.getY(i) > 0)
      assert.equal(topology.componentOf(i), bodyComponent, "every blended ring belongs to the anatomical body");
    for (const bone of [3, 4, 5, 6, 7, 8, 9, 10]) {
      const rigidVertices = Array.from({ length: p.count }, (_, i) => i).filter((i) =>
        joints.getX(i) === bone && weights.getX(i) === 1);
      assert.ok(rigidVertices.some((i) => topology.componentOf(i) === topology.componentOf(bodyVertex)),
        `bone ${bone} surface joins torso`);
    }
    const positions = Array.from({ length: p.count }, () => new Vector3());
    const checkPose = (label: string) => {
      gltf.scene.updateMatrixWorld(true); mesh.skeleton.update();
      for (let i = 0; i < p.count; i++) {
        mesh.applyBoneTransform(i, positions[i].fromBufferAttribute(p, i));
        assert.ok(positions[i].toArray().every(Number.isFinite), `${label}: finite skinned vertex`);
      }
      for (const ids of topology.groups.values()) for (const id of ids.slice(1))
        assert.ok(positions[ids[0]].distanceTo(positions[id]) < 2e-6, `${label}: animated surface seam remains closed`);
      outwardVolumes(topology.components, positions, label);
    };
    checkPose("bind pose");
    for (const clip of gltf.animations) {
      mixer.stopAllAction();
      const action = mixer.clipAction(clip).reset().setEffectiveWeight(1).setLoop(LoopOnce, 1).play();
      action.clampWhenFinished = true;
      for (let frame = 0; frame <= 24; frame++) {
        mixer.setTime(clip.duration * frame / 24); checkPose(`${clip.name} frame ${frame}`);
      }
      for (const other of gltf.animations) {
        if (other === clip) continue;
        for (const blend of [0, 0.25, 0.5, 0.75, 1]) {
          mixer.stopAllAction();
          const from = mixer.clipAction(clip).reset().setEffectiveWeight(1 - blend).play();
          const to = mixer.clipAction(other).reset().setEffectiveWeight(blend).play();
          for (const phase of [0, 0.37, 0.79, 1]) {
            from.time = clip.duration * phase; to.time = other.duration * phase;
            mixer.update(0); checkPose(`${clip.name}/${other.name} blend ${blend} phase ${phase}`);
          }
        }
      }
    }
  } finally {
    mixer.stopAllAction(); mixer.uncacheRoot(mesh); dispose(gltf);
  }
});

test("ordinary gameplay keeps the dinosaur fully opaque with front face culling", async () => {
  const gltf = await loadDinosaur(), game = new Simulation(1);
  const mesh = gltf.scene.getObjectByName("dinosaur") as SkinnedMesh;
  const exportedMaterial = mesh.material;
  const actor = new AnimatedDinosaur({ dinosaur: mesh, animations: gltf.animations } as ModelLibrary, game);
  try {
    game.phase = "running";
    for (const [height, crouch] of [[0, 0], [2, 0], [0, 1]]) {
      game.y = game.previousY = height; game.crouch = game.previousCrouch = crouch;
      actor.update(game, 1);
      const material = mesh.material as Material;
      assert.equal(material.opacity, 1, "no immunity means no translucency");
      assert.equal(material.depthWrite, true);
      assert.equal(material.side, FrontSide);
    }
  } finally { actor.dispose(); mesh.material = exportedMaterial; dispose(gltf); }
});

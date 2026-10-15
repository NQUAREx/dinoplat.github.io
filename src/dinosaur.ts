import { BufferGeometry, Mesh, type Material } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import dinosaurUrl from "./assets/dinosaur.glb?url";

// A single self-contained GLB. No texture requests, decoder, rig or runtime engine.
export async function loadDinosaurGeometry(): Promise<BufferGeometry> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let buffer: ArrayBuffer;
  try {
    const response = await fetch(dinosaurUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    buffer = await response.arrayBuffer();
  } catch {
    throw new Error(
      "Не удалось загрузить динозавра. Проверь соединение и попробуй снова.",
    );
  } finally {
    clearTimeout(timeout);
  }
  const gltf = await new GLTFLoader().parseAsync(buffer, "");
  const meshes: Mesh[] = [];
  const materials = new Set<Material>();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((object) => {
    if (object instanceof Mesh) {
      meshes.push(object);
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material])
        materials.add(material);
    }
  });
  try {
    if (meshes.length !== 1)
      throw new Error("Dinosaur GLB must contain one merged mesh.");
    const geometry = meshes[0].geometry
      .clone()
      .applyMatrix4(meshes[0].matrixWorld);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  } finally {
    for (const mesh of meshes) mesh.geometry.dispose();
    for (const material of materials) material.dispose();
  }
}

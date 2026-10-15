import { BufferGeometry, Mesh, type Material } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import modelUrl from "./assets/voxel-models.glb?url";
import { Rules } from "./config";

/** Owns all preloaded poses/variants. No scenes are cloned during gameplay. */
export class ModelLibrary {
  constructor(
    readonly run: BufferGeometry[],
    readonly death: BufferGeometry,
    readonly cacti: BufferGeometry[],
  ) {}
  static async load() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const geometries: BufferGeometry[] = [];
    const materials = new Set<Material>();
    try {
      const response = await fetch(modelUrl, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const gltf = await new GLTFLoader().parseAsync(
        await response.arrayBuffer(),
        "",
      );
      const named = new Map<string, BufferGeometry>();
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const geometry = object.geometry.applyMatrix4(object.matrixWorld);
        if (object.name.startsWith("cactus-"))
          geometry.scale(
            Rules.cactusScale,
            Rules.cactusScale,
            Rules.cactusScale,
          );
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        geometries.push(geometry);
        named.set(object.name, geometry);
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material])
          materials.add(material);
      });
      const requireGeometry = (name: string) => {
        const geometry = named.get(name);
        if (!geometry) throw new Error(`Missing model ${name}`);
        return geometry;
      };
      return new ModelLibrary(
        Array.from({ length: 8 }, (_, i) => requireGeometry(`run-${i}`)),
        requireGeometry("death"),
        Array.from({ length: 6 }, (_, i) => requireGeometry(`cactus-${i}`)),
      );
    } catch {
      for (const geometry of geometries) geometry.dispose();
      throw new Error(
        "Не удалось загрузить динозавра и кактусы. Проверь соединение и попробуй снова.",
      );
    } finally {
      clearTimeout(timeout);
      for (const material of materials) material.dispose();
    }
  }
  dispose() {
    for (const geometry of this.run) geometry.dispose();
    for (const geometry of this.cacti) geometry.dispose();
    this.death.dispose();
  }
}

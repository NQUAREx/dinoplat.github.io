import { BufferGeometry, Mesh, type Material } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import modelUrl from "./assets/biome-models.glb?url";

const REQUIRED_NAMES = [
  ...[
    "tree",
    "tree-lod",
    "dead-tree",
    "dead-tree-lod",
    "rock",
    "grass",
  ].flatMap((kind) => Array.from({ length: 3 }, (_, i) => `${kind}-${i}`)),
  "shrub-0",
  "reed-0",
  "flower-0",
  "log-0",
  "stump-0",
  "tumbleweed-0",
  "bird-body",
  "bird-wing",
];

/** Preloaded original vertex-colour geometry; callers own their render materials.
 * Bases are Y=0; trees 3.4m, dead trees 3.1m, rocks 1.1m, log .65m high.
 * Tumbleweed center Y=.45/radius .45. Bird body height .38m faces render -Z;
 * wing extends +X from its origin (attach at shoulder [+/-.14,.16,0], mirror X).
 */
export class BiomeModels {
  private disposed = false;

  private constructor(
    readonly geometries: ReadonlyMap<string, BufferGeometry>,
  ) {}

  static async load(): Promise<BiomeModels> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    try {
      const response = await fetch(modelUrl, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const gltf = await new GLTFLoader().parseAsync(
        await response.arrayBuffer(),
        "",
      );
      // Collect every owned resource before validation, including non-default scenes.
      for (const scene of gltf.scenes)
        scene.traverse((object) => {
          if (!(object instanceof Mesh)) return;
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            materials.add(material);
        });
      gltf.scene.updateMatrixWorld(true);
      const named = new Map<string, BufferGeometry>();
      gltf.scene.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        if (!object.name || named.has(object.name))
          throw new Error(`Duplicate or unnamed biome mesh: ${object.name}`);
        const geometry = object.geometry;
        if (
          !geometry.index ||
          !geometry.getAttribute("position") ||
          !geometry.getAttribute("normal") ||
          !geometry.getAttribute("color")
        ) {
          throw new Error(`Invalid biome mesh: ${object.name}`);
        }
        geometry.applyMatrix4(object.matrixWorld);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        named.set(object.name, geometry);
      });
      for (const name of REQUIRED_NAMES)
        if (!named.has(name)) throw new Error(`Missing biome model: ${name}`);
      const retained = new Set(named.values());
      for (const geometry of geometries)
        if (!retained.has(geometry)) geometry.dispose();
      return new BiomeModels(named);
    } catch (cause) {
      for (const geometry of geometries) geometry.dispose();
      const error = new Error("Failed to load biome models");
      (error as Error & { cause?: unknown }).cause = cause;
      throw error;
    } finally {
      clearTimeout(timeout);
      for (const material of materials) material.dispose();
    }
  }

  get(name: string): BufferGeometry {
    if (this.disposed) throw new Error("BiomeModels is disposed");
    const geometry = this.geometries.get(name);
    if (!geometry) throw new Error(`Missing biome model: ${name}`);
    return geometry;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const geometry of new Set(this.geometries.values()))
      geometry.dispose();
  }
}

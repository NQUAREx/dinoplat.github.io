import {
  BufferGeometry,
  Mesh,
  SkinnedMesh,
  type AnimationClip,
  type Material,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import modelUrl from "./assets/game-models.glb?url";
import { Rules } from "./config";

/** Owns all preloaded poses/variants. No scenes are cloned during gameplay. */
export class ModelLibrary {
  readonly greenGeometry: BufferGeometry;
  constructor(
    readonly dinosaur: SkinnedMesh,
    readonly animations: AnimationClip[],
    readonly cacti: BufferGeometry[],
    readonly cactusLods: BufferGeometry[],
    readonly coin: BufferGeometry,
    readonly diamond: BufferGeometry,
    readonly heart: BufferGeometry,
    readonly cosmetics: ReadonlyMap<string, BufferGeometry> = new Map(),
  ) {
    this.greenGeometry = dinosaur.geometry;
  }
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
      let dinosaur: SkinnedMesh | undefined;
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const geometry = object.geometry;
        if (object instanceof SkinnedMesh) {
          if (object.name === "dinosaur") dinosaur = object;
        } else geometry.applyMatrix4(object.matrixWorld);
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
      if (!dinosaur || gltf.animations.length !== 5)
        throw new Error("Missing dinosaur rig");
      return new ModelLibrary(
        dinosaur,
        gltf.animations,
        Array.from({ length: 7 }, (_, i) => requireGeometry(`cactus-${i}`)),
        Array.from({ length: 7 }, (_, i) => requireGeometry(`cactus-lod-${i}`)),
        requireGeometry("pickup-coin"),
        requireGeometry("pickup-diamond"),
        requireGeometry("pickup-heart"),
        new Map(
          [
            "dino-white",
            "dino-pink",
            "dino-gold",
            "hat-cap",
            "hat-safari",
            "hat-crown",
            "boots-red",
            "boots-blue",
            "boots-gold",
          ].map((id) => [id, requireGeometry(id)]),
        ),
      );
    } catch {
      for (const geometry of geometries) geometry.dispose();
      throw new Error(
        "Не удалось загрузить модели игры. Проверь соединение и попробуй снова.",
      );
    } finally {
      clearTimeout(timeout);
      for (const material of materials) material.dispose();
    }
  }
  dispose() {
    this.greenGeometry.dispose();
    this.dinosaur.skeleton.dispose();
    for (const geometry of this.cacti) geometry.dispose();
    for (const geometry of this.cactusLods) geometry.dispose();
    this.coin.dispose();
    this.diamond.dispose();
    this.heart.dispose();
    for (const geometry of this.cosmetics.values()) geometry.dispose();
  }
}

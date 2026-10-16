// Offline original low-poly art bundle; no runtime procedural geometry or VOX.
import { writeFile } from "node:fs/promises";
import { Mesh, MeshBasicMaterial, Scene } from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { LowPolyCacti } from "./low-poly-cacti.mjs";
import { LowPolyDinosaur } from "./low-poly-dinosaur.mjs";
import { LowPolyCollectibles } from "./low-poly-collectibles.mjs";

globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
};

class ModelBuilder {
  async build() {
    const scene = new Scene(),
      material = new MeshBasicMaterial({ vertexColors: true });
    const colliders = [];
    const pickups = new LowPolyCollectibles();
    for (const name of ["coin", "diamond", "heart"]) {
      const geometry = pickups.build(name),
        mesh = new Mesh(geometry, material);
      mesh.name = `pickup-${name}`;
      scene.add(mesh);
      console.log(name, geometry.index.count / 3, "triangles");
    }
    const dinosaur = new LowPolyDinosaur().build();
    scene.add(dinosaur.mesh);
    const cacti = new LowPolyCacti();
    for (let i = 0; i < 7; i++) {
      const geometry = cacti.build(i),
        mesh = new Mesh(geometry, material);
      mesh.name = `cactus-${i}`;
      scene.add(mesh);
      const b = geometry.boundingBox;
      colliders.push({
        halfX: +b.max.x.toFixed(5),
        halfZ: +b.max.z.toFixed(5),
        height: +b.max.y.toFixed(5),
      });
      console.log(mesh.name, geometry.index.count / 3, "triangles");
      const low = cacti.build(i, true),
        lowMesh = new Mesh(low, material);
      lowMesh.name = `cactus-lod-${i}`;
      scene.add(lowMesh);
      console.log(lowMesh.name, low.index.count / 3, "triangles");
    }
    const glb = await new GLTFExporter().parseAsync(scene, {
      binary: true,
      onlyVisible: false,
      animations: dinosaur.clips,
    });
    await writeFile(
      new URL("../src/assets/game-models.glb", import.meta.url),
      Buffer.from(glb),
    );
    await writeFile(
      new URL("../src/assets/model-colliders.json", import.meta.url),
      JSON.stringify(colliders),
    );
    scene.traverse((object) => object.geometry?.dispose());
    material.dispose();
    console.log("GLB", glb.byteLength, "bytes", JSON.stringify(colliders));
  }
}
await new ModelBuilder().build();

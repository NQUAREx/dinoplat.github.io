// Original converter for GPLv3 dino3d MagicaVoxel art, not upstream game code.
// Greedy colour-aware surface meshing; interior voxel faces never reach the GPU.
import { readFile, writeFile } from "node:fs/promises";
import {
  BufferGeometry,
  Float32BufferAttribute,
  Uint8BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  Scene,
  Color,
  SRGBColorSpace,
} from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { LowPolyCacti } from "./low-poly-cacti.mjs";
import { LowPolyDinosaur } from "./low-poly-dinosaur.mjs";

globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
};

class VoxelModel {
  constructor(buffer) {
    if (buffer.toString("ascii", 0, 4) !== "VOX ")
      throw new Error("Invalid VOX");
    this.palette = new Uint32Array(256);
    for (let offset = 8; offset + 12 <= buffer.length; ) {
      const id = buffer.toString("ascii", offset, offset + 4),
        length = buffer.readUInt32LE(offset + 4),
        start = offset + 12;
      if (id === "SIZE")
        this.size = [
          buffer.readUInt32LE(start),
          buffer.readUInt32LE(start + 4),
          buffer.readUInt32LE(start + 8),
        ];
      if (id === "XYZI")
        this.voxels = buffer.subarray(
          start + 4,
          start + 4 + buffer.readUInt32LE(start) * 4,
        );
      if (id === "RGBA")
        for (let i = 0; i < 255; i++)
          this.palette[i + 1] = buffer.readUInt32LE(start + i * 4);
      offset = start + length;
    }
    if (!this.voxels || !this.size || !this.palette[1])
      throw new Error("VOX needs XYZI, SIZE and RGBA");
  }
  geometry(height) {
    const [sx, sy, sz] = this.size;
    const grid = new Uint8Array(sx * sy * sz);
    const at = (x, y, z) =>
      x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz
        ? 0
        : grid[(z * sy + y) * sx + x];
    for (let i = 0; i < this.voxels.length; i += 4) {
      const [x, y, z, colour] = this.voxels.subarray(i, i + 4);
      grid[(z * sy + y) * sx + x] = colour;
    }
    const positions = [],
      normals = [],
      colours = [];
    const colour = new Color();
    const emit = (p, normal, index) => {
      // Collectibles only: MagicaVoxel Z is up.
      positions.push(p[0], p[2], -p[1]);
      normals.push(normal[0], normal[2], -normal[1]);
      const rgba = this.palette[index];
      colour.setRGB(
        (rgba & 255) / 255,
        ((rgba >>> 8) & 255) / 255,
        ((rgba >>> 16) & 255) / 255,
        SRGBColorSpace,
      );
      colours.push(colour.r, colour.g, colour.b);
    };
    for (let axis = 0; axis < 3; axis++) {
      const u = (axis + 1) % 3,
        v = (axis + 2) % 3,
        width = this.size[u],
        rows = this.size[v];
      const mask = new Int16Array(width * rows),
        p = [0, 0, 0],
        q = [0, 0, 0];
      q[axis] = 1;
      for (p[axis] = -1; p[axis] < this.size[axis]; p[axis]++) {
        for (p[v] = 0; p[v] < rows; p[v]++)
          for (p[u] = 0; p[u] < width; p[u]++) {
            const a = at(...p),
              b = at(p[0] + q[0], p[1] + q[1], p[2] + q[2]);
            mask[p[v] * width + p[u]] = a && b ? 0 : a ? a : -b;
          }
        for (let j = 0; j < rows; j++)
          for (let i = 0; i < width; ) {
            const value = mask[j * width + i];
            if (!value) {
              i++;
              continue;
            }
            let w = 1,
              h = 1;
            while (i + w < width && mask[j * width + i + w] === value) w++;
            outer: while (j + h < rows) {
              for (let k = 0; k < w; k++)
                if (mask[(j + h) * width + i + k] !== value) break outer;
              h++;
            }
            const a = [0, 0, 0],
              du = [0, 0, 0],
              dv = [0, 0, 0],
              n = [0, 0, 0];
            a[axis] = p[axis] + 1;
            a[u] = i;
            a[v] = j;
            du[u] = w;
            dv[v] = h;
            n[axis] = Math.sign(value);
            const b = a.map((x, d) => x + du[d]),
              c = a.map((x, d) => x + du[d] + dv[d]),
              d = a.map((x, k) => x + dv[k]);
            for (const vertex of value > 0
              ? [a, b, c, a, c, d]
              : [a, c, b, a, d, c])
              emit(vertex, n, Math.abs(value));
            for (let y = 0; y < h; y++)
              for (let x = 0; x < w; x++) mask[(j + y) * width + i + x] = 0;
            i += w;
          }
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
    geometry.setAttribute(
      "color",
      new Uint8BufferAttribute(
        colours.map((value) => Math.round(value * 255)),
        3,
        true,
      ),
    );
    geometry.computeBoundingBox();
    const box = geometry.boundingBox,
      scale = height / (box.max.y - box.min.y);
    geometry.translate(
      -(box.min.x + box.max.x) / 2,
      -box.min.y,
      -(box.min.z + box.max.z) / 2,
    );
    geometry.scale(scale, scale, scale);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const merged = mergeVertices(geometry);
    geometry.dispose();
    return merged;
  }
}

class ModelBuilder {
  async build() {
    const scene = new Scene(),
      material = new MeshBasicMaterial({ vertexColors: true });
    const entries = [
      ["../collectibles/coin", "pickup-coin", 0.75],
      ["../collectibles/diamond", "pickup-diamond", 0.7],
      ["../collectibles/heart", "pickup-heart", 0.7],
    ];
    const colliders = [];
    for (const [file, name, height] of entries) {
      const source = await readFile(
        new URL(`../art/reference-models/${file}.vox`, import.meta.url),
      );
      const geometry = new VoxelModel(source).geometry(height),
        mesh = new Mesh(geometry, material);
      mesh.name = name;
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

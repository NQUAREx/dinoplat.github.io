import { PlaneGeometry, Mesh, type Material } from "three";
import type { RenderPose } from "./render-pose";

export type TerrainHeight = (worldX: number, worldDistance: number) => number;

/** Bounded indexed terrain anchored in world space; flat until heights are set. */
export class TerrainSurface {
  static readonly cellSize = 8;
  readonly geometry = new PlaneGeometry(224, 224, 28, 28);
  readonly mesh: Mesh;
  anchorX = Infinity;
  anchorDistance = Infinity;
  private heightProvider?: TerrainHeight;
  private heightDirty = false;
  constructor(material: Material) {
    this.geometry.rotateX(-Math.PI / 2);
    this.geometry.translate(0, -0.015, 0);
    this.mesh = new Mesh(this.geometry, material);
    this.mesh.renderOrder = -2;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }
  heightAt(x: number, distance: number) {
    return this.heightProvider?.(x, distance) ?? 0;
  }
  setHeightProvider(provider?: TerrainHeight) {
    this.heightProvider = provider;
    this.heightDirty = true;
    this.anchorX = this.anchorDistance = Infinity;
  }
  update(pose: RenderPose) {
    const cell = TerrainSurface.cellSize;
    const x = Math.floor(pose.x / cell) * cell;
    const distance = Math.floor(pose.z / cell) * cell;
    if (x !== this.anchorX || distance !== this.anchorDistance) {
      this.anchorX = x;
      this.anchorDistance = distance;
      if (this.heightProvider || this.heightDirty) {
        const positions = this.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++)
          positions.setY(
            i,
            this.heightAt(x + positions.getX(i), distance - positions.getZ(i)) -
              0.015,
          );
        positions.needsUpdate = true;
        this.geometry.computeVertexNormals();
        this.geometry.computeBoundingBox();
        this.geometry.computeBoundingSphere();
        this.heightDirty = false;
      }
    }
    this.mesh.position.set(x - pose.x, 0, pose.z - distance);
  }
  dispose() {
    this.geometry.dispose();
  }
}

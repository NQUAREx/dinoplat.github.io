import { PlaneGeometry, Mesh, type Material } from "three";
import type { RenderPose } from "./render-pose";

export type TerrainHeight = (worldX: number, worldDistance: number) => number;

/** Bounded indexed terrain anchored in world space; flat until heights are set. */
export class TerrainSurface {
  static readonly cellSize = 8;
  readonly geometry = new PlaneGeometry(192, 192, 24, 24);
  readonly mesh: Mesh;
  anchorX = Infinity;
  anchorDistance = Infinity;
  private heightProvider?: TerrainHeight;
  constructor(material: Material) {
    this.geometry.rotateX(-Math.PI / 2);
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
    this.anchorX = this.anchorDistance = Infinity;
  }
  update(pose: RenderPose) {
    const cell = TerrainSurface.cellSize;
    const x = Math.floor(pose.x / cell) * cell;
    const distance = Math.floor(pose.distance / cell) * cell + 40;
    if (x !== this.anchorX || distance !== this.anchorDistance) {
      this.anchorX = x;
      this.anchorDistance = distance;
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
    }
    this.mesh.position.set(x - pose.x, 0, pose.distance - distance);
  }
  dispose() {
    this.geometry.dispose();
  }
}

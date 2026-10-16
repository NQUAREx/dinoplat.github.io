import { LandscapeField } from "./landscape";
import { TerrainSurface } from "./terrain-surface";
import type { Simulation } from "./simulation";
import type { RenderPose } from "./render-pose";

/** Four bounded, texture-free draws. The surface owns every GPU resource. */
export class Ground {
  readonly surface: TerrainSurface;
  readonly mesh;
  readonly extraMeshes;
  readonly material;

  constructor(field: LandscapeField) {
    this.surface = new TerrainSurface(field);
    this.mesh = this.surface.mesh;
    this.extraMeshes = this.surface.extraMeshes;
    this.material = this.mesh.material;
  }

  update(game: Simulation, pose: RenderPose) {
    this.surface.update(pose);
    // Only pooled transforms animate; support heights stay on the field.
    this.extraMeshes[0].position.y = Math.sin(game.time * 1.1) * 0.012;
    this.extraMeshes[1].position.y = Math.sin(game.time * 0.7) * 0.008;
  }

  dispose() {
    this.surface.dispose();
  }
}

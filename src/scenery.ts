import { MeshLambertMaterial, type Scene, type BufferGeometry } from "three";
import { InstancedObjectType } from "./object-renderer";
import { ObjectKind } from "./world";
import { Biome, Surface, type LandscapeField } from "./landscape";
import type { BiomeModels } from "./biome-models";
import type { ObjectVisibility } from "./camera";
import type { RenderPose } from "./render-pose";

/** Cheap deterministic decorations are rebuilt only on 16m chunk crossings. */
export class Scenery {
  private readonly material = new MeshLambertMaterial({ vertexColors: true });
  private readonly geometries: BufferGeometry[] = [];
  private readonly banks: InstancedObjectType[] = [];
  private readonly x = new Float64Array(1600);
  private readonly z = new Float64Array(1600);
  private readonly y = new Float32Array(1600);
  private readonly angle = new Float32Array(1600);
  private readonly kinds = new Uint8Array(1600);
  private count = 0;
  private anchorX = Infinity;
  private anchorZ = Infinity;
  private seed = 0;
  private revision = -1;
  visible = 0;
  constructor(
    private readonly field: LandscapeField,
    models: BiomeModels,
    scene: Scene,
  ) {
    const names = [
      "grass-0",
      "grass-1",
      "grass-2",
      "shrub-0",
      "flower-0",
      "reed-0",
      "stump-0",
      "rock-0",
      "rock-1",
      "rock-2",
    ];
    for (let i = 0; i < names.length; i++) {
      const geometry = models.get(names[i]).clone();
      if (i >= 7) geometry.scale(0.28, 0.28, 0.28);
      this.geometries.push(geometry);
      this.banks.push(
        new InstancedObjectType(
          ObjectKind.Enemy,
          [geometry],
          this.material,
          scene,
          undefined,
          1600,
        ),
      );
    }
  }
  update(pose: RenderPose, visibility: ObjectVisibility) {
    const ax = Math.floor(pose.x / 16) * 2,
      az = Math.floor(pose.z / 16) * 2;
    if (
      ax !== this.anchorX ||
      az !== this.anchorZ ||
      this.seed !== this.field.seed ||
      this.revision !== this.field.revision
    ) {
      this.anchorX = ax;
      this.anchorZ = az;
      this.seed = this.field.seed;
      this.count = 0;
      this.revision = this.field.revision;
      for (let iz = az - 13; iz <= az + 13; iz++)
        for (let ix = ax - 13; ix <= ax + 13; ix++) {
          const r = this.field.hash(ix, iz, 890),
            x = (ix + 0.15 + 0.7 * r) * 8,
            z = (iz + 0.15 + 0.7 * this.field.hash(ix, iz, 891)) * 8;
          if (this.field.surfaceAt(x, z) !== Surface.Land) continue;
          const biome = this.field.biomeAt(x, z),
            kind =
              biome === Biome.Meadow
                ? r < 0.45
                  ? Math.floor(r * 6)
                  : r < 0.67
                    ? 3
                    : r < 0.85
                      ? 4
                      : 6
                : biome === Biome.Lava
                  ? 8
                  : r < 0.15
                    ? 5
                    : 7 + Math.floor(r * 3);
          const i = this.count++;
          this.x[i] = x;
          this.z[i] = z;
          this.y[i] = this.field.heightAt(x, z);
          this.kinds[i] = kind;
          this.angle[i] = r * 6.283;
        }
    }
    for (const bank of this.banks) bank.begin();
    this.visible = 0;
    for (let i = 0; i < this.count; i++) {
      const x = this.x[i] - pose.x,
        z = this.z[i] - pose.z;
      if (
        x * x + z * z > 75 * 75 ||
        !visibility.intersects(x, z, 0.75, 0.75, 1.1, this.y[i])
      )
        continue;
      this.banks[this.kinds[i]].place(0, x, -z, this.angle[i], this.y[i]);
      this.visible++;
    }
    for (const bank of this.banks) bank.finish();
  }
  dispose() {
    for (const b of this.banks) b.dispose();
    for (const g of this.geometries) g.dispose();
    this.material.dispose();
  }
}

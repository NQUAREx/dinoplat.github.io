import type { Scene, BufferGeometry } from "three";
import type { Ground } from "./ground";
import type { LightingRig } from "./lighting";
import type { ObjectVisibility } from "./camera";
import { InstancedObjectType } from "./object-renderer";
import { ObjectKind } from "./world";

/** Actual cactus silhouettes, no shadow map. Opaque ground resampling avoids
 * accumulated alpha on overlapping faces. Geometry/materials stay shared. */
export class CactusShadows {
  private readonly instances: InstancedObjectType;
  constructor(
    geometries: readonly BufferGeometry[],
    ground: Ground,
    scene: Scene,
  ) {
    this.instances = new InstancedObjectType(
      ObjectKind.Cactus,
      geometries,
      ground.createShadowMaterial(),
      scene,
    );
    for (const mesh of this.instances.meshes) mesh.renderOrder = 1;
  }
  begin() {
    this.instances.begin();
  }
  place(
    variant: number,
    x: number,
    forward: number,
    angle: number,
    halfX: number,
    halfZ: number,
    height: number,
    baseY: number,
    lighting: LightingRig,
    visibility: ObjectVisibility,
  ) {
    if (lighting.shadowStrength <= 0.001) return;
    const reach =
      28 + 3 * (Math.max(0, baseY) + height + 0.015) + halfX + halfZ;
    if (x * x + forward * forward > reach * reach) return;
    const sx = lighting.shadowSlope.x,
      sz = lighting.shadowSlope.y;
    const middle = baseY + height / 2 + 0.015;
    const cx = x - middle * sx,
      cz = forward + middle * sz;
    const hx = halfX + (Math.abs(sx) * height) / 2,
      hz = halfZ + (Math.abs(sz) * height) / 2;
    const closestX = Math.max(0, Math.abs(cx) - hx),
      closestZ = Math.max(0, Math.abs(cz) - hz);
    if (
      closestX * closestX + closestZ * closestZ > 28 * 28 ||
      !visibility.intersects(cx, cz, hx, hz, 0.01, -0.015)
    )
      return;
    this.instances.place(variant, x, -forward, angle, baseY);
  }
  finish() {
    this.instances.finish();
  }
  get visible() {
    return this.instances.visible;
  }
  dispose() {
    this.instances.dispose();
  }
}

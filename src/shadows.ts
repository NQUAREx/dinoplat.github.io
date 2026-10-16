import { Matrix4, Vector3 } from "three";
import type { LightingRig } from "./lighting";
import type { RenderPose } from "./render-pose";
import type { Simulation } from "./simulation";

/** One 256² map at 8Hz/4Hz. Rebase its cached matrix between captures so
 * shadows follow the world continuously rather than jumping at capture time. */
export class CachedShadows {
  updates = 0;
  private valid = false;
  private refresh = false;
  private x = 0;
  private distance = 0;
  private time = -Infinity;
  private seed = 0;
  private revision = -1;
  private source = "";
  private worldRevision = -1;
  private readonly matrix = new Matrix4();
  private readonly translation = new Matrix4();
  private readonly right = new Vector3();
  private readonly up = new Vector3();
  private readonly shift = new Vector3();
  prepare(
    game: Simulation,
    pose: RenderPose,
    light: LightingRig,
    quality: number,
  ) {
    const shadow = light.key.shadow;
    this.refresh =
      !this.valid ||
      !shadow.map ||
      game.seed !== this.seed ||
      game.world.revision !== this.worldRevision ||
      light.revision !== this.revision ||
      light.source !== this.source ||
      Math.abs(pose.x - this.x) > 8 ||
      Math.abs(pose.distance - this.distance) > 8 ||
      game.time < this.time ||
      game.time - this.time >= (quality <= 0.55 ? 0.25 : 0.125);
    shadow.needsUpdate = this.refresh;
    if (this.refresh) {
      this.x = pose.x;
      this.distance = pose.distance;
      this.time = game.time;
      this.seed = game.seed;
      this.worldRevision = game.world.revision;
      this.revision = light.revision;
      this.source = light.source;
      const camera = shadow.camera;
      camera.position.copy(light.key.position);
      camera.lookAt(light.key.target.position);
      camera.updateMatrixWorld();
      this.right.setFromMatrixColumn(camera.matrixWorld, 0);
      this.up.setFromMatrixColumn(camera.matrixWorld, 1);
      const worldZ = -pose.distance - 12;
      const rx = pose.x * this.right.x + worldZ * this.right.z;
      const uy = pose.x * this.up.x + worldZ * this.up.z;
      const tx = (camera.right - camera.left) / shadow.mapSize.x,
        ty = (camera.top - camera.bottom) / shadow.mapSize.y;
      this.shift
        .copy(this.right)
        .multiplyScalar(Math.round(rx / tx) * tx - rx)
        .addScaledVector(this.up, Math.round(uy / ty) * ty - uy);
    } else {
      this.translation.makeTranslation(
        pose.x - this.x,
        0,
        this.distance - pose.distance,
      );
      shadow.matrix.copy(this.matrix).multiply(this.translation);
    }
    light.key.position.add(this.shift);
    light.key.target.position.add(this.shift);
    return this.refresh;
  }
  complete(light: LightingRig) {
    if (this.refresh) {
      this.matrix.copy(light.key.shadow.matrix);
      this.valid = true;
      this.updates++;
    }
  }
  invalidate() {
    this.valid = false;
  }
}

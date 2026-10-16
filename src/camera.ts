import { Box3, Frustum, Matrix4, PerspectiveCamera, Vector3 } from "three";
import { Rules } from "./config";

export const CAMERA_FOV = 50;
export const CAMERA_FAR = 96;
export const FOG_START = 36;
export const FOG_END = 84;
export interface CameraPose {
  offsetX: number;
  height: number;
  distance: number;
  targetY: number;
  targetZ: number;
  fov: number;
}

/** Event-driven camera extension point; allocations happen only at construction. */
export class CameraRig {
  readonly camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.2, CAMERA_FAR);
  private readonly current: CameraPose = {
    offsetX: 0,
    height: 8.5,
    distance: 12,
    targetY: 1,
    targetZ: -5,
    fov: CAMERA_FOV,
  };
  private readonly target: CameraPose = { ...this.current };
  private readonly look = new Vector3();
  private blendTime = 0.35;
  private shake = 0;
  private shakeTime = 0;
  shakeMultiplier = 1;
  constructor(private readonly reducedMotion = false) {
    this.update(0, 0, 0, false);
  }
  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
  setPose(pose: Partial<CameraPose>, seconds = 0.35) {
    if (pose.offsetX !== undefined)
      this.target.offsetX = Math.max(-2, Math.min(2, pose.offsetX));
    if (pose.height !== undefined)
      this.target.height = Math.max(4, pose.height);
    if (pose.distance !== undefined)
      this.target.distance = Math.max(5, pose.distance);
    if (pose.targetY !== undefined) this.target.targetY = pose.targetY;
    if (pose.targetZ !== undefined) this.target.targetZ = pose.targetZ;
    if (pose.fov !== undefined)
      this.target.fov = Math.max(35, Math.min(65, pose.fov));
    this.blendTime = Math.max(0.01, seconds);
  }
  impulse(strength: number, seconds: number) {
    this.shake = Math.min(0.12, Math.max(this.shake, strength));
    this.shakeTime = Math.max(0, seconds);
  }
  update(distance: number, localPlayerX: number, dt: number, walking: boolean) {
    const blend = 1 - Math.exp((-dt * 4) / this.blendTime);
    const p = this.current,
      t = this.target;
    p.offsetX += (t.offsetX - p.offsetX) * blend;
    p.height += (t.height - p.height) * blend;
    p.distance += (t.distance - p.distance) * blend;
    p.targetY += (t.targetY - p.targetY) * blend;
    p.targetZ += (t.targetZ - p.targetZ) * blend;
    p.fov += (t.fov - p.fov) * blend;
    if (Math.abs(p.fov - this.camera.fov) > 0.001) {
      this.camera.fov = p.fov;
      this.camera.updateProjectionMatrix();
    }
    const phase = (distance * Math.PI * 2) / Rules.stepStride;
    const intensity = Math.max(0, Math.min(3, this.shakeMultiplier));
    const bob =
      walking && !this.reducedMotion ? Math.sin(phase) * 0.035 * intensity : 0;
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    const shake =
      this.shakeTime > 0 && !this.reducedMotion
        ? this.shake *
          intensity *
          Math.sin(distance * 21) *
          Math.min(1, this.shakeTime * 8)
        : 0;
    this.camera.position.set(
      p.offsetX + localPlayerX * 0.75 + bob * 0.25 + shake,
      p.height + bob,
      p.distance,
    );
    this.look.set(p.offsetX + localPlayerX * 0.75, p.targetY, p.targetZ);
    this.camera.lookAt(this.look);
    this.camera.rotateZ(bob * 0.025);
    this.camera.updateMatrixWorld();
  }
  reset() {
    this.shake = this.shakeTime = 0;
    this.setPose(
      {
        offsetX: 0,
        height: 8.5,
        distance: 12,
        targetY: 1,
        targetZ: -5,
        fov: CAMERA_FOV,
      },
      0.01,
    );
  }
}

/** Full-volume visibility check; retain partially visible models. */
export class ObjectVisibility {
  private readonly frustum = new Frustum();
  private readonly matrix = new Matrix4();
  private readonly bounds = new Box3();
  update(camera: PerspectiveCamera) {
    this.matrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    this.frustum.setFromProjectionMatrix(this.matrix);
  }
  intersects(
    x: number,
    forward: number,
    halfX: number,
    halfZ: number,
    height: number,
    baseY = 0,
  ) {
    this.bounds.min.set(x - halfX, baseY, -forward - halfZ);
    this.bounds.max.set(x + halfX, baseY + height, -forward + halfZ);
    return this.frustum.intersectsBox(this.bounds);
  }
}

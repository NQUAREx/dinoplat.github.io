import { Box3, Frustum, Matrix4, PerspectiveCamera } from "three";
import { CUBE_SIZE } from "./simulation";

export const CAMERA_FOV = 10;
export const CAMERA_FAR = 30;
export const CAMERA_FOLLOW = 0.75;
export const FOG_START = 24;
export const FOG_END = 56;

/** Close portrait framing. Follow X instead of pulling away to fit the road. */
export function frameCamera(camera: PerspectiveCamera, aspect: number) {
  camera.aspect = aspect;
  camera.fov = CAMERA_FOV;
  camera.near = 0.2;
  camera.far = CAMERA_FAR;
  camera.position.set(0, 10, 12);
  camera.lookAt(0, 1, -5);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

/** Reused bounds: keep a cube until its entire volume leaves the camera. */
export class ObstacleVisibility {
  private readonly frustum = new Frustum();
  private readonly matrix = new Matrix4();
  private readonly bounds = new Box3();
  update(camera: PerspectiveCamera) {
    camera.updateMatrixWorld();
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.matrix);
  }
  intersects(x: number, rowZ: number) {
    const half = CUBE_SIZE / 2;
    this.bounds.min.set(x - half, 0, -rowZ - half);
    this.bounds.max.set(x + half, CUBE_SIZE, -rowZ + half);
    return this.frustum.intersectsBox(this.bounds);
  }
}

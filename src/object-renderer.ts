import * as THREE from "three";
import { ObjectKind } from "./world";
import { Rules } from "./config";

/** Register more item/enemy renderers without changing spawning or collisions. */
export class InstancedObjectType {
  readonly meshes: THREE.InstancedMesh[];
  private readonly counts: Uint16Array;
  private readonly uploadRanges: { start: number; count: number }[];
  private readonly matrix = new THREE.Matrix4();
  private lastAngle = NaN;
  constructor(
    readonly kind: ObjectKind,
    geometries: readonly THREE.BufferGeometry[],
    material: THREE.Material,
    scene: THREE.Scene,
  ) {
    this.counts = new Uint16Array(geometries.length);
    this.uploadRanges = geometries.map(() => ({ start: 0, count: 0 }));
    this.meshes = geometries.map((geometry) => {
      const mesh = new THREE.InstancedMesh(geometry, material, Rules.poolSize);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
      return mesh;
    });
  }
  begin() {
    this.counts.fill(0);
  }
  place(variant: number, x: number, z: number, angle: number, y = 0) {
    const mesh = this.meshes[variant];
    if (!mesh) return;
    // Shared pickup phase: compute its rotation once per bank/frame, not once
    // per coin. The matrix's translation is still updated for every instance.
    if (angle !== this.lastAngle) {
      this.matrix.makeRotationY(angle);
      this.lastAngle = angle;
    }
    this.matrix.setPosition(x, y, z);
    mesh.setMatrixAt(this.counts[variant]++, this.matrix);
  }
  finish() {
    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i],
        count = this.counts[i];
      mesh.count = count;
      mesh.visible = count > 0;
      if (!count) continue;
      const range = this.uploadRanges[i];
      range.count = count * 16;
      // WebGL clears updateRanges after upload. Reinsert the same cached object,
      // never addUpdateRange (which allocates), and upload only visible matrices.
      mesh.instanceMatrix.updateRanges[0] = range;
      mesh.instanceMatrix.updateRanges.length = 1;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  get visible() {
    let total = 0;
    for (const count of this.counts) total += count;
    return total;
  }
  dispose() {
    for (const mesh of this.meshes) {
      mesh.removeFromParent();
      mesh.dispose();
    }
  }
}

export class ObjectRendererRegistry {
  private readonly byKind = new Map<ObjectKind, InstancedObjectType>();
  private readonly types: InstancedObjectType[] = [];
  register(type: InstancedObjectType) {
    if (this.byKind.has(type.kind)) throw new Error("Duplicate world renderer");
    this.byKind.set(type.kind, type);
    this.types.push(type);
  }
  get(kind: ObjectKind) {
    return this.byKind.get(kind);
  }
  begin() {
    for (const type of this.types) type.begin();
  }
  finish() {
    for (const type of this.types) type.finish();
  }
  get visible() {
    let total = 0;
    for (const type of this.types) total += type.visible;
    return total;
  }
  dispose() {
    for (const type of this.types) type.dispose();
    this.byKind.clear();
    this.types.length = 0;
  }
}

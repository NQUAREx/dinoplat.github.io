// Original editable model source. Built offline; no procedural modelling in RAF.
import {
  BufferGeometry,
  CircleGeometry,
  ConeGeometry,
  Color,
  CylinderGeometry,
  IcosahedronGeometry,
  LatheGeometry,
  SphereGeometry,
  Float32BufferAttribute,
  Uint8BufferAttribute,
  Vector2,
  Vector3,
  Quaternion,
} from "three";
import {
  mergeGeometries,
  mergeVertices,
} from "three/addons/utils/BufferGeometryUtils.js";

export class LowPolyCacti {
  parts = [];
  variant = 0;
  spineSerial = 0;
  add(
    geometry,
    colour,
    x = 0,
    y = 0,
    z = 0,
    sx = 1,
    sy = 1,
    sz = 1,
    striped = false,
  ) {
    if (geometry.index) {
      const source = geometry;
      geometry = source.toNonIndexed();
      source.dispose();
    }
    // Lathe pole quads contain zero-area triangles. Remove them offline, along
    // with their zero normals, before indexing/exporting the final asset.
    const positions = geometry.attributes.position,
      sourceNormals = geometry.attributes.normal;
    const clean = [],
      normals = [],
      colours = [],
      c = new Color(colour);
    const a = new Vector3(),
      b = new Vector3(),
      edge = new Vector3();
    for (let i = 0; i < positions.count; i += 3) {
      a.fromBufferAttribute(positions, i);
      b.fromBufferAttribute(positions, i + 1).sub(a);
      edge.fromBufferAttribute(positions, i + 2).sub(a);
      if (b.cross(edge).lengthSq() < 1e-14) continue;
      for (let n = i; n < i + 3; n++) {
        clean.push(positions.getX(n), positions.getY(n), positions.getZ(n));
        normals.push(
          sourceNormals.getX(n),
          sourceNormals.getY(n),
          sourceNormals.getZ(n),
        );
        const angle = Math.atan2(positions.getX(n), positions.getZ(n));
        const tint = striped ? 0.9 + 0.1 * Math.cos(angle * 4) : 1;
        colours.push(
          Math.round(c.r * tint * 255),
          Math.round(c.g * tint * 255),
          Math.round(c.b * tint * 255),
        );
      }
    }
    geometry.dispose();
    geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(clean, 3));
    geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
    geometry.setAttribute("color", new Uint8BufferAttribute(colours, 3, true));
    geometry.scale(sx, sy, sz);
    geometry.translate(x, y, z);
    this.parts.push(geometry);
  }
  stem(x, y, height, radius, colour = 0x62ce3c, z = 0) {
    // Broad bevels and six-sided facets, not stacked cubes/voxel surfaces.
    const points = [
      [0, 0],
      [radius * 0.86, 0],
      [radius, height * 0.1],
      [radius * 0.96, height * 0.78],
      [radius * 0.7, height * 0.94],
      [0, height],
    ];
    this.add(
      new LatheGeometry(
        points.map((p) => new Vector2(...p)),
        8,
      ),
      colour,
      x,
      y,
      z,
      1,
      1,
      1,
      true,
    );
    const rows = height > 1.3 ? 3 : 2;
    for (let row = 0; row < rows; row++) {
      const t = 0.2 + (row * 0.46) / (rows - 1);
      const r =
        radius * (1 - (0.04 * (t - 0.1)) / 0.68) * Math.cos(Math.PI / 8);
      for (let side = 0; side < 4; side++) {
        const theta = ((side * 2 + (row % 2) + 0.5) * Math.PI) / 4;
        const normal = new Vector3(Math.sin(theta), 0, Math.cos(theta));
        this.spine(
          new Vector3(x + normal.x * r, y + t * height, z + normal.z * r),
          normal,
        );
      }
    }
  }
  spine(point, normal) {
    // A raised five-sided areole + a tiny solid triangular spine, merged into
    // the same mesh/material. No decal planes fighting with the green surface.
    const spot = new CircleGeometry(0.045, 5);
    spot.applyQuaternion(
      new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal),
    );
    const base = point.clone().addScaledVector(normal, 0.006);
    this.add(spot, 0xd2e889, base.x, base.y, base.z);
    const style = (this.spineSerial++ + this.variant) % 3;
    const thorn =
      style === 2
        ? new IcosahedronGeometry(0.065, 0)
        : new ConeGeometry(
            style === 1 ? 0.04 : 0.022,
            style === 1 ? 0.065 : 0.1,
            style === 1 ? 5 : 3,
            1,
          );
    thorn.applyQuaternion(
      new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), normal),
    );
    const centre = base.addScaledVector(normal, 0.05);
    this.add(
      thorn,
      [0xfff2c3, 0xffdf50, 0xb7e958][style],
      centre.x,
      centre.y,
      centre.z,
    );
  }
  arm(x, y, tip, radius, colour = 0x43b83a) {
    const start = new Vector3(0, y, 0),
      end = new Vector3(x, y + 0.12, 0);
    const length = start.distanceTo(end);
    const bridge = new CylinderGeometry(radius, radius, length, 6, 1);
    bridge.applyQuaternion(
      new Quaternion().setFromUnitVectors(
        new Vector3(0, 1, 0),
        end.clone().sub(start).normalize(),
      ),
    );
    bridge.translate(x / 2, y + 0.06, 0);
    this.add(bridge, colour);
    this.stem(x, y, tip - y, radius, colour);
  }
  flower(x, y, z = 0) {
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2) / 5;
      this.add(
        new IcosahedronGeometry(0.14, 0),
        0xff638d,
        x + Math.cos(angle) * 0.12,
        y,
        z + Math.sin(angle) * 0.12,
        1,
        0.55,
        1,
      );
    }
    this.add(new IcosahedronGeometry(0.1, 0), 0xffd34d, x, y + 0.06, z);
  }
  build(index) {
    this.parts = [];
    this.variant = index;
    this.spineSerial = 0;
    switch (index) {
      case 0: // Classic two-arm saguaro.
        this.stem(0, 0, 2.3, 0.32);
        this.arm(-0.62, 0.85, 1.65, 0.21);
        this.arm(0.62, 1.15, 2, 0.22, 0x7ddd45);
        break;
      case 1: // Tall asymmetric fork.
        this.stem(0, 0, 3.1, 0.3, 0x45bf53);
        this.arm(-0.64, 1.5, 2.65, 0.21);
        this.arm(0.56, 0.8, 1.85, 0.23, 0x84d949);
        break;
      case 2: // Squat barrel with a crown blossom.
        this.stem(0, 0, 1.95, 0.63, 0x7bd641);
        this.flower(0, 1.94);
        break;
      case 3: // Flowering three-arm shrub.
        this.stem(0, 0, 2.2, 0.32, 0x3ab863);
        this.arm(-0.57, 0.6, 1.55, 0.24);
        this.arm(0.58, 1, 1.9, 0.22, 0x76da4d);
        this.flower(0, 2.2);
        break;
      case 4: // Twin towers.
        this.stem(-0.28, 0, 3.1, 0.31, 0x72cb39);
        this.stem(0.3, 0, 2.5, 0.32, 0x43b94d);
        this.arm(0.74, 1.05, 1.85, 0.18);
        break;
      case 5: // Prickly pear, broad faceted pads.
        this.stem(0, 0, 0.95, 0.26, 0x3eb951);
        for (const [x, y, sx, sy] of [
          [0, 1.12, 0.46, 0.65],
          [-0.44, 1.55, 0.36, 0.48],
          [0.42, 1.7, 0.34, 0.5],
        ]) {
          this.add(
            new SphereGeometry(1, 8, 4),
            x < 0 ? 0x7bdc52 : 0x4ac652,
            x,
            y,
            0,
            sx,
            sy,
            0.23,
          );
          for (const axis of [
            [1, 0, 0],
            [-1, 0, 0],
            [0, 0, 1],
            [0, 0, -1],
          ]) {
            const n = new Vector3(...axis);
            this.spine(new Vector3(x + n.x * sx, y, n.z * 0.23), n);
          }
        }
        this.flower(0.42, 2.1);
        break;
      case 6: // Candelabra with three upright branches.
        this.stem(0, 0, 2.5, 0.27, 0x54c943);
        this.arm(-0.65, 0.6, 2.1, 0.24, 0x86db48);
        this.arm(0.65, 0.8, 1.75, 0.25, 0x36af55);
        break;
      default:
        throw new Error("Unknown cactus");
    }
    // Match previous six gameplay envelopes; seventh fits the same size family.
    const bounds = [
      [0.35385, 0.22115, 1.15],
      [0.47692, 0.14904, 1.55],
      [0.30288, 0.14135, 1.05],
      [0.34074, 0.21296, 1.15],
      [0.47692, 0.14904, 1.55],
      [0.30288, 0.14135, 1.05],
      [0.42, 0.2, 1.25],
    ][index];
    const merged = mergeGeometries(this.parts);
    for (const part of this.parts) part.dispose();
    merged.computeBoundingBox();
    const b = merged.boundingBox;
    merged.translate(
      -(b.min.x + b.max.x) / 2,
      -b.min.y,
      -(b.min.z + b.max.z) / 2,
    );
    merged.scale(
      (2 * bounds[0]) / (b.max.x - b.min.x),
      bounds[2] / (b.max.y - b.min.y),
      (2 * bounds[1]) / (b.max.z - b.min.z),
    );
    this.parts = [merged];
    for (let i = 0; i < index + 2; i++) {
      const angle = i * 2.399963 + index * 0.71;
      const size = 0.025 + ((i * 7 + index * 3) % 11) * 0.003;
      // Corner-biased scatter stays outside the barrel's rounded foot while
      // remaining inside its original rectangular culling envelope.
      const x =
        Math.sign(Math.cos(angle)) *
        (bounds[0] - size * 1.4) *
        (0.88 + 0.11 * Math.abs(Math.sin(angle * 1.7)));
      const z =
        Math.sign(Math.sin(angle + 0.1)) *
        (bounds[1] - size) *
        (0.88 + 0.11 * Math.abs(Math.cos(angle * 1.3)));
      const stone = new IcosahedronGeometry(1, 0);
      stone.scale(size * 1.4, size * 0.75, size);
      stone.computeBoundingBox();
      stone.translate(0, -stone.boundingBox.min.y, 0);
      this.add(stone, [0xb6a48b, 0xdac39c, 0x948e82][i % 3], x, 0, z);
    }
    const decorated = mergeGeometries(this.parts);
    for (const part of this.parts) part.dispose();
    const geometry = mergeVertices(decorated);
    decorated.dispose();
    geometry.computeBoundingBox();
    return geometry;
  }
}

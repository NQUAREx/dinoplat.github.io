// Original offline faceted pickup art. One indexed vertex-colour mesh per type.
import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ExtrudeGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  Shape,
  Uint8BufferAttribute,
  Vector2,
} from "three";
import {
  mergeGeometries,
  mergeVertices,
} from "three/addons/utils/BufferGeometryUtils.js";

export class LowPolyCollectibles {
  parts = [];
  add(geometry, colour, x = 0, y = 0, z = 0) {
    geometry.deleteAttribute("uv");
    if (geometry.index) {
      const original = geometry;
      geometry = original.toNonIndexed();
      original.dispose();
    }
    geometry.translate(x, y, z);
    const c = new Color(colour),
      count = geometry.attributes.position.count,
      colors = new Uint8Array(count * 3);
    for (let i = 0; i < count; i++)
      colors.set([c.r * 255, c.g * 255, c.b * 255], i * 3);
    geometry.setAttribute("color", new Uint8BufferAttribute(colors, 3, true));
    this.parts.push(geometry);
  }
  coin() {
    const profile = [
      [0, -0.13],
      [0.31, -0.13],
      [0.375, -0.075],
      [0.375, 0.075],
      [0.31, 0.13],
      [0, 0.13],
    ];
    this.add(
      new LatheGeometry(
        profile.map((p) => new Vector2(...p)),
        12,
      ).rotateX(Math.PI / 2),
      0xe8a42b,
      0,
      0.375,
      0,
    );
    for (const side of [-1, 1]) {
      this.add(
        new CircleGeometry(0.29, 12).rotateY(side < 0 ? Math.PI : 0),
        0xffd957,
        0,
        0.375,
        side * 0.131,
      );
      for (const x of [-0.065, 0.065])
        this.add(
          new BoxGeometry(0.045, 0.32, 0.018).rotateZ(-0.32),
          0xfff2b4,
          x,
          0.375,
          side * 0.146,
        );
    }
  }
  diamond() {
    const positions = [],
      colors = [],
      palette = [0x25b9dd, 0x6eeaff, 0xa6f5ff, 0x1a87bd];
    const rings = [
      [0, 0, 0],
      [0.42, 0.34, 0.25],
      [0.59, 0.24, 0.18],
      [0.7, 0.13, 0.1],
    ];
    const point = (r, n) => [
      Math.sin((n * Math.PI) / 4) * rings[r][1],
      rings[r][0],
      Math.cos((n * Math.PI) / 4) * rings[r][2],
    ];
    const tri = (a, b, c, colour) => {
      const tint = new Color(colour);
      for (const p of [a, b, c]) {
        positions.push(...p);
        colors.push(tint.r * 255, tint.g * 255, tint.b * 255);
      }
    };
    // Ring winding is outward, sharp facet normals are computed once offline.
    for (let r = 0; r < 3; r++)
      for (let n = 0; n < 8; n++) {
        const a = point(r, n),
          b = point(r + 1, n),
          c = point(r + 1, n + 1),
          d = point(r, n + 1);
        tri(a, c, b, palette[(n + r) % 4]);
        if (r) tri(a, d, c, palette[(n + r) % 4]);
      }
    for (let n = 0; n < 8; n++)
      tri([0, 0.7, 0], point(3, n), point(3, n + 1), 0xc9fbff);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new Uint8BufferAttribute(colors, 3, true));
    geometry.computeVertexNormals();
    this.parts.push(geometry);
  }
  heart() {
    const shape = new Shape();
    const points = [
      [0, 0],
      [-0.29, 0.25],
      [-0.34, 0.46],
      [-0.28, 0.6],
      [-0.13, 0.64],
      [0, 0.54],
      [0.13, 0.64],
      [0.28, 0.6],
      [0.34, 0.46],
      [0.29, 0.25],
    ];
    points.forEach((p, i) => (i ? shape.lineTo(...p) : shape.moveTo(...p)));
    shape.closePath();
    const geometry = new ExtrudeGeometry(shape, {
      depth: 0.22,
      steps: 1,
      bevelEnabled: true,
      bevelSize: 0.025,
      bevelThickness: 0.04,
      bevelSegments: 1,
      curveSegments: 1,
    });
    geometry.translate(0, 0.03, -0.11);
    this.add(geometry, 0xff5975);
    const glint = new Shape();
    glint.moveTo(-0.18, 0.43);
    glint.lineTo(-0.13, 0.54);
    glint.lineTo(-0.05, 0.5);
    glint.closePath();
    this.add(
      new ExtrudeGeometry(glint, {
        depth: 0.008,
        bevelEnabled: false,
        curveSegments: 1,
      }),
      0xffc9d0,
      0,
      0,
      0.153,
    );
  }
  build(name) {
    this.parts = [];
    this[name]();
    const merged = mergeGeometries(this.parts);
    for (const p of this.parts) p.dispose();
    const indexed = mergeVertices(merged);
    merged.dispose();
    indexed.computeBoundingBox();
    const box = indexed.boundingBox,
      height = name === "coin" ? 0.75 : 0.7;
    const scale = height / (box.max.y - box.min.y);
    indexed.translate(
      -(box.min.x + box.max.x) / 2,
      -box.min.y,
      -(box.min.z + box.max.z) / 2,
    );
    indexed.scale(scale, scale, scale);
    indexed.computeBoundingBox();
    indexed.computeBoundingSphere();
    console.log(`pickup-${name}`, indexed.index.count / 3, "triangles");
    return indexed;
  }
}

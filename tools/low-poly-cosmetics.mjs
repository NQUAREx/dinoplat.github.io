// Original offline accessories and skin palettes; no runtime geometry authoring.
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Mesh,
  SkinnedMesh,
  Uint8BufferAttribute,
} from "three";
import {
  mergeGeometries,
  mergeVertices,
} from "three/addons/utils/BufferGeometryUtils.js";

export class LowPolyCosmetics {
  parts = [];
  part(geometry, colour, x = 0, y = 0, z = 0) {
    geometry.deleteAttribute("uv");
    if (geometry.index) {
      const original = geometry;
      geometry = original.toNonIndexed();
      original.dispose();
    }
    geometry.translate(x, y, z);
    const c = new Color(colour),
      colours = new Uint8Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colours.length; i += 3)
      colours.set([c.r * 255, c.g * 255, c.b * 255], i);
    geometry.setAttribute("color", new Uint8BufferAttribute(colours, 3, true));
    this.parts.push(geometry);
  }
  build(id, material) {
    this.parts = [];
    if (id === "hat-cap") {
      this.part(
        new CylinderGeometry(0.15, 0.29, 0.22, 8),
        0xff704c,
        0,
        0.43,
        -0.08,
      );
      this.part(new BoxGeometry(0.48, 0.055, 0.32), 0xe44748, 0, 0.32, -0.29);
      this.part(new BoxGeometry(0.1, 0.09, 0.025), 0xfff2c3, 0, 0.44, -0.26);
    } else if (id === "hat-safari") {
      this.part(
        new CylinderGeometry(0.42, 0.42, 0.055, 8),
        0xffd17b,
        0,
        0.34,
        -0.08,
      );
      this.part(
        new CylinderGeometry(0.19, 0.27, 0.23, 8),
        0xf1ba63,
        0,
        0.47,
        -0.08,
      );
      this.part(
        new CylinderGeometry(0.27, 0.28, 0.075, 8),
        0x925e42,
        0,
        0.38,
        -0.08,
      );
    } else if (id === "hat-crown") {
      this.part(
        new CylinderGeometry(0.26, 0.28, 0.15, 6, 1, true),
        0xffce43,
        0,
        0.4,
        -0.08,
      );
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        this.part(
          new ConeGeometry(0.075, 0.2, 3),
          0xffe577,
          Math.sin(a) * 0.25,
          0.55,
          Math.cos(a) * 0.25 - 0.08,
        );
      }
      this.part(new BoxGeometry(0.085, 0.09, 0.04), 0x36d8ee, 0, 0.42, -0.35);
    } else {
      const colour =
        id === "boots-red"
          ? 0xff6658
          : id === "boots-blue"
            ? 0x32bbef
            : 0xf6bd40;
      this.part(new BoxGeometry(0.34, 0.11, 0.55), 0xfff2dc, 0, -0.28, -0.15);
      this.part(new BoxGeometry(0.3, 0.15, 0.48), colour, 0, -0.19, -0.14);
      this.part(
        new CylinderGeometry(0.13, 0.14, id === "boots-gold" ? 0.26 : 0.12, 6),
        colour,
        0,
        -0.065,
        -0.015,
      );
      for (const z of [-0.16, -0.23])
        this.part(new BoxGeometry(0.18, 0.018, 0.035), 0xfff9e8, 0, -0.105, z);
    }
    const merged = mergeGeometries(this.parts);
    this.parts.forEach((p) => p.dispose());
    const geometry = mergeVertices(merged);
    merged.dispose();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new Mesh(geometry, material);
    mesh.name = id;
    console.log(id, geometry.index.count / 3, "triangles");
    return mesh;
  }
  skin(dinosaur, id, material) {
    const geometry = dinosaur.geometry.clone(),
      colours = geometry.attributes.color;
    const tint = new Color();
    for (let i = 0; i < colours.count; i++) {
      const r = colours.getX(i),
        g = colours.getY(i),
        b = colours.getZ(i);
      // Recolour green skin only. Keep eyes, teeth, belly, mouth and dorsal plates.
      if (g > r * 1.45 && g > b * 1.2) {
        const light = Math.min(1, 0.48 + g * 0.65);
        tint
          .set(id === "dino-white" ? 0xeaf6ff : 0xff84bb)
          .multiplyScalar(light);
        colours.setXYZ(i, tint.r, tint.g, tint.b);
      }
    }
    const mesh = new SkinnedMesh(geometry, material);
    mesh.name = id;
    mesh.bind(dinosaur.skeleton, dinosaur.bindMatrix);
    return mesh;
  }
}

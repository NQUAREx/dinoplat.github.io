// Original offline accessories and skin palettes; no runtime geometry authoring.
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  Mesh,
  SkinnedMesh,
  Uint8BufferAttribute,
} from "three";
import {
  mergeGeometries,
  mergeVertices,
} from "three/addons/utils/BufferGeometryUtils.js";
import { readFile } from "node:fs/promises";
export const EXTRA_COSMETICS = JSON.parse(
  await readFile(
    new URL("../src/assets/wardrobe-catalog.json", import.meta.url),
    "utf8",
  ),
);

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
    const extra = EXTRA_COSMETICS.find((item) => item.id === id);
    if (extra) this.extra(extra);
    else if (id === "hat-cap") {
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
      this.part(new BoxGeometry(0.4, 0.16, 0.68), 0xfff2dc, 0, -0.31, -0.17);
      this.part(new BoxGeometry(0.36, 0.18, 0.6), colour, 0, -0.2, -0.17);
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
    const geometry = new BufferGeometry(),
      extra = EXTRA_COSMETICS.find((item) => item.id === id);
    for (const [name, attribute] of Object.entries(
      dinosaur.geometry.attributes,
    ))
      geometry.setAttribute(
        name,
        name === "color" ? attribute.clone() : attribute,
      );
    geometry.setIndex(dinosaur.geometry.index);
    const colours = geometry.attributes.color;
    const tint = new Color();
    for (let i = 0; i < colours.count; i++) {
      const r = colours.getX(i),
        g = colours.getY(i),
        b = colours.getZ(i);
      // Recolour green skin only. Keep eyes, teeth, belly, mouth and dorsal plates.
      if (g > r * 1.45 && g > b * 1.2) {
        const light = Math.min(1, 0.48 + g * 0.65);
        tint
          .set(
            extra
              ? extra.primary
              : id === "dino-white"
                ? 0xeaf6ff
                : id === "dino-gold"
                  ? 0xffcc40
                  : 0xff84bb,
          )
          .multiplyScalar(light);
        if (extra) {
          const p = geometry.attributes.position;
          const stripe =
            extra.style % 3 === 0
              ? Math.sin(p.getY(i) * 22) > 0.5
              : extra.style % 3 === 1
                ? Math.sin(p.getX(i) * 27 + p.getZ(i) * 19) > 0.7
                : Math.sin(p.getX(i) * 39) * Math.cos(p.getY(i) * 29) > 0.6;
          if (stripe) tint.set(extra.accent).multiplyScalar(light);
        }
        colours.setXYZ(i, tint.r, tint.g, tint.b);
      }
    }
    const mesh = new SkinnedMesh(geometry, material);
    mesh.name = id;
    mesh.bind(dinosaur.skeleton, dinosaur.bindMatrix);
    return mesh;
  }
  extra(item) {
    const i = item.style,
      c = item.primary,
      a = item.accent;
    const box = (w, h, d, x, y, z, color = c) =>
      this.part(new BoxGeometry(w, h, d), color, x, y, z);
    const cone = (r, h, x, y, z, color = a, n = 6) =>
      this.part(new ConeGeometry(r, h, n), color, x, y, z);
    const cylinder = (r, h, x, y, z, color = c, n = 8) =>
      this.part(new CylinderGeometry(r, r, h, n), color, x, y, z);
    if (item.category === "watch") {
      cylinder(0.12, 0.1, 0, -0.13, -0.12, c, 8);
      box(0.18, 0.055, 0.045, 0, -0.08, -0.24, a);
      const caseGeometry =
        i % 3 === 0
          ? new BoxGeometry(0.22, 0.24, 0.07)
          : new CylinderGeometry(0.13, 0.13, 0.07, 4 + (i % 5)).rotateX(
              Math.PI / 2,
            );
      this.part(caseGeometry, a, 0, -0.13, -0.255);
      box(0.15, 0.16, 0.012, 0, -0.13, -0.299, i % 2 ? 0x24374d : 0xfff2c3);
      if (i % 4 === 0) {
        box(0.025, 0.09, 0.008, 0, -0.105, -0.31, a);
        box(0.065, 0.022, 0.008, 0.025, -0.14, -0.31, a);
      } else
        for (let n = 0; n < 3; n++)
          box(
            0.024,
            0.04 + ((n + i) % 3) * 0.018,
            0.008,
            (n - 1) * 0.043,
            -0.13,
            -0.31,
            a,
          );
      box(0.04, 0.055, 0.045, 0.125, -0.1, -0.255, c);
      if (i % 2) box(0.04, 0.04, 0.045, -0.125, -0.18, -0.255, c);
    } else if (item.category === "gloves") {
      cylinder(0.115, 0.12, 0, -0.115, -0.1, a, 6);
      this.part(
        new IcosahedronGeometry(1, i % 5 === 0 ? 1 : 0).scale(
          0.135,
          0.15,
          0.14,
        ),
        c,
        0,
        -0.235,
        -0.14,
      );
      for (let n = 0; n < 3; n++) {
        box(0.055, 0.075, 0.09, (n - 1) * 0.07, -0.31, -0.19, c);
        if (i % 4 === 0) cone(0.028, 0.1, (n - 1) * 0.07, -0.19, -0.23, a, 4);
      }
      box(0.065, 0.09, 0.09, -0.125, -0.22, -0.16, a);
      if (i % 3 === 0) box(0.1, 0.04, 0.025, 0, -0.23, -0.285, a);
      if (i % 3 === 1)
        this.part(new IcosahedronGeometry(0.055, 0), a, 0, -0.23, -0.28);
    } else if (item.category === "boots") {
      box(0.42, 0.16, 0.7, 0, -0.31, -0.17, 0xfff2dc);
      box(0.37, 0.19, 0.61, 0, -0.2, -0.17, c);
      cylinder(0.14, 0.14 + (i % 3) * 0.04, 0, -0.06, -0.015, a, 6);
      if (i % 5 === 0)
        for (const x of [-0.16, 0.16])
          cylinder(0.08, 0.07, x, -0.34, -0.17, a, 6);
      if (i % 5 === 1)
        for (const x of [-0.18, 0.18]) cone(0.07, 0.24, x, -0.12, 0.12, a);
      if (i % 5 === 2) box(0.52, 0.05, 0.75, 0, -0.21, -0.19, a);
      if (i % 5 === 3)
        for (let n = 0; n < 3; n++)
          box(0.21, 0.02, 0.04, 0, -0.095, -0.17 - n * 0.08, a);
      if (i % 5 === 4)
        this.part(new IcosahedronGeometry(0.12, 0), a, 0, -0.1, -0.3);
    } else {
      // Twenty authored silhouettes: each recipe changes structure, not only tint.
      const styles = [
        () => {
          box(0.65, 0.22, 0.18, 0, 0.43, -0.08);
          cone(0.13, 0.2, 0, 0.62, -0.08);
          box(0.18, 0.12, 0.03, 0, 0.43, -0.19, 0xfff2c3);
        },
        () => {
          cylinder(0.28, 0.24, 0, 0.44, -0.08);
          cone(0.08, 0.3, -0.3, 0.56, -0.08);
          cone(0.08, 0.3, 0.3, 0.56, -0.08);
        },
        () => {
          cylinder(0.4, 0.045, 0, 0.34, -0.08, a);
          cone(0.27, 0.65, 0, 0.64, -0.08, c, 8);
        },
        () => {
          cylinder(0.42, 0.08, 0, 0.36, -0.08);
          this.part(new IcosahedronGeometry(0.22, 1), a, 0, 0.5, -0.08);
        },
        () => {
          box(0.45, 0.23, 0.46, 0, 0.44, -0.08);
          cone(0.12, 0.35, 0, 0.68, -0.08);
          box(0.4, 0.08, 0.14, 0, 0.34, -0.38, 0xfff2c3);
        },
        () => {
          this.part(new IcosahedronGeometry(0.35, 1), c, 0, 0.42, -0.08);
          box(0.35, 0.18, 0.06, 0, 0.43, -0.4, 0x36d8ee);
        },
        () => {
          cylinder(0.23, 0.23, 0, 0.43, -0.08);
          for (const x of [-0.16, 0, 0.16])
            this.part(
              new IcosahedronGeometry(0.17, 0),
              0xfff2c3,
              x,
              0.64,
              -0.08,
            );
        },
        () => {
          cylinder(0.13, 0.16, 0, 0.37, -0.08, 0xfff2c3);
          this.part(
            new IcosahedronGeometry(1, 1).scale(0.41, 0.19, 0.37),
            c,
            0,
            0.55,
            -0.08,
          );
        },
        () => {
          cylinder(0.18, 0.4, 0, 0.53, -0.08, 0x54bc4a, 6);
          box(0.5, 0.09, 0.1, 0, 0.52, -0.08, 0x54bc4a);
          cone(0.09, 0.15, 0, 0.81, -0.08, 0xff7094);
        },
        () => {
          box(0.5, 0.3, 0.43, 0, 0.46, -0.08);
          for (const x of [-0.13, 0.13])
            box(0.09, 0.08, 0.04, x, 0.48, -0.32, a);
          cone(0.025, 0.22, 0, 0.73, -0.08);
        },
        () => {
          cylinder(0.26, 0.18, 0, 0.42, -0.08);
          for (const x of [-0.23, 0.23]) cone(0.09, 0.36, x, 0.65, -0.08);
          for (let n = 0; n < 3; n++)
            cone(0.06, 0.14, 0, 0.59, -0.2 + n * 0.13);
        },
        () => {
          for (let n = 0; n < 4; n++)
            cylinder(
              0.07,
              0.3 + n * 0.025,
              (n - 1.5) * 0.1,
              0.5,
              -0.08,
              0xffd738,
              5,
            );
        },
        () => {
          cylinder(0.28, 0.2, 0, 0.42, -0.08);
          for (const x of [-0.2, 0.2]) cone(0.12, 0.25, x, 0.62, -0.08, c, 3);
        },
        () => {
          cylinder(0.24, 0.14, 0, 0.4, -0.08);
          for (const x of [-0.32, 0.32])
            box(0.24, 0.12, 0.35, x, 0.5, -0.08, a);
        },
        () => {
          for (let n = 0; n < 3; n++)
            this.part(
              new IcosahedronGeometry(0.2 - n * 0.04, 1),
              0xfff2c3,
              0,
              0.4 + n * 0.2,
              -0.08,
            );
          cone(0.035, 0.17, 0, 0.6, -0.27, 0xff8c35);
        },
        () => {
          cylinder(0.44, 0.045, 0, 0.34, -0.08, a);
          cylinder(0.23, 0.32, 0, 0.5, -0.08);
          box(0.48, 0.05, 0.035, 0, 0.44, -0.3, a);
        },
        () => {
          box(0.4, 0.4, 0.35, 0, 0.52, -0.08);
          for (const x of [-0.1, 0.1]) box(0.06, 0.1, 0.03, x, 0.56, -0.27, a);
          box(0.18, 0.05, 0.03, 0, 0.42, -0.27, a);
        },
        () => {
          cylinder(0.26, 0.16, 0, 0.41, -0.08);
          for (const x of [-0.2, 0.2]) {
            cylinder(0.025, 0.25, x, 0.62, -0.08, a, 4);
            this.part(new IcosahedronGeometry(0.08, 0), a, x, 0.78, -0.08);
          }
        },
        () => {
          cylinder(0.25, 0.16, 0, 0.42, -0.08);
          for (let n = 0; n < 5; n++)
            cone(
              0.07,
              0.22 + Math.sin(n) * 0.1,
              (n - 2) * 0.1,
              0.67,
              -0.08,
              0xff704c,
              4,
            );
        },
        () => {
          this.part(new IcosahedronGeometry(0.25, 1), c, 0, 0.5, -0.08);
          this.part(
            new CylinderGeometry(0.39, 0.39, 0.025, 12).rotateZ(0.35),
            a,
            0,
            0.5,
            -0.08,
          );
        },
      ];
      styles[i]();
    }
  }
}

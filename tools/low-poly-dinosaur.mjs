// Original low-poly character and editable 11-joint rig. Offline authoring only.
import {
  AnimationClip,
  Bone,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  MeshBasicMaterial,
  Quaternion,
  QuaternionKeyframeTrack,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  Uint8BufferAttribute,
  Uint16BufferAttribute,
  VectorKeyframeTrack,
} from "three";
import {
  mergeGeometries,
  mergeVertices,
} from "three/addons/utils/BufferGeometryUtils.js";

export class LowPolyDinosaur {
  parts = [];
  bones = [];
  bone(name, parent, x, y, z) {
    const bone = new Bone();
    bone.name = `dino-${name}`;
    bone.position.set(x, y, z);
    if (parent >= 0) this.bones[parent].add(bone);
    this.bones.push(bone);
    return this.bones.length - 1;
  }
  part(
    geometry,
    colour,
    joint,
    x,
    y,
    z,
    sx = 1,
    sy = 1,
    sz = 1,
    rotationX = 0,
  ) {
    geometry.deleteAttribute("uv");
    geometry.scale(sx, sy, sz);
    geometry.rotateX(rotationX);
    geometry.translate(x, y, z);
    const count = geometry.attributes.position.count,
      c = new Color(colour);
    const colours = new Uint8Array(count * 3),
      indices = new Uint16Array(count * 4),
      weights = new Uint8Array(count * 4);
    for (let i = 0; i < count; i++) {
      colours.set(
        [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)],
        i * 3,
      );
      indices[i * 4] = joint;
      weights[i * 4] = 255;
    }
    geometry.setAttribute("color", new Uint8BufferAttribute(colours, 3, true));
    geometry.setAttribute("skinIndex", new Uint16BufferAttribute(indices, 4));
    geometry.setAttribute(
      "skinWeight",
      new Uint8BufferAttribute(weights, 4, true),
    );
    this.parts.push(geometry);
  }
  ball(colour, joint, x, y, z, sx, sy, sz, segments = 8, rings = 4) {
    this.part(
      new SphereGeometry(1, segments, rings),
      colour,
      joint,
      x,
      y,
      z,
      sx,
      sy,
      sz,
    );
  }
  build() {
    this.bone("root", -1, 0, 0, 0);
    const hips = this.bone("hips", 0, 0, 0.72, 0.05);
    const torso = this.bone("torso", hips, 0, 0.3, -0.02);
    const head = this.bone("head", torso, 0, 0.35, -0.3);
    const tail = this.bone("tail", hips, 0, 0.05, 0.35);
    const left = this.bone("leg-l", hips, -0.22, -0.05, 0);
    const shinL = this.bone("shin-l", left, 0, -0.32, 0);
    const right = this.bone("leg-r", hips, 0.22, -0.05, 0);
    const shinR = this.bone("shin-r", right, 0, -0.32, 0);
    const armL = this.bone("arm-l", torso, -0.3, 0.02, -0.2);
    const armR = this.bone("arm-r", torso, 0.3, 0.02, -0.2);
    this.ball(0x58c95a, torso, 0, 0.91, 0.08, 0.32, 0.43, 0.37, 10, 5);
    this.ball(0xcce78a, torso, 0, 0.91, -0.23, 0.24, 0.31, 0.095);
    this.ball(0x64d561, head, 0, 1.4, -0.38, 0.38, 0.29, 0.4, 10, 6);
    this.ball(0x6cdb67, head, 0, 1.27, -0.69, 0.33, 0.18, 0.34);
    this.ball(0xc5e68b, head, 0, 1.16, -0.7, 0.29, 0.095, 0.3);
    this.ball(0x287344, head, 0, 1.205, -1.005, 0.16, 0.013, 0.012, 6, 3);
    for (const side of [-1, 1]) {
      this.ball(0xfff9e8, head, side * 0.315, 1.47, -0.56, 0.08, 0.105, 0.1);
      this.ball(
        0x24374d,
        head,
        side * 0.375,
        1.48,
        -0.59,
        0.034,
        0.065,
        0.055,
        6,
        3,
      );
      this.ball(
        0xffffff,
        head,
        side * 0.398,
        1.505,
        -0.61,
        0.012,
        0.023,
        0.02,
        6,
        3,
      );
      this.ball(
        0x367c48,
        head,
        side * 0.135,
        1.33,
        -0.99,
        0.025,
        0.018,
        0.015,
        6,
        3,
      );
      const thigh = side < 0 ? left : right,
        shin = side < 0 ? shinL : shinR;
      this.ball(0x42ac50, thigh, side * 0.22, 0.52, 0.07, 0.17, 0.23, 0.19);
      this.part(
        new CylinderGeometry(0.085, 0.105, 0.26, 6),
        0x57c659,
        shin,
        side * 0.22,
        0.25,
        0.04,
      );
      this.ball(0x72d765, shin, side * 0.22, 0.1, -0.1, 0.15, 0.1, 0.24, 8, 3);
      for (const toe of [-1, 1])
        this.part(
          new ConeGeometry(0.035, 0.11, 4),
          0xffedbc,
          shin,
          side * 0.22 + toe * 0.065,
          0.09,
          -0.32,
          1,
          1,
          1,
          -Math.PI / 2,
        );
      this.ball(
        0x48b957,
        side < 0 ? armL : armR,
        side * 0.34,
        0.97,
        -0.24,
        0.08,
        0.17,
        0.09,
        6,
        3,
      );
      this.ball(
        0x8bdd72,
        side < 0 ? armL : armR,
        side * 0.34,
        0.84,
        -0.3,
        0.09,
        0.07,
        0.11,
        6,
        3,
      );
    }
    this.part(
      new CylinderGeometry(0.1, 0.19, 0.48, 6),
      0x43b655,
      tail,
      0,
      0.76,
      0.64,
      1,
      1,
      1,
      Math.PI / 2,
    );
    this.part(
      new ConeGeometry(0.105, 0.5, 6),
      0x65ce5c,
      tail,
      0,
      0.79,
      1.08,
      1,
      1,
      1,
      Math.PI / 2,
    );
    for (const [z, y, radius] of [
      [0.02, 1.33, 0.09],
      [0.24, 1.27, 0.1],
      [0.45, 1.1, 0.09],
      [0.69, 0.94, 0.075],
      [0.9, 0.91, 0.05],
    ])
      this.part(
        new ConeGeometry(radius, radius * 1.65, 3),
        0xffb75b,
        z < 0.4 ? torso : tail,
        0,
        y,
        z,
      );
    const merged = mergeGeometries(this.parts);
    for (const part of this.parts) part.dispose();
    const geometry = mergeVertices(merged);
    merged.dispose();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new SkinnedMesh(
      geometry,
      new MeshBasicMaterial({ vertexColors: true }),
    );
    mesh.name = "dinosaur";
    mesh.add(this.bones[0]);
    mesh.bind(new Skeleton(this.bones));
    const clips = this.animations();
    console.log(
      "dinosaur",
      geometry.index.count / 3,
      "triangles",
      this.bones.length,
      "bones",
    );
    return { mesh, clips };
  }
  animations() {
    const names = this.bones.map((b) => b.name),
      duration = 0.65;
    const rotation = (bone, values, times) =>
      new QuaternionKeyframeTrack(
        `${names[bone]}.quaternion`,
        times,
        values.flatMap((v) =>
          new Quaternion().setFromEuler(new Euler(...v)).toArray(),
        ),
      );
    const tracks = [],
      times = Array.from({ length: 13 }, (_, i) => (duration * i) / 12);
    const poses = times.map((t) => {
      const p = (t / duration) * Math.PI * 2,
        s = Math.sin(p);
      return { s, p };
    });
    for (const [bone, pose] of [
      [2, ({ p }) => [0.045 + Math.sin(p * 2) * 0.025, 0, Math.sin(p) * 0.025]],
      [3, ({ p }) => [-Math.sin(p * 2) * 0.035, Math.sin(p) * 0.035, 0]],
      [4, ({ p }) => [Math.sin(p * 2) * 0.05, Math.sin(p + 0.5) * 0.16, 0]],
      [5, ({ s }) => [s * 0.6, 0, 0]],
      [7, ({ s }) => [-s * 0.6, 0, 0]],
      [6, ({ s }) => [-Math.max(0, -s) * 0.65, 0, 0]],
      [8, ({ s }) => [-Math.max(0, s) * 0.65, 0, 0]],
      [9, ({ s }) => [-s * 0.3, 0, -0.08]],
      [10, ({ s }) => [s * 0.3, 0, 0.08]],
    ])
      tracks.push(rotation(bone, poses.map(pose), times));
    tracks.push(
      new VectorKeyframeTrack(
        `${names[1]}.position`,
        times,
        poses.flatMap(({ p }) => [
          0,
          0.755 + 0.025 * Math.sin(p * 2) ** 2,
          0.05,
        ]),
      ),
    );
    const run = new AnimationClip("run", duration, tracks).optimize();
    const staticClip = (name, settings, hipsY) => {
      const tracks = [];
      for (let bone = 2; bone < this.bones.length; bone++) {
        const value = settings[bone] ?? [0, 0, 0];
        tracks.push(rotation(bone, [value, value], [0, 1]));
      }
      tracks.push(
        new VectorKeyframeTrack(
          `${names[1]}.position`,
          [0, 1],
          [0, hipsY, 0.05, 0, hipsY, 0.05],
        ),
      );
      return new AnimationClip(name, 1, tracks).optimize();
    };
    const jump = staticClip(
      "jump",
      {
        2: [-0.1, 0, 0],
        3: [0.08, 0, 0],
        4: [-0.15, 0, 0],
        5: [-0.55, 0, 0],
        7: [-0.55, 0, 0],
        6: [1.05, 0, 0],
        8: [1.05, 0, 0],
        9: [-0.3, 0, -0.25],
        10: [-0.3, 0, 0.25],
      },
      0.72,
    );
    const duck = staticClip(
      "duck",
      {
        2: [-0.65, 0, 0],
        3: [0.25, 0, 0],
        4: [0.25, 0, 0],
        5: [-1, 0, 0],
        7: [-1, 0, 0],
        6: [1.9, 0, 0],
        8: [1.9, 0, 0],
        9: [-0.65, 0, -0.15],
        10: [-0.65, 0, 0.15],
      },
      0.4,
    );
    const hit = staticClip(
      "hit",
      {
        2: [-0.18, 0, 0],
        3: [0.32, 0, 0],
        4: [-0.12, 0, 0],
        9: [-0.3, 0, -0.3],
        10: [-0.3, 0, 0.3],
      },
      0.72,
    );
    const death = staticClip(
      "death",
      {
        2: [-0.4, 0, -1.1],
        3: [0.2, 0, 0],
        5: [-0.7, 0, -0.3],
        7: [-0.7, 0, 0.3],
        6: [1.3, 0, 0],
        8: [1.3, 0, 0],
      },
      0.33,
    );
    return [run, jump, duck, hit, death];
  }
}

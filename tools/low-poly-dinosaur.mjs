// Original low-poly character and editable 11-joint rig. Offline authoring only.
import {
  AnimationClip,
  Bone,
  Color,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  IcosahedronGeometry,
  Shape,
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
  roundable = [];
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
    if (!geometry.index) {
      const source = geometry;
      geometry = mergeVertices(source);
      source.dispose();
    }
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
    const outline = new Shape();
    for (const [i, p] of [
      [-0.7, -1],
      [0.7, -1],
      [1, -0.7],
      [1, 0.7],
      [0.7, 1],
      [-0.7, 1],
      [-1, 0.7],
      [-1, -0.7],
    ].entries())
      i ? outline.lineTo(...p) : outline.moveTo(...p);
    outline.closePath();
    const source =
      colour === 0xfff9e8 || colour === 0x24374d || colour === 0xffffff
        ? new SphereGeometry(1, Math.min(6, segments), Math.min(4, rings))
        : new ExtrudeGeometry(outline, {
            depth: 2,
            steps: 1,
            bevelEnabled: false,
            curveSegments: 1,
          }).translate(0, 0, -1);
    const geometry = source.index ? source : mergeVertices(source);
    if (geometry !== source) source.dispose();
    this.part(geometry, colour, joint, x, y, z, sx, sy, sz);
    if (colour !== 0xfff9e8 && colour !== 0x24374d && colour !== 0xffffff)
      this.roundable.push({
        geometry: this.parts[this.parts.length - 1],
        x,
        y,
        z,
        sx,
        sy,
        sz,
      });
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
    this.part(
      new IcosahedronGeometry(1, 0),
      0x28bb7c,
      torso,
      0,
      0.96,
      0.08,
      0.34,
      0.51,
      0.33,
    );
    this.part(
      new IcosahedronGeometry(1, 0),
      0xffe8bc,
      torso,
      0,
      0.91,
      -0.205,
      0.23,
      0.36,
      0.07,
    );
    this.part(
      new CylinderGeometry(0.18, 0.21, 0.38, 6),
      0x36c48a,
      torso,
      0,
      1.25,
      -0.12,
    );
    this.ball(0x3dcc8c, head, 0, 1.49, -0.35, 0.3, 0.26, 0.3);
    this.ball(0x43d594, head, 0, 1.37, -0.62, 0.28, 0.16, 0.27);
    this.ball(0xffe8bc, head, 0, 1.23, -0.65, 0.27, 0.085, 0.22);
    this.ball(0x24374c, head, 0, 1.3, -0.898, 0.2, 0.04, 0.012);
    for (const x of [-0.13, 0, 0.13])
      this.part(
        new ConeGeometry(0.025, 0.065, 3),
        0xfff9e8,
        head,
        x,
        1.31,
        -0.918,
        1,
        1,
        1,
        Math.PI,
      );
    for (const side of [-1, 1]) {
      this.ball(0xfff9e8, head, side * 0.28, 1.59, -0.43, 0.1, 0.13, 0.11);
      this.ball(
        0x24374d,
        head,
        side * 0.365,
        1.6,
        -0.46,
        0.034,
        0.065,
        0.055,
        6,
        3,
      );
      this.ball(
        0xffffff,
        head,
        side * 0.39,
        1.625,
        -0.48,
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
        1.44,
        -0.9,
        0.025,
        0.018,
        0.015,
        6,
        3,
      );
      const thigh = side < 0 ? left : right,
        shin = side < 0 ? shinL : shinR;
      this.ball(0x159968, thigh, side * 0.22, 0.52, 0.07, 0.17, 0.23, 0.19);
      this.part(
        new CylinderGeometry(0.085, 0.105, 0.26, 6),
        0x28b17b,
        shin,
        side * 0.22,
        0.25,
        0.04,
      );
      this.ball(0x36bf88, shin, side * 0.22, 0.1, -0.1, 0.15, 0.1, 0.24, 8, 3);
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
        0x26ad78,
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
        0x4ac890,
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
      0x169c69,
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
      0x38c087,
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
        0xff704c,
        z < 0.4 ? torso : tail,
        0,
        y,
        z,
      );
    // Spend 224 triangles on fourteen real joint bridges instead of extra
    // rounding fans, keeping the original 1182-triangle budget.
    this.roundSurfaces(85);
    this.connectJoints();
    const merged = mergeGeometries(this.parts);
    for (const part of this.parts) part.dispose();
    merged.deleteAttribute("normal");
    const geometry = mergeVertices(merged);
    geometry.computeVertexNormals();
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
  /** Cut matching surface patches and sew them with three skinned spans.
   * End rings copy the source positions AND weights exactly, so rotation or
   * clip blending cannot separate a seam. Middle rings blend both bones. */
  connectJoints() {
    const byBone = this.bones.map((_, joint) =>
      this.parts.filter((p) => p.attributes.skinIndex.getX(0) === joint),
    );
    const body = byBone[2][0], neck = byBone[2][2];
    const joints = [
      [body, neck, [0, 1.25, -0.12]],
      [neck, byBone[3][0], [0, 1.4, -0.2]],
      [body, byBone[4][0], [0, 0.77, 0.36]],
      [byBone[4][0], byBone[4][1], [0, 0.78, 0.86]],
    ];
    for (const [side, thigh, shin, arm] of [[-1, 5, 6, 9], [1, 7, 8, 10]]) {
      joints.push(
        [body, byBone[thigh][0], [side * 0.21, 0.7, 0.07]],
        [byBone[thigh][0], byBone[shin][0], [side * 0.22, 0.36, 0.04]],
        [byBone[shin][0], byBone[shin][1], [side * 0.22, 0.15, 0.02]],
        [body, byBone[arm][0], [side * 0.28, 1.03, -0.17]],
        [byBone[arm][0], byBone[arm][1], [side * 0.34, 0.85, -0.27]],
      );
    }
    const patch = (geometry, target) => {
      const p = geometry.attributes.position, index = geometry.index;
      let best = 0, distance = Infinity;
      for (let f = 0; f < index.count; f += 3) {
        const ids = [index.getX(f), index.getX(f + 1), index.getX(f + 2)];
        const centre = [0, 1, 2].map((k) =>
          ids.reduce((sum, id) => sum + p.array[id * 3 + k], 0) / 3);
        const d = centre.reduce((sum, value, k) => sum + (value - target[k]) ** 2, 0);
        if (d < distance) { distance = d; best = f; }
      }
      const ids = [0, 1, 2].map((k) => index.getX(best + k));
      const points = ids.map((id) => [p.getX(id), p.getY(id), p.getZ(id)]);
      geometry.setIndex(Array.from(index.array).filter((_, i) => i < best || i >= best + 3));
      return { points, joint: geometry.attributes.skinIndex.getX(ids[0]),
        colour: ids.map((id) => Array.from(geometry.attributes.color.array.slice(id * 3, id * 3 + 3))) };
    };
    for (const [a, b, target] of joints) {
      const start = patch(a, target), end = patch(b, target);
      // Opposite winding closes both cut boundaries without a twisted tube.
      let order, shortest = Infinity;
      for (let shift = 0; shift < 3; shift++) {
        const candidate = [0, 1, 2].map((i) => (shift - i + 3) % 3);
        const distance = candidate.reduce((sum, j, i) => sum + start.points[i].reduce(
          (d, v, k) => d + (v - end.points[j][k]) ** 2, 0), 0);
        if (distance < shortest) { shortest = distance; order = candidate; }
      }
      const positions = [], colours = [], indices = [], weights = [], faces = [];
      for (let ring = 0; ring < 4; ring++) {
        const t = ring / 3;
        for (let i = 0; i < 3; i++) {
          const j = order[i];
          positions.push(...start.points[i].map((v, k) => v * (1 - t) + end.points[j][k] * t));
          colours.push(...start.colour[i].map((v, k) => Math.round(v * (1 - t) + end.colour[j][k] * t)));
          indices.push(start.joint, end.joint, 0, 0);
          weights.push(255 - ring * 85, ring * 85, 0, 0);
          if (ring < 3) {
            const v = ring * 3 + i, next = ring * 3 + (i + 1) % 3;
            // Follow the REMOVED face's directed boundary. Its surviving
            // neighbour runs the other way; reversing this strip makes both
            // incident faces run the same way and exposes culled torso facets.
            faces.push(v, next, v + 3, next, next + 3, v + 3);
          }
        }
      }
      const bridge = new BufferGeometry();
      bridge.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
      bridge.setAttribute("color", new Uint8BufferAttribute(colours, 3, true));
      bridge.setAttribute("skinIndex", new Uint16BufferAttribute(indices, 4));
      bridge.setAttribute("skinWeight", new Uint8BufferAttribute(weights, 4, true));
      bridge.setIndex(faces);
      bridge.computeVertexNormals();
      this.parts.push(bridge);
    }
  }
  /** Split selected visible body facets into curved three-triangle fans.
   * A half-strength superellipsoid projection rounds real surfaces, not padding. */
  roundSurfaces(budget) {
    const ranked = [];
    for (const part of this.roundable) {
      const p = part.geometry.attributes.position,
        index = part.geometry.index;
      for (let f = 0; f < index.count / 3; f++) {
        const a = index.getX(f * 3),
          b = index.getX(f * 3 + 1),
          c = index.getX(f * 3 + 2);
        const ux = p.getX(b) - p.getX(a),
          uy = p.getY(b) - p.getY(a),
          uz = p.getZ(b) - p.getZ(a),
          vx = p.getX(c) - p.getX(a),
          vy = p.getY(c) - p.getY(a),
          vz = p.getZ(c) - p.getZ(a);
        ranked.push({
          part,
          f,
          area: Math.hypot(
            uy * vz - uz * vy,
            uz * vx - ux * vz,
            ux * vy - uy * vx,
          ),
        });
      }
    }
    ranked.sort((a, b) => b.area - a.area);
    if (ranked.length < budget) throw Error("Rounding facet budget");
    for (const part of this.roundable) {
      const selected = new Set(
        ranked
          .slice(0, budget)
          .filter((r) => r.part === part)
          .map((r) => r.f),
      );
      const old = part.geometry,
        index = old.index,
        vertices = [];
      for (let f = 0; f < index.count / 3; f++) {
        const ids = [
          index.getX(f * 3),
          index.getX(f * 3 + 1),
          index.getX(f * 3 + 2),
        ];
        if (selected.has(f))
          for (let n = 0; n < 3; n++)
            vertices.push([ids[n]], [ids[(n + 1) % 3]], ids);
        else for (const id of ids) vertices.push([id]);
      }
      for (const [name, attribute] of Object.entries(old.attributes)) {
        const array = new attribute.array.constructor(
          vertices.length * attribute.itemSize,
        );
        for (let v = 0; v < vertices.length; v++)
          for (let k = 0; k < attribute.itemSize; k++) {
            let value = 0;
            for (const id of vertices[v])
              value +=
                attribute.array[id * attribute.itemSize + k] /
                vertices[v].length;
            array[v * attribute.itemSize + k] = value;
          }
        old.setAttribute(
          name,
          new BufferAttribute(array, attribute.itemSize, attribute.normalized),
        );
      }
      old.setIndex(Array.from({ length: vertices.length }, (_, i) => i));
      const p = old.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const x = (p.getX(v) - part.x) / part.sx,
          y = (p.getY(v) - part.y) / part.sy,
          z = (p.getZ(v) - part.z) / part.sz;
        const norm =
          (Math.abs(x) ** 4 + Math.abs(y) ** 4 + Math.abs(z) ** 4) ** 0.25;
        const factor = norm > 1e-6 ? 0.5 + 0.5 / norm : 1;
        p.setXYZ(
          v,
          part.x + x * factor * part.sx,
          part.y + y * factor * part.sy,
          part.z + z * factor * part.sz,
        );
      }
      old.computeVertexNormals();
    }
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
    // Keep the duck silhouette but alternate hips, knees and arms with distance.
    duck.duration = duration;
    for (const [bone, pose] of [
      [5, ({ s }) => [-1 + s * 0.32, 0, 0]],
      [7, ({ s }) => [-1 - s * 0.32, 0, 0]],
      [6, ({ s }) => [1.9 - Math.max(0, s) * 0.38, 0, 0]],
      [8, ({ s }) => [1.9 - Math.max(0, -s) * 0.38, 0, 0]],
      [9, ({ s }) => [-0.65 - s * 0.15, 0, -0.15]],
      [10, ({ s }) => [-0.65 + s * 0.15, 0, 0.15]],
    ]) {
      const index = duck.tracks.findIndex(
        (t) => t.name === `${names[bone]}.quaternion`,
      );
      duck.tracks[index] = rotation(bone, poses.map(pose), times);
    }
    duck.trim().optimize();
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

import * as THREE from "three";
import {
  CUBE_SIZE,
  LANES,
  ROW_COUNT,
  CENTER_LANE,
  ROAD_WIDTH,
  LANE_WIDTH,
  laneX,
  type Simulation,
} from "./simulation";

// All GPU objects are owned here and created only once.
export class View {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(56, 1, 0.2, 115);
  private readonly cube = new THREE.BoxGeometry(1, 1, 1);
  private readonly white = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    flatShading: true,
  });
  private readonly roadMaterial = new THREE.MeshBasicMaterial({
    // Warm the neutral CC0 albedo without adding another texture or shader pass.
    color: new THREE.Color().setRGB(1.65, 1.4, 0.95),
  });
  private readonly lineMaterial = new THREE.MeshBasicMaterial({
    color: 0xffedc5,
  });
  private readonly accentMaterial = new THREE.MeshBasicMaterial({
    color: 0xd69a57,
  });
  private readonly road = new THREE.Mesh(this.cube, this.roadMaterial);
  private readonly dinosaurMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
  });
  private readonly player: THREE.Mesh;
  private readonly blocks = new THREE.InstancedMesh(
    this.cube,
    this.white,
    ROW_COUNT * (LANES - 1),
  );
  private readonly lines = new THREE.InstancedMesh(
    this.cube,
    this.lineMaterial,
    LANES - 1,
  );
  private readonly edges = new THREE.InstancedMesh(
    this.cube,
    this.accentMaterial,
    2,
  );
  private readonly markers = new THREE.InstancedMesh(
    this.cube,
    this.lineMaterial,
    36,
  );
  private readonly matrix = new THREE.Matrix4();
  private quality = 1;
  private sampleTime = 0;
  private sampleFrames = 0;
  private cooldown = 0;
  private basePitch = 0;
  private cameraPitch = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly dinosaur: THREE.BufferGeometry,
    private readonly sand: THREE.Texture,
  ) {
    this.roadMaterial.map = sand;
    this.player = new THREE.Mesh(dinosaur, this.dinosaurMaterial);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      powerPreference: "low-power",
    });
    this.renderer.setClearColor(0xd6f2ec);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.fog = new THREE.Fog(0xd6f2ec, 32, 106);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xc7a26d, 2.1));
    const light = new THREE.DirectionalLight(0xffffff, 1.7);
    light.position.set(-4, 12, 8);
    this.scene.add(light);
    this.road.scale.set(ROAD_WIDTH, 0.1, 126);
    this.road.position.set(0, -0.06, -49);
    this.player.position.set(laneX(CENTER_LANE), 0, 0);
    this.player.rotation.y = -0.25;
    this.blocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.markers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Dynamic bounds would otherwise become stale when pooled instances recycle.
    this.blocks.frustumCulled = this.markers.frustumCulled = false;
    for (let i = 0; i < LANES - 1; i++)
      this.place(
        this.lines,
        i,
        -ROAD_WIDTH / 2 + (i + 1) * LANE_WIDTH,
        0,
        -49,
        0.035,
        0.01,
        126,
      );
    for (let i = 0; i < 2; i++)
      this.place(
        this.edges,
        i,
        (i ? 1 : -1) * (ROAD_WIDTH / 2 + 0.02),
        0,
        -49,
        0.075,
        0.015,
        126,
      );
    this.scene.add(
      this.road,
      this.player,
      this.blocks,
      this.lines,
      this.edges,
      this.markers,
    );
    this.resize();
  }

  private place(
    mesh: THREE.InstancedMesh,
    index: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ) {
    this.matrix.makeScale(sx, sy, sz);
    this.matrix.setPosition(x, y, z);
    mesh.setMatrixAt(index, this.matrix);
  }

  resize() {
    const width = this.renderer.domElement.clientWidth,
      height = this.renderer.domElement.clientHeight;
    // Hard cap: 900k physical pixels even on high-DPR phones / large desktops.
    const ratio =
      Math.min(
        devicePixelRatio || 1,
        1.25,
        Math.sqrt(900_000 / (width * height)),
      ) * this.quality;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.fov = 68;
    // One portrait camera only. Orbit the previous camera +10 degrees around
    // its look-at target, preserving radius rather than merely changing FOV.
    const distance = Math.max(
      9.5,
      (ROAD_WIDTH / 2 + 0.9) /
        (Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.aspect),
    );
    const dy = distance * 0.65 - 0.5,
      dz = distance + 12;
    const radius = Math.hypot(dy, dz);
    this.basePitch = Math.atan2(dy, dz);
    this.cameraPitch = this.basePitch + THREE.MathUtils.degToRad(10);
    this.camera.position.set(
      0,
      0.5 + Math.sin(this.cameraPitch) * radius,
      -12 + Math.cos(this.cameraPitch) * radius,
    );
    this.camera.lookAt(0, 0.5, -12);
    this.camera.updateProjectionMatrix();
  }

  adapt(dt: number) {
    if (dt <= 0 || dt > 0.25) return;
    this.sampleTime += dt;
    this.sampleFrames++;
    this.cooldown += dt;
    if (this.sampleTime < 2) return;
    const mean = this.sampleTime / this.sampleFrames;
    if (this.cooldown >= 4) {
      const before = this.quality;
      if (mean > 0.023) this.quality = Math.max(0.5, this.quality - 0.15);
      else if (mean < 0.018 && this.cooldown > 10)
        this.quality = Math.min(1, this.quality + 0.05);
      if (before !== this.quality) {
        this.resize();
        this.cooldown = 0;
      }
    }
    this.sampleTime = this.sampleFrames = 0;
  }

  draw(game: Simulation) {
    // The texture scrolls with the world. Modulo avoids unbounded UV offsets.
    this.sand.offset.y = (game.distance / (126 / 24)) % 1;
    this.player.position.x = game.x;
    // Rigid-mesh stride: no skeleton, per-vertex uploads or per-frame allocation.
    this.player.position.y =
      game.y +
      (game.y === 0 ? Math.abs(Math.sin(game.distance * 3)) * 0.025 : 0);
    this.player.rotation.z = Math.sin(game.distance * 3) * 0.025;
    let count = 0;
    for (let i = 0; i < ROW_COUNT; i++) {
      if (game.rowZ[i] > 105 || game.rowZ[i] < -4) continue;
      for (let lane = 0; lane < LANES; lane++) {
        if (game.masks[i] & (1 << lane))
          this.place(
            this.blocks,
            count++,
            laneX(lane),
            CUBE_SIZE / 2,
            -game.rowZ[i],
            CUBE_SIZE,
            CUBE_SIZE,
            CUBE_SIZE,
          );
      }
    }
    this.blocks.count = count;
    this.blocks.instanceMatrix.needsUpdate = true;
    const offset = game.distance % 9;
    for (let i = 0; i < 18; i++) {
      const z = 8 - i * 9 + offset;
      this.place(
        this.markers,
        i * 2,
        -ROAD_WIDTH / 2 - 0.45,
        -0.01,
        z,
        0.22,
        0.015,
        2,
      );
      this.place(
        this.markers,
        i * 2 + 1,
        ROAD_WIDTH / 2 + 0.45,
        -0.01,
        z,
        0.22,
        0.015,
        2,
      );
    }
    this.markers.instanceMatrix.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  stats() {
    return {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      quality: this.quality,
      width: this.renderer.domElement.width,
      height: this.renderer.domElement.height,
      threeRevision: THREE.REVISION,
      playerTriangles:
        (this.dinosaur.index?.count ??
          this.dinosaur.attributes.position.count) / 3,
      playerTextures: 0,
      lanes: LANES,
      separatorCount: this.lines.count,
      obstacleCapacity: this.blocks.instanceMatrix.count,
      cameraExtraPitchDegrees: THREE.MathUtils.radToDeg(
        this.cameraPitch - this.basePitch,
      ),
      sandSize: (this.sand.image as HTMLImageElement).width,
      sandOffset: this.sand.offset.y,
      laneEdgeNdc: new THREE.Vector3(ROAD_WIDTH / 2, 0, 0).project(this.camera)
        .x,
    };
  }

  dispose() {
    this.blocks.dispose();
    this.lines.dispose();
    this.edges.dispose();
    this.markers.dispose();
    this.cube.dispose();
    this.dinosaur.dispose();
    this.dinosaurMaterial.dispose();
    this.white.dispose();
    this.roadMaterial.dispose();
    this.sand.dispose();
    this.lineMaterial.dispose();
    this.accentMaterial.dispose();
    this.renderer.dispose();
  }
}

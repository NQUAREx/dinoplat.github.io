import * as THREE from "three";
import { TERRAIN_LENGTH, TERRAIN_TRANSITION } from "./terrain";
import {
  frameCamera, ObstacleVisibility, CAMERA_FOLLOW, FOG_START, FOG_END,
} from "./camera";
import {
  CUBE_SIZE,
  LANES,
  ROW_COUNT,
  ROAD_WIDTH,
  laneX,
  type Simulation,
} from "./simulation";

// All GPU objects are owned here and created only once.
export class View {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera();
  private readonly cube = new THREE.BoxGeometry(1, 1, 1);
  private readonly white = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    flatShading: true,
  });
  private readonly roadMaterial = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      ground: { value: null },
      layers: { value: new THREE.Vector3() },
      progress: { value: 0 },
      scroll: { value: 0 },
    },
    vertexShader: `
      out vec2 world;
      out float depth;
      void main() {
        vec4 p = modelMatrix * vec4(position, 1.0);
        world = p.xz;
        vec4 eye = viewMatrix * p;
        depth = -eye.z;
        gl_Position = projectionMatrix * eye;
      }`,
    fragmentShader: `
      precision highp sampler2DArray;
      uniform sampler2DArray ground;
      uniform vec3 layers;
      uniform float progress;
      uniform float scroll;
      in vec2 world;
      in float depth;
      out vec4 terrainColor;
      #define gl_FragColor terrainColor
      void main() {
        // Square texels in world space, independent of the long road box UVs.
        vec2 uv = vec2(world.x, -world.y + scroll) / 5.25 + vec2(0.37, 0.0);
        float s = progress - world.y;
        float a = layers.y;
        float b = layers.z;
        float boundary = s - ${TERRAIN_LENGTH.toFixed(1)};
        if (s < ${TERRAIN_LENGTH / 2}.) {
          a = layers.x; b = layers.y; boundary = s;
        }
        // Fixed, blocky transition details anchored to the ground, not the screen.
        vec2 pixel = floor(mod(uv, 2.0) * 64.0);
        float noise = fract(dot(pixel, vec2(0.06711056, 0.1135789)) * 52.9829189);
        float blend = smoothstep(-${TERRAIN_TRANSITION / 2}., ${TERRAIN_TRANSITION / 2}., boundary + (noise - 0.5) * 4.0);
        vec3 colour;
        if (boundary < -10.0) colour = texture(ground, vec3(uv, a)).rgb;
        else if (boundary > 10.0) colour = texture(ground, vec3(uv, b)).rgb;
        else colour = mix(texture(ground, vec3(uv, a)).rgb,
                          texture(ground, vec3(uv, b)).rgb, blend);
        // Same inexpensive distance fog as the rest of the scene, in linear space.
        vec3 fog = vec3(0.672443, 0.887923, 0.846873);
        gl_FragColor = vec4(mix(colour, fog, smoothstep(${FOG_START.toFixed(1)}, ${FOG_END.toFixed(1)}, depth)), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  private readonly markerMaterial = new THREE.MeshBasicMaterial({
    color: 0x9fbd71,
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
  private readonly edges = new THREE.InstancedMesh(
    this.cube,
    this.accentMaterial,
    2,
  );
  private readonly markers = new THREE.InstancedMesh(
    this.cube,
    this.markerMaterial,
    36,
  );
  private readonly matrix = new THREE.Matrix4();
  private readonly visibility = new ObstacleVisibility();
  private nearestRenderedRowZ = Infinity;
  private quality = 1;
  private sampleTime = 0;
  private sampleFrames = 0;
  private cooldown = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly dinosaur: THREE.BufferGeometry,
    private readonly terrainTexture: THREE.DataArrayTexture,
  ) {
    this.roadMaterial.uniforms.ground.value = terrainTexture;
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
    this.scene.fog = new THREE.Fog(0xd6f2ec, FOG_START, FOG_END);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xc7a26d, 2.1));
    const light = new THREE.DirectionalLight(0xffffff, 1.7);
    light.position.set(-4, 12, 8);
    this.scene.add(light);
    this.road.scale.set(ROAD_WIDTH, 0.1, 76);
    this.road.position.set(0, -0.06, -21);
    this.player.position.set(0, 0, 0);
    this.player.rotation.y = 0;
    this.blocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.markers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Dynamic bounds would otherwise become stale when pooled instances recycle.
    this.blocks.frustumCulled = this.markers.frustumCulled = false;
    for (let i = 0; i < 2; i++)
      this.place(
        this.edges,
        i,
        (i ? 1 : -1) * (ROAD_WIDTH / 2 + 0.02),
        0,
        -21,
        0.075,
        0.015,
        76,
      );
    this.scene.add(
      this.road,
      this.player,
      this.blocks,
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
    frameCamera(this.camera, width / height);
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

  draw(game: Simulation, alpha = 1) {
    game.terrain.advance(game.distance);
    this.roadMaterial.uniforms.layers.value.set(
      game.terrain.previous, game.terrain.current, game.terrain.next);
    this.roadMaterial.uniforms.progress.value = game.distance % TERRAIN_LENGTH;
    // Two tile periods also preserve the transition noise phase at wraparound.
    this.roadMaterial.uniforms.scroll.value = game.distance % 10.5;
    this.player.position.x = THREE.MathUtils.lerp(game.previousX, game.x, alpha);
    this.player.rotation.y = THREE.MathUtils.lerp(game.previousHeading, game.heading, alpha);
    // Rigid-mesh stride: no skeleton, per-vertex uploads or per-frame allocation.
    this.player.position.y =
      THREE.MathUtils.lerp(game.previousY, game.y, alpha) +
      (game.y === 0 ? Math.abs(Math.sin(game.distance * 3)) * 0.025 : 0);
    this.player.rotation.z = Math.sin(game.distance * 3) * 0.025;
    // Translate the existing camera orientation; no new vectors or lookAt per frame.
    this.camera.position.x = this.player.position.x * CAMERA_FOLLOW;
    this.visibility.update(this.camera);
    this.nearestRenderedRowZ = Infinity;
    let count = 0;
    for (let i = 0; i < ROW_COUNT; i++) {
      for (let lane = 0; lane < LANES; lane++) {
        if ((game.masks[i] & (1 << lane)) && this.visibility.intersects(laneX(lane), game.rowZ[i])) {
          this.nearestRenderedRowZ = Math.min(this.nearestRenderedRowZ, game.rowZ[i]);
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
      obstacleColumns: LANES,
      separatorCount: 0,
      playerHeadingDegrees: THREE.MathUtils.radToDeg(this.player.rotation.y),
      obstacleCapacity: this.blocks.instanceMatrix.count,
      cameraFov: this.camera.fov,
      cameraFar: this.camera.far,
      cameraX: this.camera.position.x,
      cameraY: this.camera.position.y,
      cameraZ: this.camera.position.z,
      fogEnd: FOG_END,
      visibleObstacles: this.blocks.count,
      nearestRenderedRowZ: this.nearestRenderedRowZ,
      terrainSize: this.terrainTexture.image.width,
      terrainLayers: this.terrainTexture.image.depth,
      terrainOffset: this.roadMaterial.uniforms.scroll.value,
      playerNdcX: new THREE.Vector3(this.player.position.x, 0, 0).project(this.camera)
        .x,
    };
  }

  dispose() {
    this.blocks.dispose();
    this.edges.dispose();
    this.markers.dispose();
    this.cube.dispose();
    this.dinosaur.dispose();
    this.dinosaurMaterial.dispose();
    this.white.dispose();
    this.roadMaterial.dispose();
    this.terrainTexture.dispose();
    this.markerMaterial.dispose();
    this.accentMaterial.dispose();
    this.renderer.dispose();
  }
}

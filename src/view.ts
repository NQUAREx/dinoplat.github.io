import * as THREE from "three";
import { CameraRig, ObjectVisibility, FOG_START, FOG_END } from "./camera";
import { Rules, Palette } from "./config";
import { GameEvent } from "./events";
import { Ground } from "./ground";
import { AnimatedDinosaur, FootDust } from "./character";
import { ObjectKind } from "./world";
import { InstancedObjectType, ObjectRendererRegistry } from "./object-renderer";
import { TerrainLayout } from "./terrain";
import type { Simulation } from "./simulation";
import type { ModelLibrary } from "./models";

/** Sole GPU owner. Only visible numeric cells become instances; no object churn. */
export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly rig: CameraRig;
  private readonly scene = new THREE.Scene();
  private readonly ground: Ground;
  private readonly dinosaur: AnimatedDinosaur;
  private readonly dust: FootDust;
  private readonly cactusMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
  });
  private readonly objectRenderers = new ObjectRendererRegistry();
  private readonly visibility = new ObjectVisibility();
  private readonly off: (() => void)[];
  private quality = 1;
  private sampleTime = 0;
  private sampleFrames = 0;
  private cooldown = 0;
  private nearestRenderedForward = Infinity;
  private maximumRelativeX = 0;
  private worldFov = 0;
  private worldCameraX = 0;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private pixelRatio = 0;
  private bufferResizes = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly models: ModelLibrary,
    texture: THREE.DataArrayTexture,
    private readonly game: Simulation,
  ) {
    const reducedMotion = matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    this.rig = new CameraRig(reducedMotion);
    this.ground = new Ground(texture);
    this.dinosaur = new AnimatedDinosaur(models, game);
    this.dust = new FootDust(game, reducedMotion);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      powerPreference: "low-power",
    });
    this.renderer.setClearColor(Palette.sky);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.fog = new THREE.Fog(Palette.sky, FOG_START, FOG_END);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xc49754, 2));
    const light = new THREE.DirectionalLight(0xffffff, 1.5);
    light.position.set(-5, 10, 6);
    this.scene.add(light);
    this.registerObjectType(
      ObjectKind.Cactus,
      models.cacti,
      this.cactusMaterial,
    );
    this.scene.add(this.ground.mesh, this.dinosaur.mesh, this.dust.mesh);
    this.off = [
      game.events.on(GameEvent.Hit, () => this.rig.impulse(0.075, 0.22)),
      game.events.on(GameEvent.Land, () => this.rig.impulse(0.015, 0.1)),
      game.events.on(GameEvent.Start, () => this.rig.reset()),
    ];
    this.resize();
  }
  async initialize() {
    await this.renderer.compileAsync(this.scene, this.rig.camera);
  }
  registerObjectType(
    kind: ObjectKind,
    geometries: readonly THREE.BufferGeometry[],
    material: THREE.Material,
  ) {
    this.objectRenderers.register(
      new InstancedObjectType(kind, geometries, material, this.scene),
    );
  }
  resize() {
    const canvas = this.renderer.domElement,
      width = Math.max(1, canvas.clientWidth),
      height = Math.max(1, canvas.clientHeight);
    const ratio =
      Math.min(
        devicePixelRatio || 1,
        1.25,
        Math.sqrt(900000 / (width * height)),
      ) * this.quality;
    if (
      width === this.viewportWidth &&
      height === this.viewportHeight &&
      ratio === this.pixelRatio
    )
      return;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.pixelRatio = ratio;
    this.bufferResizes++;
    // Change size + DPR together: setPixelRatio followed by setSize resets a
    // mobile canvas twice. CSS already owns the displayed dimensions.
    this.renderer.setDrawingBufferSize(width, height, ratio);
    this.rig.resize(width / height);
    this.game.world.setVisibleHalfWidth(
      (this.rig.camera.far *
        Math.tan((this.rig.camera.fov * Math.PI) / 360) *
        width) /
        height +
        Math.abs(this.rig.camera.position.x) +
        1,
    );
    this.worldFov = this.rig.camera.fov;
    this.worldCameraX = this.rig.camera.position.x;
    this.game.world.update(this.game.x, this.game.distance);
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
  draw(alpha = 1, dt = 0) {
    const game = this.game;
    this.ground.update(game);
    this.dinosaur.update(game, alpha);
    const moving = game.phase === "running" && !game.y && !game.velocityY;
    const activeDt = game.phase === "running" ? dt : 0;
    this.rig.update(
      THREE.MathUtils.lerp(game.previousDistance, game.distance, alpha),
      this.dinosaur.mesh.position.x,
      activeDt,
      moving,
    );
    this.visibility.update(this.rig.camera);
    this.dust.update(game, activeDt, this.visibility);
    if (
      Math.abs(this.worldFov - this.rig.camera.fov) > 0.05 ||
      Math.abs(this.worldCameraX - this.rig.camera.position.x) > 0.1
    ) {
      const camera = this.rig.camera;
      game.world.setVisibleHalfWidth(
        camera.far * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect +
          Math.abs(camera.position.x) +
          1,
      );
      game.world.update(game.x, game.distance);
      this.worldFov = camera.fov;
      this.worldCameraX = camera.position.x;
    }
    this.objectRenderers.begin();
    this.nearestRenderedForward = Infinity;
    this.maximumRelativeX = 0;
    const world = game.world;
    for (let i = 0; i < world.active.length; i++) {
      if (!world.active[i]) continue;
      const renderer = this.objectRenderers.get(world.kinds[i]);
      if (!renderer) continue;
      const x = world.x[i] - game.x,
        forward = world.z[i] - game.distance;
      if (
        !this.visibility.intersects(
          x,
          forward,
          world.halfX[i],
          world.halfZ[i],
          world.height[i],
          world.baseY[i],
        )
      )
        continue;
      renderer.place(
        world.variants[i],
        x,
        -forward,
        world.angles[i],
        world.baseY[i],
      );
      this.nearestRenderedForward = Math.min(
        this.nearestRenderedForward,
        forward,
      );
      this.maximumRelativeX = Math.max(this.maximumRelativeX, Math.abs(x));
    }
    this.objectRenderers.finish();
    this.renderer.render(this.scene, this.rig.camera);
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
      bufferResizes: this.bufferResizes,
      threeRevision: THREE.REVISION,
      cameraFov: this.rig.camera.fov,
      cameraFar: this.rig.camera.far,
      fogStart: FOG_START,
      fogEnd: FOG_END,
      shakeMultiplier: this.rig.shakeMultiplier,
      playerOpacity: (this.dinosaur.mesh.material as THREE.MeshLambertMaterial)
        .opacity,
      cactusHeight: this.models.cacti[0].boundingBox!.max.y,
      cameraX: this.rig.camera.position.x,
      cameraY: this.rig.camera.position.y,
      cameraZ: this.rig.camera.position.z,
      terrainLayers: TerrainLayout.layers,
      terrainTileMetres: TerrainLayout.worldTileSize,
      boundaryCount: 0,
      obstacleVariants: this.models.cacti.length,
      obstacleCapacity: Rules.poolSize,
      visibleObstacles: this.objectRenderers.visible,
      nearestRenderedForward: this.nearestRenderedForward,
      maximumRelativeX: this.maximumRelativeX,
      playerFrame: this.dinosaur.frame,
      playerState: this.dinosaur.state,
      dustCount: this.dust.mesh.count,
      loadedPoses: this.models.run.length,
    };
  }
  dispose() {
    for (const off of this.off) off();
    this.objectRenderers.dispose();
    this.cactusMaterial.dispose();
    this.dinosaur.dispose();
    this.dust.dispose();
    this.ground.dispose();
    this.models.dispose();
    this.renderer.dispose();
  }
}

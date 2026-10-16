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
import { LightingRig } from "./lighting";
import { RenderPose } from "./render-pose";
import { CachedShadows } from "./shadows";
import { PickupMotion } from "./pickup-motion";
import { DinosaurShadow } from "./dinosaur-shadow";
import { FloatingFeedback } from "./floating-feedback";

/** Sole GPU owner. Only visible numeric cells become instances; no object churn. */
export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly rig: CameraRig;
  readonly lighting = new LightingRig();
  private readonly pose = new RenderPose();
  private readonly pickupMotion = new PickupMotion();
  private readonly shadows = new CachedShadows();
  private readonly scene = new THREE.Scene();
  private readonly ground: Ground;
  private readonly dinosaur: AnimatedDinosaur;
  private readonly dinosaurShadow = new DinosaurShadow();
  private readonly dust: FootDust;
  private readonly feedback: FloatingFeedback;
  private readonly feedbackAnchor = new THREE.Vector3();
  private readonly cactusMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
  });
  // Palette is the HUD palette, with just a little self-emission for night
  // readability. One opaque vertex-colour material shared by all three types.
  private readonly pickupMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    emissive: 0xffffff,
    emissiveIntensity: 0.025,
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
  private visibleCacti = 0;
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
      powerPreference: "low-power",
    });
    this.renderer.setClearColor(Palette.sky);
    this.feedback = new FloatingFeedback(
      game.events,
      canvas.parentElement!,
      () => game.feedbackTime,
      reducedMotion,
    );
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.scene.fog = new THREE.Fog(Palette.sky, FOG_START, FOG_END);
    this.scene.add(
      this.lighting.key,
      this.lighting.key.target,
      this.lighting.ambient,
    );
    const time = new URLSearchParams(location.search).get("time");
    if (time !== null && time.trim() !== "" && Number.isFinite(Number(time)))
      this.lighting.setTimeOfDay(Number(time));
    this.registerObjectType(
      ObjectKind.Cactus,
      models.cacti,
      this.cactusMaterial,
    );
    this.registerObjectType(
      ObjectKind.Coin,
      [models.coin],
      this.pickupMaterial,
    );
    this.registerObjectType(
      ObjectKind.Diamond,
      [models.diamond],
      this.pickupMaterial,
    );
    this.registerObjectType(
      ObjectKind.Heart,
      [models.heart],
      this.pickupMaterial,
    );
    this.scene.add(
      this.ground.mesh,
      this.dinosaurShadow.mesh,
      this.dinosaur.mesh,
      this.dust.mesh,
    );
    for (const mesh of this.objectRenderers.get(ObjectKind.Cactus)!.meshes) {
      mesh.castShadow = true;
      // Only the terrain needs reception today. Avoid a depth lookup on every
      // cactus fragment; future low-poly props can opt into self-shadowing.
      mesh.receiveShadow = false;
    }
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
    this.pose.update(game, alpha);
    this.lighting.update(
      game.previousTime + (game.time - game.previousTime) * alpha,
    );
    this.renderer.setClearColor(this.lighting.fogColour);
    (this.scene.fog as THREE.Fog).color.copy(this.lighting.fogColour);
    this.ground.update(game, this.pose);
    this.dinosaur.update(game, alpha);
    this.dinosaurShadow.update(
      this.dinosaur,
      this.lighting,
      this.ground.surface.heightAt(this.pose.x, this.pose.distance),
    );
    const moving =
      game.phase === "running" &&
      !game.hitStopRemaining &&
      !game.y &&
      !game.velocityY;
    const activeDt = game.phase === "running" ? dt : 0;
    this.rig.update(this.pose.distance, 0, activeDt, moving);
    this.feedbackAnchor
      .set(0, this.dinosaur.mesh.position.y + 1.95 - game.crouch * 0.55, 0)
      .project(this.rig.camera);
    this.feedback.update(
      game.previousFeedbackTime +
        (game.feedbackTime - game.previousFeedbackTime) * alpha,
      (this.feedbackAnchor.x * 0.5 + 0.5) * this.viewportWidth,
      (-this.feedbackAnchor.y * 0.5 + 0.5) * this.viewportHeight,
    );
    this.visibility.update(this.rig.camera);
    this.dust.update(
      game,
      game.hitStopRemaining ? 0 : activeDt,
      this.visibility,
      this.pose.x,
      this.pose.distance,
    );
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
    this.visibleCacti = 0;
    this.nearestRenderedForward = Infinity;
    this.maximumRelativeX = 0;
    const world = game.world;
    this.pickupMotion.update(
      game.previousTime + (game.time - game.previousTime) * alpha,
    );
    for (let i = 0; i < world.active.length; i++) {
      if (!world.active[i]) continue;
      const renderer = this.objectRenderers.get(world.kinds[i]);
      if (!renderer) continue;
      const x = world.x[i] - this.pose.x,
        forward = world.z[i] - this.pose.distance;
      const animated =
        world.registry.get(world.kinds[i])?.animation === "spin-bob";
      const y = world.baseY[i] + (animated ? this.pickupMotion.bob : 0);
      const visible = this.visibility.intersects(
        x,
        forward,
        world.halfX[i],
        world.halfZ[i],
        world.height[i],
        y,
      );
      let caster = false;
      if (
        world.kinds[i] === ObjectKind.Cactus &&
        x * x + forward * forward < 60 * 60
      ) {
        // A map may live for .25s: retain a guard band exceeding max forward
        // movement (6m) during that interval. Tight per-frame caster culling
        // makes cached edge shadows pop. Do not submit the whole 60m disk.
        const sx = this.lighting.shadowSlope.x,
          sz = this.lighting.shadowSlope.y;
        const mid = world.baseY[i] + world.height[i] / 2;
        caster = this.visibility.intersects(
          x - mid * sx,
          forward + mid * sz,
          world.halfX[i] + (Math.abs(sx) * world.height[i]) / 2 + 8,
          world.halfZ[i] + (Math.abs(sz) * world.height[i]) / 2 + 8,
          0.02,
          0,
        );
      }
      if (!visible && !caster) continue;
      renderer.place(
        world.variants[i],
        x,
        -forward,
        animated ? this.pickupMotion.angle : world.angles[i],
        y,
      );
      if (visible) {
        if (world.kinds[i] === ObjectKind.Cactus) this.visibleCacti++;
        this.nearestRenderedForward = Math.min(
          this.nearestRenderedForward,
          forward,
        );
        this.maximumRelativeX = Math.max(this.maximumRelativeX, Math.abs(x));
      }
    }
    this.objectRenderers.finish();
    this.renderer.shadowMap.needsUpdate = this.shadows.prepare(
      game,
      this.pose,
      this.lighting,
      this.quality,
    );
    // r186 updates visible objects before incrementing its frame ID, then
    // shadow casters afterwards. A cached shadow capture therefore leaves the
    // object's upload stamp equal to the NEXT frame's visibility-pass stamp:
    // instance matrices are skipped for one frame (stale positions/counts).
    // Start a fresh upload epoch before visibility traversal. This touches only
    // renderer bookkeeping, not shadow cadence/maps or simulation time.
    this.renderer.info.render.frame++;
    this.renderer.render(this.scene, this.rig.camera);
    this.shadows.complete(this.lighting);
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
      visibleCoins: this.objectRenderers.get(ObjectKind.Coin)!.visible,
      visibleDiamonds: this.objectRenderers.get(ObjectKind.Diamond)!.visible,
      visibleHearts: this.objectRenderers.get(ObjectKind.Heart)!.visible,
      pickupAngle: this.pickupMotion.angle,
      pickupBob: this.pickupMotion.bob,
      visibleObstacles: this.visibleCacti,
      visibleObjects: this.objectRenderers.visible,
      nearestRenderedForward: this.nearestRenderedForward,
      maximumRelativeX: this.maximumRelativeX,
      playerFrame: this.dinosaur.frame,
      playerState: this.dinosaur.state,
      dustCount: this.dust.mesh.count,
      animationClips: this.models.animations.length,
      dinosaurBones: this.models.dinosaur.skeleton.bones.length,
      hours: this.lighting.cycle.hours,
      fogColour: this.lighting.fogColour.getHex(),
      sunX: this.lighting.key.position.x,
      sunY: this.lighting.key.position.y,
      sunZ: this.lighting.key.position.z,
      lightSource: this.lighting.source,
      moonVisible: false,
      shadowUpdates: this.shadows.updates,
      shadowMapSize: this.lighting.key.shadow.mapSize.x,
      terrainTriangles: this.ground.surface.geometry.index!.count / 3,
      shadows:
        this.lighting.shadowStrength > 0
          ? this.objectRenderers.get(ObjectKind.Cactus)!.visible
          : 0,
      shadowStrength: this.lighting.shadowStrength,
      feedbackCount: this.feedback.active,
      dinosaurShadowX: this.dinosaurShadow.mesh.position.x,
      dinosaurShadowZ: this.dinosaurShadow.mesh.position.z,
      dinosaurShadowWidth: this.dinosaurShadow.mesh.scale.x,
      dinosaurShadowOpacity: this.dinosaurShadow.mesh.material.opacity,
      renderX: this.pose.x,
      renderDistance: this.pose.distance,
    };
  }
  dispose() {
    for (const off of this.off) off();
    this.objectRenderers.dispose();
    this.cactusMaterial.dispose();
    this.pickupMaterial.dispose();
    this.dinosaur.dispose();
    this.dinosaurShadow.dispose();
    this.dust.dispose();
    this.feedback.dispose();
    this.ground.dispose();
    this.models.dispose();
    this.lighting.dispose();
    this.renderer.dispose();
  }
  restoreContext() {
    this.shadows.invalidate();
    this.lighting.key.shadow.map?.dispose();
    this.lighting.key.shadow.map = null;
  }
}

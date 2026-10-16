import * as THREE from "three";
import { GameEvent } from "./events";
import type { Simulation } from "./simulation";
import type { ModelLibrary } from "./models";
import { Palette, Rules } from "./config";
import type { ObjectVisibility } from "./camera";

export class AnimatedDinosaur {
  private readonly material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: true,
  });
  readonly mesh: THREE.SkinnedMesh;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: THREE.AnimationAction[];
  frame = 0;
  state = "idle";
  private landedAt = -Infinity;
  private readonly off: (() => void)[];
  constructor(models: ModelLibrary, game: Simulation) {
    this.mesh = models.dinosaur;
    this.mesh.material = this.material;
    // Pitch/dive stays in the dinosaur's local frame while heading is unbounded.
    this.mesh.rotation.order = "YXZ";
    this.mixer = new THREE.AnimationMixer(this.mesh);
    this.actions = models.animations.map((clip) => {
      const action = this.mixer.clipAction(clip);
      action.setEffectiveTimeScale(0).play();
      return action;
    });
    this.mesh.frustumCulled = false;
    this.off = [
      game.events.on(GameEvent.Land, () => {
        this.landedAt = game.time;
      }),
      game.events.on(GameEvent.Start, () => {
        this.landedAt = -Infinity;
      }),
    ];
  }
  update(game: Simulation, alpha: number) {
    const distance = THREE.MathUtils.lerp(
      game.previousDistance,
      game.distance,
      alpha,
    );
    const airborne = game.y > 0 || game.velocityY > 0;
    this.state =
      game.hitStopRemaining > 0
        ? "hit"
        : game.phase === "over"
          ? "dead"
          : airborne
            ? game.diving
              ? "dive"
              : game.velocityY > 0
                ? "jump-up"
                : "jump-down"
            : game.crouch > 0
              ? "duck"
              : game.phase === "running"
                ? "run"
                : "idle";
    this.frame = (distance / (Rules.stepStride * 2)) % 1;
    const duckWeight = THREE.MathUtils.lerp(
      game.previousCrouch,
      game.crouch,
      alpha,
    );
    const airWeight = airborne
      ? Math.min(1, game.y / 0.15 + Math.abs(game.velocityY) / 20)
      : 0;
    for (const action of this.actions) {
      const name = action.getClip().name;
      action.time = name === "run" ? this.frame * action.getClip().duration : 0;
      const weight =
        game.hitStopRemaining > 0
          ? +(name === "hit")
          : game.phase === "over"
            ? +(name === "death")
            : name === "duck"
              ? duckWeight
              : name === "jump"
                ? (1 - duckWeight) * airWeight
                : name === "run"
                  ? (1 - duckWeight) * (1 - airWeight)
                  : 0;
      action.setEffectiveWeight(weight);
    }
    this.mixer.update(0);
    this.mesh.position.set(
      0,
      THREE.MathUtils.lerp(game.previousY, game.y, alpha),
      0,
    );
    this.mesh.rotation.set(
      airborne
        ? game.diving
          ? 0.18
          : game.velocityY > 0
            ? -0.055
            : 0.045
        : game.crouch * 0.12,
      THREE.MathUtils.lerp(game.previousHeading, game.heading, alpha),
      0,
    );
    const squash = Math.max(0, 1 - (game.time - this.landedAt) / 0.12) * 0.06;
    const duck =
      game.phase === "over"
        ? 0
        : THREE.MathUtils.lerp(game.previousCrouch, game.crouch, alpha);
    this.mesh.scale.set(
      1 + squash * 0.3 + duck * 0.12,
      1 - squash,
      1 + squash * 0.3 + duck * 0.12,
    );
    this.material.opacity =
      game.phase !== "over" &&
      game.hitStopRemaining === 0 &&
      game.health.immunity > 0 &&
      Math.floor((Rules.immunitySeconds - game.health.immunity) * 10) % 2 === 0
        ? 0.5
        : 1;
  }
  dispose() {
    for (const off of this.off) off();
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mesh);
    this.material.dispose();
  }
}

/** Low-poly puffs, one instanced draw and a fixed particle pool. */
export class FootDust {
  private readonly geometry = new THREE.OctahedronGeometry(0.65, 0);
  private readonly material = new THREE.MeshBasicMaterial({
    color: Palette.dust,
  });
  readonly mesh = new THREE.InstancedMesh(this.geometry, this.material, 128);
  private readonly life = new Float32Array(128);
  private readonly worldX = new Float64Array(128);
  private readonly worldZ = new Float64Array(128);
  private readonly driftX = new Float32Array(128);
  private readonly driftZ = new Float32Array(128);
  private readonly matrix = new THREE.Matrix4();
  private cursor = 0;
  private state = 1;
  private readonly off: (() => void)[];
  constructor(
    game: Simulation,
    private readonly reducedMotion: boolean,
  ) {
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.off = [
      game.events.on(GameEvent.Step, () => this.emit(game, 18)),
      game.events.on(GameEvent.Land, () => this.emit(game, 30)),
      game.events.on(GameEvent.Start, () => {
        this.life.fill(0);
        this.cursor = 0;
        this.state = game.seed || 1;
      }),
    ];
  }
  private emit(game: Simulation, amount: number) {
    if (this.reducedMotion) return;
    for (let n = 0; n < amount; n++) {
      const i = this.cursor++ % this.life.length;
      this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
      const spread = this.state / 4294967296 - 0.5;
      this.life[i] = 0.65;
      const sin = Math.sin(game.heading),
        cos = Math.cos(game.heading);
      this.worldX[i] = game.x + spread * cos * 0.5 + sin * 0.3;
      this.worldZ[i] = game.z + spread * sin * 0.5 - cos * 0.3;
      this.driftX[i] = spread * cos + sin * 0.6;
      this.driftZ[i] = spread * sin - cos * 0.6;
    }
  }
  update(
    game: Simulation,
    dt: number,
    visibility: ObjectVisibility,
    renderX = game.x,
    renderDistance = game.z,
  ) {
    let count = 0;
    for (let i = 0; i < this.life.length; i++) {
      this.life[i] = Math.max(0, this.life[i] - dt);
      if (!this.life[i]) continue;
      const age = 0.65 - this.life[i],
        size = (0.23 * this.life[i]) / 0.65;
      const x = this.worldX[i] - renderX + this.driftX[i] * age;
      const z = renderDistance - this.worldZ[i] - this.driftZ[i] * age;
      const y = 0.04 + age * 0.55;
      if (
        !visibility.intersects(x, -z, size / 2, size / 2, size, y - size / 2)
      ) {
        this.life[i] = 0;
        continue;
      }
      this.matrix.makeScale(size, size, size);
      this.matrix.setPosition(x, y, z);
      this.mesh.setMatrixAt(count++, this.matrix);
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    for (const off of this.off) off();
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}

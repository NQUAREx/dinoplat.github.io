import * as THREE from "three";
import { GameEvent } from "./events";
import type { Simulation } from "./simulation";
import type { ModelLibrary } from "./models";
import { Palette, Rules } from "./config";
import type { ObjectVisibility } from "./camera";

export class AnimatedDinosaur {
  private readonly material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    transparent: true,
    depthWrite: false,
  });
  readonly mesh: THREE.Mesh;
  frame = 0;
  state = "idle";
  private landedAt = -Infinity;
  private readonly off: (() => void)[];
  constructor(
    private readonly models: ModelLibrary,
    game: Simulation,
  ) {
    this.mesh = new THREE.Mesh(models.run[0], this.material);
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
      game.phase === "over"
        ? "dead"
        : airborne
          ? game.velocityY > 0
            ? "jump-up"
            : "jump-down"
          : game.phase === "running"
            ? "run"
            : "idle";
    this.frame = airborne
      ? game.velocityY > 0
        ? 2
        : 6
      : Math.floor(distance * Rules.runFramesPerMetre) % this.models.run.length;
    this.mesh.geometry =
      game.phase === "over" ? this.models.death : this.models.run[this.frame];
    this.mesh.position.set(
      THREE.MathUtils.lerp(game.previousX, game.x, alpha) - game.x,
      THREE.MathUtils.lerp(game.previousY, game.y, alpha),
      game.distance - distance,
    );
    this.mesh.rotation.set(
      airborne ? (game.velocityY > 0 ? -0.055 : 0.045) : 0,
      THREE.MathUtils.lerp(game.previousHeading, game.heading, alpha),
      0,
    );
    const squash = Math.max(0, 1 - (game.time - this.landedAt) / 0.12) * 0.06;
    this.mesh.scale.set(1 + squash * 0.3, 1 - squash, 1 + squash * 0.3);
    this.material.opacity =
      game.phase !== "over" &&
      game.health.immunity > 0 &&
      Math.floor((Rules.immunitySeconds - game.health.immunity) * 10) % 2 === 0
        ? 0.5
        : 1;
  }
  dispose() {
    for (const off of this.off) off();
    this.material.dispose();
  }
}

/** Tiny opaque voxel puffs, one instanced draw and a fixed particle pool. */
export class FootDust {
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly material = new THREE.MeshBasicMaterial({
    color: Palette.dust,
  });
  readonly mesh = new THREE.InstancedMesh(this.geometry, this.material, 32);
  private readonly life = new Float32Array(32);
  private readonly worldX = new Float64Array(32);
  private readonly worldZ = new Float64Array(32);
  private readonly spread = new Float32Array(32);
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
      game.events.on(GameEvent.Step, () => this.emit(game, 4)),
      game.events.on(GameEvent.Land, () => this.emit(game, 7)),
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
      this.life[i] = 0.38;
      this.worldX[i] = game.x + spread * 0.3;
      this.worldZ[i] = game.distance - 0.4;
      this.spread[i] = spread;
    }
  }
  update(game: Simulation, dt: number, visibility: ObjectVisibility) {
    let count = 0;
    for (let i = 0; i < this.life.length; i++) {
      this.life[i] = Math.max(0, this.life[i] - dt);
      if (!this.life[i]) continue;
      const age = 0.38 - this.life[i],
        size = (0.12 * this.life[i]) / 0.38;
      const x = this.worldX[i] - game.x + this.spread[i] * age;
      const z = game.distance - this.worldZ[i] + age * 0.6;
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

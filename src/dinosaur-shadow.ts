import { CircleGeometry, Mesh, MeshBasicMaterial, type Material } from "three";
import type { AnimatedDinosaur } from "./character";
import type { LightingRig } from "./lighting";

/** Cartoon contact shadow: one 16-triangle draw, no texture or second shadow
 * capture. Updates with the interpolated avatar, not the cached cactus map. */
export class DinosaurShadow {
  private readonly geometry = new CircleGeometry(1, 16).rotateX(-Math.PI / 2);
  private readonly material = new MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.28,
    depthWrite: false, polygonOffset: true,
    polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  readonly mesh = new Mesh(this.geometry, this.material);
  constructor() {
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
  }
  update(dinosaur: AnimatedDinosaur, light: LightingRig, groundY: number) {
    const avatar = dinosaur.mesh, height = Math.max(0, avatar.position.y - groundY);
    const spread = 1 + height * 0.09;
    this.mesh.position.set(-height * light.shadowSlope.x,
      groundY - 0.009, -height * light.shadowSlope.y);
    this.mesh.rotation.y = avatar.rotation.y;
    // Ducking widens the footprint; jumping separates it from the feet and
    // softens it without disappearing. Immunity blinking affects the shadow too.
    this.mesh.scale.set(.48 * avatar.scale.x * spread, 1,
      .82 * avatar.scale.z * spread);
    this.material.opacity = (0.29 / (1 + height * .24)) *
      (light.shadowStrength / .95) * (dinosaur.mesh.material as Material).opacity;
    this.mesh.visible = light.shadowStrength > 0;
  }
  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

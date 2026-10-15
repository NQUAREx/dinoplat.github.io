import {
  Color,
  DirectionalLight,
  HemisphereLight,
  Vector2,
  Vector3,
} from "three";
import { DayCycle } from "./day-cycle";

/** One movable sun. Shadow projection uses exactly the same light direction. */
export class LightingRig {
  readonly cycle = new DayCycle();
  readonly sun = new DirectionalLight(0xffffff, 1.5);
  readonly ambient = new HemisphereLight(0xffffff, 0xc49754, 2);
  readonly fogColour = new Color();
  readonly groundTint = new Color();
  readonly shadowSlope = new Vector2();
  shadowStrength = 0;
  shadowsEnabled = true;
  qualityShadows = true;
  private manualPosition = false;
  private readonly position = new Vector3();
  private readonly nightSky = new Color(0x839de0);
  private readonly daySky = new Color(0xffffff);
  private readonly nightGround = new Color(0x324e7c);
  private readonly dayGround = new Color(0xc49754);
  private readonly warmSun = new Color(0xffb56e);
  private readonly whiteSun = new Color(0xfff6dc);
  private readonly stops = [0, 4.5, 6.5, 8, 16, 18, 19.5, 24];
  private readonly sky = [
    0x202b55, 0x252b62, 0xffbd7a, 0x73d8ff, 0x73d8ff, 0xff9a74, 0x6b538f,
    0x202b55,
  ].map((hex) => new Color(hex));
  constructor() {
    this.sun.target.position.set(0, 0, -12);
    this.update(0);
  }
  setTimeOfDay(hours: number, automatic = false) {
    this.cycle.setTime(hours, automatic);
    this.manualPosition = false;
  }
  /** Camera-local position, not huge absolute map coordinates. No new light. */
  setSunPosition(x: number, y: number, z: number) {
    if (![x, y, z].every(Number.isFinite) || Math.hypot(x, y, z + 12) < 0.01)
      throw new Error("Invalid sun position");
    this.position.set(x, y, z);
    const elevationAngle = Math.atan2(y, Math.hypot(x, z + 12));
    this.cycle.setTime(
      x >= 0
        ? 6 + (elevationAngle * 12) / Math.PI
        : 18 - (elevationAngle * 12) / Math.PI,
    );
    this.manualPosition = true;
  }
  update(elapsed: number) {
    const hours = this.cycle.sample(elapsed);
    const angle = ((hours - 6) * Math.PI) / 12;
    if (!this.manualPosition)
      this.position.set(
        Math.cos(angle) * 40,
        Math.sin(angle) * 40,
        -12 + Math.cos(angle) * 18,
      );
    this.sun.position.copy(this.position);
    const dx = this.position.x,
      dy = this.position.y,
      dz = this.position.z + 12;
    const elevation = dy / Math.max(0.01, Math.hypot(dx, dy, dz));
    const day = Math.max(0, Math.min(1, elevation));
    const horizon = Math.max(0, Math.min(1, (day - 0.035) / 0.18));
    const strength = horizon * horizon * (3 - 2 * horizon);
    this.sun.intensity = 1.5 * strength;
    this.sun.color.copy(this.warmSun).lerp(this.whiteSun, day);
    const twilight = Math.max(0, 1 - Math.abs(elevation) * 5);
    this.ambient.intensity = 0.65 + 1.35 * day + twilight * 0.35;
    this.ambient.color.copy(this.nightSky).lerp(this.daySky, day);
    this.ambient.color.lerp(this.warmSun, twilight * 0.65);
    this.ambient.groundColor.copy(this.nightGround).lerp(this.dayGround, day);
    const brightness = 0.4 + 0.6 * day;
    this.groundTint.setRGB(
      brightness * (0.78 + 0.22 * day) + twilight * 0.25,
      brightness * (0.86 + 0.14 * day) + twilight * 0.12,
      brightness,
    );
    // Bound low-angle silhouette lengths to protect the numeric/render window.
    const denominator = Math.max(dy, Math.hypot(dx, dz) / 3, 0.01);
    this.shadowSlope.set(dx / denominator, dz / denominator);
    this.shadowStrength =
      this.shadowsEnabled && this.qualityShadows ? 0.32 * strength : 0;
    let stop = 0;
    while (stop < this.stops.length - 2 && hours > this.stops[stop + 1]) stop++;
    this.fogColour
      .copy(this.sky[stop])
      .lerp(
        this.sky[stop + 1],
        (hours - this.stops[stop]) / (this.stops[stop + 1] - this.stops[stop]),
      );
  }
  dispose() {
    this.sun.dispose();
  }
}

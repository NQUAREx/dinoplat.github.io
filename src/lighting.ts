import {
  Color,
  DirectionalLight,
  HemisphereLight,
  Vector2,
  Vector3,
} from "three";
import { DayCycle } from "./day-cycle";

/** One virtual source, smooth dimmed handoff to the opposite moonrise side. */
export class LightingRig {
  readonly cycle = new DayCycle();
  readonly key = new DirectionalLight(0xffffff, 1.8);
  readonly ambient = new HemisphereLight(0xffffff, 0xc49754, 1);
  readonly fogColour = new Color();
  readonly shadowSlope = new Vector2();
  source: "sun" | "moon" = "sun";
  shadowStrength = 0;
  shadowsEnabled = true;
  revision = 0;
  private manualPosition = false;
  private readonly position = new Vector3();
  private readonly nightSky = new Color(0x8498c9);
  private readonly daySky = new Color(0xffffff);
  private readonly nightGround = new Color(0x465675);
  private readonly dayGround = new Color(0xc49754);
  private readonly warmSun = new Color(0xffb56e);
  private readonly whiteSun = new Color(0xfff6dc);
  private readonly moonWhite = new Color(0xf1f3ff);
  private readonly stops = [0, 4.5, 6.5, 8, 16, 18, 19.5, 24];
  private readonly sky = [
    0x202b55, 0x252b62, 0xffbd7a, 0x73d8ff, 0x73d8ff, 0xff9a74, 0x6b538f,
    0x202b55,
  ].map((hex) => new Color(hex));
  constructor() {
    const shadow = this.key.shadow;
    this.key.castShadow = true;
    shadow.mapSize.set(256, 256);
    shadow.camera.left = -32;
    shadow.camera.right = 32;
    shadow.camera.bottom = -36;
    shadow.camera.top = 36;
    shadow.camera.near = 0.5;
    shadow.camera.far = 140;
    shadow.camera.updateProjectionMatrix();
    shadow.bias = -0.0003;
    shadow.normalBias = 0.035;
    shadow.autoUpdate = false;
    this.update(0);
  }
  setTimeOfDay(hours: number, automatic = false) {
    this.cycle.setTime(hours, automatic);
    this.manualPosition = false;
    this.revision++;
  }
  setSunPosition(x: number, y: number, z: number) {
    if (![x, y, z].every(Number.isFinite) || Math.hypot(x, y, z + 12) < 0.01)
      throw new Error("Invalid sun position");
    this.position.set(x, y, z);
    const angle = Math.atan2(y, Math.hypot(x, z + 12));
    this.cycle.setTime(
      x >= 0 ? 6 + (angle * 12) / Math.PI : 18 - (angle * 12) / Math.PI,
    );
    this.manualPosition = true;
    this.revision++;
  }
  update(elapsed: number) {
    const hours = this.cycle.sample(elapsed);
    this.source = hours >= 6 && hours < 18 ? "sun" : "moon";
    const angle = ((hours - 6) * Math.PI) / 12;
    const elevation = Math.sin(angle);
    const day = this.smooth((elevation + 0.15) / 0.5);
    const twilight = 4 * day * (1 - day);
    const orbitSide = 2 * this.smooth((elevation + 0.12) / 0.24) - 1;
    const handoff = this.smooth(Math.abs(elevation) / 0.24);
    // An artistic orbit stays above the horizon and travels continuously through
    // dawn/dusk. Avoid grazing-angle kilometre-long shadows and direction flips.
    if (!this.manualPosition)
      this.position.set(
        Math.cos(angle) * 40 * orbitSide,
        14 +
          (26 * Math.sqrt(elevation * elevation + 0.01)) / Math.sqrt(1.01) +
          14 * (1 - handoff),
        -12 + Math.cos(angle) * 18 * orbitSide + 10 * (1 - day),
      );
    this.key.target.position.set(0, 0, -12);
    this.key.position.copy(this.position);
    const dx = this.position.x,
      dy = this.position.y,
      dz = this.position.z + 12;
    this.key.intensity =
      (0.65 + 1.15 * day) * (this.manualPosition ? 1 : handoff);
    this.key.color
      .copy(this.moonWhite)
      .lerp(this.whiteSun, day)
      .lerp(this.warmSun, twilight * 0.55);
    this.ambient.intensity = 0.42 + 0.7 * day + twilight * 0.12;
    this.ambient.color.copy(this.nightSky).lerp(this.daySky, day);
    this.ambient.color.lerp(this.warmSun, twilight * 0.3);
    this.ambient.groundColor.copy(this.nightGround).lerp(this.dayGround, day);
    this.shadowStrength = this.shadowsEnabled
      ? (0.9 + 0.05 * day) * (this.manualPosition ? 1 : handoff)
      : 0;
    this.key.shadow.intensity = this.shadowStrength;
    const denom = Math.max(dy, Math.hypot(dx, dz) / 3, 0.01);
    this.shadowSlope.set(dx / denom, dz / denom);
    let stop = 0;
    while (stop < this.stops.length - 2 && hours > this.stops[stop + 1]) stop++;
    this.fogColour
      .copy(this.sky[stop])
      .lerp(
        this.sky[stop + 1],
        this.smooth(
          (hours - this.stops[stop]) /
            (this.stops[stop + 1] - this.stops[stop]),
        ),
      );
  }
  private smooth(value: number) {
    const t = Math.max(0, Math.min(1, value));
    return t * t * (3 - 2 * t);
  }
  /** Move the one shadow-map focus ahead of the delayed camera without rotating
   * the celestial light direction with the player. update() resets both first. */
  followView(heading: number) {
    const x = -12 * Math.sin(heading),
      z = 12 - 12 * Math.cos(heading);
    this.key.position.x += x;
    this.key.position.z += z;
    this.key.target.position.x += x;
    this.key.target.position.z += z;
  }
  dispose() {
    // LightShadow disposes its target; the renderer releases its owned depth
    // texture from that event. Do not dispose the same attachment twice.
    this.key.dispose();
  }
}

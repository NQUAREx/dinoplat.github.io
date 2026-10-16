import {
  Color,
  DirectionalLight,
  HemisphereLight,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  Vector2,
  Vector3,
} from "three";
import { DayCycle } from "./day-cycle";

/** One directional source switches from sun to white moonlight. No hidden sun
 * or second directional/shadow pass is evaluated at night. */
export class LightingRig {
  readonly cycle = new DayCycle();
  readonly key = new DirectionalLight(0xffffff, 1.8);
  readonly ambient = new HemisphereLight(0xffffff, 0xc49754, 1);
  readonly moon = new Mesh(
    new IcosahedronGeometry(0.9, 0),
    new MeshBasicMaterial({
      color: 0xf5f6e5,
      fog: false,
      depthTest: false,
      depthWrite: false,
    }),
  );
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
    this.moon.renderOrder = -1;
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
    const moon = this.source === "moon";
    const angle = (((moon ? (hours + 12) % 24 : hours) - 6) * Math.PI) / 12;
    if (!this.manualPosition || moon)
      this.position.set(
        Math.cos(angle) * (moon ? 36 : 40) + (moon ? 12 : 0),
        Math.max(2, Math.sin(angle) * (moon ? 32 : 40)),
        -12 + Math.cos(angle) * (moon ? 14 : 18) + (moon ? 10 : 0),
      );
    this.key.target.position.set(0, 0, -12);
    this.key.position.copy(this.position);
    const dx = this.position.x,
      dy = this.position.y,
      dz = this.position.z + 12;
    const elevation = dy / Math.max(0.01, Math.hypot(dx, dy, dz));
    const strength = Math.max(0, Math.min(1, (elevation - 0.025) / 0.2));
    const day = moon ? 0 : Math.max(0, elevation);
    const twilight = moon
      ? Math.max(0, 1 - elevation * 6)
      : Math.max(0, 1 - elevation * 5);
    this.key.intensity = (moon ? 0.65 : 1.8) * strength;
    this.key.color.copy(moon ? this.moonWhite : this.warmSun);
    if (!moon) this.key.color.lerp(this.whiteSun, day);
    this.ambient.intensity = moon ? 0.42 : 0.65 + 0.6 * day + twilight * 0.3;
    this.ambient.color.copy(this.nightSky).lerp(this.daySky, day);
    if (!moon) this.ambient.color.lerp(this.warmSun, twilight * 0.5);
    this.ambient.groundColor.copy(this.nightGround).lerp(this.dayGround, day);
    this.shadowStrength = this.shadowsEnabled
      ? (moon ? 0.9 : 0.95) * strength
      : 0;
    this.key.shadow.intensity = this.shadowStrength;
    this.moon.visible = moon && elevation > 0.08;
    const denom = Math.max(dy, Math.hypot(dx, dz) / 3, 0.01);
    this.shadowSlope.set(dx / denom, dz / denom);
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
    // LightShadow disposes its target; the renderer releases its owned depth
    // texture from that event. Do not dispose the same attachment twice.
    this.key.dispose();
    this.moon.geometry.dispose();
    this.moon.material.dispose();
  }
}

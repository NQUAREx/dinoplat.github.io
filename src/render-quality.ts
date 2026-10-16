/** A stable 30Hz Safari/Low Power cadence is not evidence of GPU overload.
 * Keep detail unless sustained frame intervals fall below a usable 25fps budget.
 * Hysteresis prevents resolution pumping; never upscale an undersized pixel grid
 * with nearest-neighbour CSS (pixel art filtering belongs to the texture only). */
import { Tuning } from "./tuning";
export class RenderQuality {
  static get pixelBudget() {
    return Tuning.rendering.pixelBudget;
  }
  quality = 1;
  meanFrameSeconds = 0;
  private elapsed = 0;
  private frames = 0;
  private cooldown = 0;
  ratio(width: number, height: number, dpr: number) {
    const ceiling = Math.min(
      Math.max(1, dpr),
      Tuning.rendering.maxDpr,
      Math.sqrt(RenderQuality.pixelBudget / (width * height)),
    );
    return Math.min(
      ceiling,
      Math.max(Math.min(1, ceiling), ceiling * this.quality),
    );
  }
  sample(dt: number) {
    if (dt <= 0 || dt > 0.25) return false;
    this.elapsed += dt;
    this.frames++;
    this.cooldown += dt;
    if (this.elapsed < 2) return false;
    this.meanFrameSeconds = this.elapsed / this.frames;
    this.elapsed = this.frames = 0;
    const previous = this.quality;
    if (this.cooldown >= 6 && this.meanFrameSeconds > 0.04)
      this.quality = Math.max(0.6, this.quality - 0.1);
    else if (this.cooldown >= 12 && this.meanFrameSeconds < 0.035)
      this.quality = Math.min(1, this.quality + 0.05);
    if (previous !== this.quality) {
      this.cooldown = 0;
      return true;
    }
    return false;
  }
}

/** Shared phase for every pickup. Simulation and rendering sample the same clock. */
export class PickupMotion {
  static amplitude = 0.1;
  static period = 2.4;
  angle = 0;
  bob = 0;
  update(time: number) {
    const phase = (time % PickupMotion.period) / PickupMotion.period;
    this.angle = phase * Math.PI * 2;
    this.bob = Math.sin(this.angle) * PickupMotion.amplitude;
  }
}

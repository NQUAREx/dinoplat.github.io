import { Rules } from "./config";

/** Root-only recoil, side fall and two damped ground bounces. No bone animation. */
export class DeathMotion {
  x = 0;
  y = 0;
  z = 0;
  roll = 0;
  sample(age: number, heading: number, startY = 0) {
    const u = Math.max(0, Math.min(1, age / 0.5)),
      fall = u * u * (3 - 2 * u);
    this.roll = -Math.PI * 0.5 * fall;
    const side = Math.sin(this.roll) * 0.72 - 0.08 * fall,
      back = 0.4 * fall;
    const bounce =
      age >= 0.5 && age < 0.9
        ? Math.sin(((age - 0.5) / 0.4) * Math.PI) * 0.22
        : age >= 0.9 && age < Rules.deathSeconds
          ? Math.sin(((age - 0.9) / 0.35) * Math.PI) * 0.065
          : 0;
    this.x = side * Math.cos(heading) + back * Math.sin(heading);
    this.z = -side * Math.sin(heading) + back * Math.cos(heading);
    this.y =
      0.72 +
      (0.44 - 0.72) * fall -
      Math.cos(this.roll) * 0.72 +
      Math.max(0, bounce) +
      startY * (1 - fall);
  }
}

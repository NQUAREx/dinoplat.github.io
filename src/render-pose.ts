import type { Simulation } from "./simulation";

/** One interpolated origin for the entire frame: avatar, ground, cacti and dust. */
export class RenderPose {
  x = 0;
  distance = 0;
  z = 0;
  heading = 0;
  update(game: Simulation, alpha: number) {
    this.x = game.previousX + (game.x - game.previousX) * alpha;
    this.z = game.previousZ + (game.z - game.previousZ) * alpha;
    this.heading =
      game.previousHeading + (game.heading - game.previousHeading) * alpha;
    this.distance =
      game.previousDistance + (game.distance - game.previousDistance) * alpha;
  }
}

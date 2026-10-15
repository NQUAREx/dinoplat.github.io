import type { Simulation } from "./simulation";

/** One interpolated origin for the entire frame: avatar, ground, cacti and dust. */
export class RenderPose {
  x = 0;
  distance = 0;
  update(game: Simulation, alpha: number) {
    this.x = game.previousX + (game.x - game.previousX) * alpha;
    this.distance =
      game.previousDistance + (game.distance - game.previousDistance) * alpha;
  }
}

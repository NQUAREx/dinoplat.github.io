import { GridMath } from "./config";
import { Tuning } from "./tuning";

/** A reversible 2D world cannot paint biomes using odometer distance: turning
 * would drag the border through stationary cacti. Seeded 500m regions stay put;
 * opposite checkerboard palettes guarantee different neighbouring materials. */
export class TerrainField {
  static readonly originX = 137.5;
  static readonly originZ = 91.25;
  static materialAt(column: number, row: number, seed: number) {
    return (GridMath.hash(column, row, seed) & 7) * 2 + ((column + row) & 1);
  }
  static at(x: number, z: number, seed: number) {
    return TerrainField.materialAt(
      Math.floor((x + TerrainField.originX) / Tuning.terrain.regionMetres),
      Math.floor((z + TerrainField.originZ) / Tuning.terrain.regionMetres),
      seed,
    );
  }
}

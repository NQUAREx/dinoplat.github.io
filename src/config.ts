/** Shared numeric rules, no rendering or browser dependencies. Forward is world Z. */
export class Rules {
  static readonly step = 1 / 120;
  static readonly turnSpeed = 1.6;
  static readonly blockingRadius = 0.22;
  static readonly cactusHitScale = 0.65;
  static readonly pickupSpawnChance = 0.9;
  static readonly maxSpeed = 24;
  static readonly startSpeed = 12;
  static readonly immunitySeconds = 2;
  static readonly hitStopSeconds = 1;
  static readonly cactusScale = 2;
  static readonly chunkSize = 16;
  static readonly candidatesPerChunk = 6;
  static readonly pickupsPerChunk = 4;
  static readonly slotsPerChunk =
    Rules.candidatesPerChunk + Rules.pickupsPerChunk;
  static readonly firstRow = 28;
  static readonly rowSlots = 15;
  static readonly maxColumns = 15;
  static readonly poolSize =
    Rules.rowSlots * Rules.maxColumns * Rules.slotsPerChunk;
  static readonly playerRadius = 0.32;
  static readonly playerBodyHeight = 1.3;
  static readonly duckBodyHeight = 0.65;
  static readonly duckDuration = 0.85;
  static readonly duckBlendSpeed = 12;
  static readonly diveSpeed = 22;
  static readonly gravity = 22;
  // Preserve jump clearance after doubling cactus height (v² / 2g).
  static readonly jumpSpeed = 13.3;
  static readonly runFramesPerMetre = 0.9;
  static readonly stepStride = 4 / Rules.runFramesPerMetre;
}
export class Palette {
  static readonly sky = 0x73d8ff;
  static readonly dust = 0xf4c66a;
  static readonly shade = 0x9a743f;
}
export class GridMath {
  static mod(value: number, divisor: number) {
    return ((value % divisor) + divisor) % divisor;
  }
  static hash(x: number, z: number, seed: number) {
    let h = Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(z | 0, 0x5f356495) ^ seed;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return (h ^ (h >>> 16)) >>> 0;
  }
}

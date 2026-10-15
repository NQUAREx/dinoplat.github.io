/** Independent randomness, editable weights, no immediate repeats. */
export const TERRAIN_LENGTH = 500;
export const TERRAIN_TRANSITION = 10;
export class TerrainLayout {
  static readonly tileSize = 128;
  static readonly atlasColumns = 10;
  static readonly layers = 97;
  static readonly variants = 4;
  static readonly stoneLayer = 64;
  static readonly transitionLayer = 65;
  static readonly exitTransitionLayer = 81;
  static readonly worldTileSize = 5;
}
export const TERRAIN_WEIGHTS = [
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
] as const;
export const TERRAIN_NAMES = [
  "Светлые дюны",
  "Золотой песок",
  "Рыжие дюны",
  "Песок с галькой",
  "Терракота",
  "Каменистая земля",
  "Песчаные валуны",
  "Песчаник",
  "Красный сланец",
  "Серая галька",
  "Лиловая земля",
  "Сухая земля",
  "Травяная тропа",
  "Оазис",
  "Мшистая земля",
  "Вулканический камень",
] as const;
export class Terrain {
  segment = 0;
  previous = 0;
  current = 0;
  next = 0;
  private state = 1;
  constructor(seed = 1) {
    this.reset(seed);
  }
  reset(seed: number) {
    this.state = (seed ^ 0x9e3779b9) >>> 0 || 1;
    this.segment = 0;
    this.current = this.pick(-1);
    this.previous = this.current;
    this.next = this.pick(this.current);
  }
  private pick(exclude: number) {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    let total = 0;
    for (let i = 0; i < TERRAIN_WEIGHTS.length; i++)
      if (i !== exclude) total += TERRAIN_WEIGHTS[i];
    let threshold = (this.state / 4294967296) * total;
    for (let i = 0; i < TERRAIN_WEIGHTS.length; i++) {
      if (i === exclude) continue;
      threshold -= TERRAIN_WEIGHTS[i];
      if (threshold < 0) return i;
    }
    return TERRAIN_WEIGHTS.length - 1;
  }
  advance(distance: number) {
    while (this.segment < Math.floor(distance / TERRAIN_LENGTH)) {
      this.previous = this.current;
      this.current = this.next;
      this.next = this.pick(this.current);
      this.segment++;
    }
  }
}

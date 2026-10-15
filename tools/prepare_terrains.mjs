import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
const execute = promisify(execFile);
import { PixelQuilter } from "./pixel-quilter.mjs";

/** Offline only. Runtime gets one prepacked, independently mipmapped array. */
class TerrainAtlasBuilder {
  quilter = new PixelQuilter();
  async image(path, width, height) {
    const { stdout } = await execute(
      "magick",
      [
        fileURLToPath(new URL(path, import.meta.url)),
        "-filter",
        "point",
        "-resize",
        `${width}x${height}!`,
        "-modulate",
        "100,120,100",
        "-depth",
        "8",
        "rgba:-",
      ],
      { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 },
    );
    return stdout;
  }
  extract(source, width, ox, oy, height = 128) {
    const tile = Buffer.alloc(128 * height * 4);
    for (let y = 0; y < height; y++)
      source.copy(
        tile,
        y * 128 * 4,
        ((oy + y) * width + ox) * 4,
        ((oy + y) * width + ox + 128) * 4,
      );
    return tile;
  }
  variant(source, id) {
    if (id === 0) return Buffer.from(source);
    const tile = Buffer.alloc(source.length);
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) {
        let u = x,
          v = y;
        if (id === 1) {
          u = y;
          v = 127 - x;
        }
        if (id === 2) {
          u = 127 - x;
          v = 127 - y;
        }
        if (id === 3) {
          u = 127 - y;
          v = x;
        }
        u = (u + id * 37) % 128;
        v = (v + id * 53) % 128;
        source.copy(
          tile,
          (y * 128 + x) * 4,
          (v * 128 + u) * 4,
          (v * 128 + u + 1) * 4,
        );
      }
    return this.quilter.interior(source, tile);
  }
  async build() {
    const [baseSource, transitionSource, stoneSource] = await Promise.all([
      this.image("../art/terrain-atlas-source.png", 512, 512),
      this.image("../art/terrain-transitions-source.png", 512, 256),
      this.image("../art/terrain-stone-source.png", 128, 128),
    ]);
    const base = [];
    for (let i = 0; i < 16; i++) {
      const tile = this.extract(
        baseSource,
        512,
        (i % 4) * 128,
        Math.floor(i / 4) * 128,
      );
      base.push(this.quilter.periodic(tile));
    }
    const layers = [];
    for (const tile of base)
      for (let variant = 0; variant < 4; variant++)
        layers.push(this.variant(tile, variant));
    const stone = this.quilter.periodic(stoneSource);
    layers.push(stone);
    for (let i = 0; i < 16; i++) {
      const tile = this.extract(
        transitionSource,
        512,
        (i % 4) * 128,
        Math.floor(i / 4) * 64,
        64,
      );
      // Read the irregular border from the painted connector. Bake continuous
      // base/stone interiors on its two sides (hard mask, never alpha layering).
      // Both UV phases now continue into the adjacent full tile, not just its
      // very last pixel row; this avoids a straight seam inside the stone.
      const original = Buffer.from(tile),
        boundary = new Uint8Array(128);
      const isStone = (x, y) => {
        const at = (y * 128 + x) * 4;
        const r = original[at],
          g = original[at + 1],
          b = original[at + 2];
        return r - g < 27 && Math.abs(b - g) < 24 && r - b < 45;
      };
      for (let x = 0; x < 128; x++) {
        boundary[x] = 33;
        for (let y = 25; y < 42; y++) {
          let grey = 0;
          for (let dy = 0; dy < 4; dy++)
            for (let dx = -1; dx <= 1; dx++)
              if (isStone((x + dx + 128) % 128, y + dy)) grey++;
          if (grey >= 10) {
            boundary[x] = y;
            break;
          }
        }
      }
      const edge = Math.round((boundary[0] + boundary[127]) / 2);
      for (let x = 0; x < 5; x++) {
        const blend = x / 5;
        boundary[x] = Math.round(edge * (1 - blend) + boundary[x] * blend);
        boundary[127 - x] = Math.round(
          edge * (1 - blend) + boundary[127 - x] * blend,
        );
      }
      for (let y = 0; y < 64; y++)
        for (let x = 0; x < 128; x++) {
          const at = (y * 128 + x) * 4;
          if (x >= 6 && x < 122 && Math.abs(y - boundary[x]) <= 1) continue; // Preserve painted rubble/outline.
          const source = y < boundary[x] ? base[i] : stone;
          const sy = y < boundary[x] ? y : y + 64;
          source.copy(tile, at, (sy * 128 + x) * 4, (sy * 128 + x + 1) * 4);
        }

      const square = Buffer.alloc(128 * 128 * 4);
      for (let y = 0; y < 128; y++)
        tile.copy(
          square,
          y * 128 * 4,
          Math.floor(y / 2) * 128 * 4,
          (Math.floor(y / 2) + 1) * 128 * 4,
        );
      layers.push(square);
    }
    const width = 9 * 128,
      atlas = Buffer.alloc(width * width * 4);
    for (let i = 0; i < layers.length; i++)
      for (let y = 0; y < 128; y++)
        layers[i].copy(
          atlas,
          ((Math.floor(i / 9) * 128 + y) * width + (i % 9) * 128) * 4,
          y * 128 * 4,
          (y + 1) * 128 * 4,
        );
    await new Promise((resolve, reject) => {
      const child = execFile(
        "magick",
        [
          "-size",
          `${width}x${width}`,
          "-depth",
          "8",
          "rgba:-",
          "-dither",
          "None",
          "-colors",
          "256",
          "-strip",
          "-define",
          "webp:lossless=true",
          fileURLToPath(
            new URL("../src/assets/terrains.webp", import.meta.url),
          ),
        ],
        (error) => (error ? reject(error) : resolve()),
      );
      child.stdin.end(atlas);
    });
    console.log(
      `Prepared ${layers.length} layers: 64 varied bases, one stone, 16 drawn transitions.`,
    );
  }
}
await new TerrainAtlasBuilder().build();

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
const execute = promisify(execFile);
import { PixelQuilter } from "./pixel-quilter.mjs";

/** Offline only. Runtime gets one prepacked, independently mipmapped array. */
class TerrainAtlasBuilder {
  quilter = new PixelQuilter();
  async image(path, width, height, saturation = 120) {
    const { stdout } = await execute(
      "magick",
      [
        fileURLToPath(new URL(path, import.meta.url)),
        "-filter",
        "point",
        "-resize",
        `${width}x${height}!`,
        "-modulate",
        `100,${saturation},100`,
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
      this.image("../art/terrain-transitions-attached.jpg", 512, 256, 100),
      this.image("../art/terrain-stone-source.png", 128, 128),
    ]);
    const base = [];
    const entries = [],
      exits = [];
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
      const square = Buffer.alloc(128 * 128 * 4);
      for (let y = 0; y < 128; y++)
        tile.copy(
          square,
          y * 128 * 4,
          Math.floor(y / 2) * 128 * 4,
          (Math.floor(y / 2) + 1) * 128 * 4,
        );
      const rotated = Buffer.alloc(square.length);
      for (let y = 0; y < 128; y++)
        for (let x = 0; x < 128; x++) {
          const from = ((127 - y) * 128 + 127 - x) * 4;
          square.copy(rotated, (y * 128 + x) * 4, from, from + 4);
        }
      // Keep the entire authored border/rocks. Only narrow endpoint collars
      // receive minimum-error hard cuts to the neighbouring periodic surfaces.
      entries.push(this.collars(square, base[i], stone));
      exits.push(this.collars(rotated, stone, base[i]));
    }
    layers.push(...entries, ...exits);
    const width = 10 * 128,
      atlas = Buffer.alloc(width * width * 4);
    for (let i = 0; i < layers.length; i++)
      for (let y = 0; y < 128; y++)
        layers[i].copy(
          atlas,
          ((Math.floor(i / 10) * 128 + y) * width + (i % 10) * 128) * 4,
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
      `Prepared ${layers.length} layers: 64 varied bases, one stone, 16 drawn entries and 16 rotated exits.`,
    );
  }
  collars(painted, start, end) {
    const result = Buffer.from(painted);
    const top = this.quilter.cut(8, 128, (p, x) =>
      this.quilter.error(
        painted,
        ((p + 2) * 128 + x) * 4,
        start,
        ((p + 2) * 128 + x) * 4,
      ),
    );
    const bottom = this.quilter.cut(8, 128, (p, x) =>
      this.quilter.error(
        painted,
        ((p + 118) * 128 + x) * 4,
        end,
        ((p + 118) * 128 + x) * 4,
      ),
    );
    for (let x = 0; x < 128; x++)
      for (let y = 0; y < 128; y++) {
        const source =
          y <= top[x] + 2 ? start : y >= bottom[x] + 118 ? end : null;
        if (source) {
          const at = (y * 128 + x) * 4;
          source.copy(result, at, at, at + 4);
        }
      }
    return result;
  }
}
await new TerrainAtlasBuilder().build();

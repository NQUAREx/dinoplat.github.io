// Historical VOX archive authoring only; NOT the current collectibles pipeline.
// Use npm run collectibles:build for tools/low-poly-collectibles.mjs and the GLB.
// Original voxel authoring tool. HUD silhouettes/palettes become solid stepped
// volumes, not textured planes. ImageMagick is an OFFLINE tool, never runtime.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const execute = promisify(execFile);

class CollectibleBuilder {
  async build(name, icon, width, height, depth, palette) {
    const { stdout: rgba } = await execute(
      "magick",
      [
        fileURLToPath(new URL(`../art/hud-icons/${icon}.png`, import.meta.url)),
        "-filter",
        "point",
        "-resize",
        `${width}x${height}!`,
        "-depth",
        "8",
        "rgba:-",
      ],
      { encoding: "buffer" },
    );
    const colours = palette.map((hex) => [
      (hex >>> 16) & 255,
      (hex >>> 8) & 255,
      hex & 255,
    ]);
    const cells = new Uint8Array(width * height);
    for (let i = 0; i < cells.length; i++) {
      if (rgba[i * 4 + 3] < 128) continue;
      let nearest = 0,
        error = Infinity;
      for (let p = 0; p < colours.length; p++) {
        const rgb = colours[p];
        const d =
          (rgba[i * 4] - rgb[0]) ** 2 +
          (rgba[i * 4 + 1] - rgb[1]) ** 2 +
          (rgba[i * 4 + 2] - rgb[2]) ** 2;
        if (d < error) {
          error = d;
          nearest = p;
        }
      }
      cells[i] = nearest + 1;
    }
    const filled = (x, y) =>
      x >= 0 && x < width && y >= 0 && y < height && cells[y * width + x] > 0;
    const voxels = [];
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const colour = cells[y * width + x];
        if (!colour) continue;
        // Two stepped bevels: narrow perimeter and thicker centre. Every cell is
        // a cubic voxel; both icon faces retain the same colours when spinning.
        let inset = 0;
        for (let radius = 1; radius <= 2; radius++) {
          if (
            filled(x - radius, y) &&
            filled(x + radius, y) &&
            filled(x, y - radius) &&
            filled(x, y + radius)
          )
            inset++;
          else break;
        }
        const halfDepth = Math.min((depth - 1) / 2, inset);
        const middle = (depth - 1) / 2;
        for (let z = middle - halfDepth; z <= middle + halfDepth; z++)
          voxels.push(x, z, height - 1 - y, colour);
      }
    const u32 = (values) => {
      const b = Buffer.alloc(values.length * 4);
      values.forEach((value, i) => b.writeUInt32LE(value >>> 0, i * 4));
      return b;
    };
    const chunk = (id, content, children = Buffer.alloc(0)) =>
      Buffer.concat([
        Buffer.from(id),
        u32([content.length, children.length]),
        content,
        children,
      ]);
    const pal = Buffer.alloc(1024);
    colours.forEach((rgb, i) => {
      pal.set(rgb, i * 4);
      pal[i * 4 + 3] = 255;
    });
    const children = Buffer.concat([
      chunk("SIZE", u32([width, depth, height])),
      chunk(
        "XYZI",
        Buffer.concat([u32([voxels.length / 4]), Buffer.from(voxels)]),
      ),
      chunk("RGBA", pal),
    ]);
    const target = new URL("../art/collectibles/", import.meta.url);
    await mkdir(target, { recursive: true });
    await writeFile(
      new URL(`${name}.vox`, target),
      Buffer.concat([
        Buffer.from("VOX "),
        u32([150]),
        chunk("MAIN", Buffer.alloc(0), children),
      ]),
    );
    console.log(
      `${name}: ${width}×${height}×${depth}, ${voxels.length / 4} voxels, ${colours.length} colours`,
    );
  }
}
const builder = new CollectibleBuilder();
await Promise.all([
  builder.build(
    "coin",
    "coin",
    17,
    15,
    5,
    [0x101b26, 0xffd800, 0xffac00, 0xffc000, 0xfffff4],
  ),
  builder.build(
    "diamond",
    "diamond",
    18,
    15,
    5,
    [0x101b26, 0x00d5d8, 0x00a3b6, 0x007a94, 0x91f8f5, 0xf0ffff],
  ),
  builder.build(
    "heart",
    "live",
    18,
    16,
    5,
    [0x101b26, 0xff202b, 0xdf061c, 0xff6975, 0xffd2ce],
  ),
]);

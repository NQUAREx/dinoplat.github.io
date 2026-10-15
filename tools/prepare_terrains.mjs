// Optional authoring step; the checked-in WebP needs no tools at build/runtime.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const pixels = execFileSync("magick", [
  fileURLToPath(new URL("../art/terrain-atlas-source.png", import.meta.url)),
  "-filter", "point", "-resize", "512x512!", "-depth", "8", "rgba:-",
], { maxBuffer: 4 * 1024 * 1024 });
// Match opposing edges in a narrow 8px strip, not by mirroring whole patterns.
// Most of each supplied design stays untouched; shared texels match exactly.
const seam = (a, b, weight) => {
  for (let channel = 0; channel < 3; channel++) {
    const left = pixels[a + channel], right = pixels[b + channel];
    pixels[a + channel] = Math.round(left + (right - left) * weight);
    pixels[b + channel] = Math.round(right + (left - right) * weight);
  }
};
for (let layer = 0; layer < 16; layer++) {
  const ox = layer % 4 * 128, oy = Math.floor(layer / 4) * 128;
  const at = (x, y) => ((oy + y) * 512 + ox + x) * 4;
  for (let y = 0; y < 128; y++)
    for (let edge = 0; edge < 8; edge++)
      seam(at(edge, y), at(127 - edge, y), (1 - edge / 7) * 0.5);
  for (let x = 0; x < 128; x++)
    for (let edge = 0; edge < 8; edge++)
      seam(at(x, edge), at(x, 127 - edge), (1 - edge / 7) * 0.5);
}
execFileSync("magick", [
  "-size", "512x512", "-depth", "8", "rgba:-",
  "-dither", "None", "-colors", "128", "-strip", "-define", "webp:lossless=true",
  fileURLToPath(new URL("../src/assets/terrains.webp", import.meta.url)),
], { input: pixels });

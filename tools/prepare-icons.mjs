import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
const execute = promisify(execFile);
class IconBuilder {
  async build() {
    await Promise.all(
      ["coin", "diamond", "live", "pause", "record"].map(async (name) => {
        await execute("magick", [
          fileURLToPath(
            new URL(`../art/hud-icons/${name}.png`, import.meta.url),
          ),
          "-filter",
          "point",
          "-resize",
          "32x32",
          "-strip",
          fileURLToPath(
            new URL(`../src/assets/icons/${name}.png`, import.meta.url),
          ),
        ]);
      }),
    );
  }
}
await new IconBuilder().build();

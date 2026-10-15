import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Offline SVG rasterization through the existing development browser. No new deps.
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH ||
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  args: ["--no-sandbox"],
});
try {
  const svg = await readFile(
    new URL("../public/icons/icon.svg", import.meta.url),
    "utf8",
  );
  for (const [size, name] of [
    [192, "icon-192"],
    [512, "icon-512"],
    [180, "apple-touch-icon"],
  ]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<style>html,body{margin:0;overflow:hidden}svg{display:block;width:100vw;height:100vh}</style>${svg}`,
    );
    await page.screenshot({
      path: fileURLToPath(
        new URL(`../public/icons/${name}.png`, import.meta.url),
      ),
    });
    await page.close();
  }
} finally {
  await browser.close();
}

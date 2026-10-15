# Local assets and licences

All assets are served from this static site. No runtime calls to OpenGameArt, Google Fonts or other CDNs.

## Sand road

- File: `src/assets/sand.webp` (128×128, 2024 bytes).
- Source: [2048 Digitally Painted Tileable Desert Sand Texture — OpenGameArt](https://opengameart.org/content/2048-digitally-painted-tileable-desert-sand-texture), author **txturs**.
- Licence: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- Original albedo: https://opengameart.org/sites/default/files/sand_1.jpg.
- Hand-painted dunes replace the former photographic sand. Reduced to 12 flat colours, with no dithering or photographic grain; a warm material tint gives a strong cartoon/cel-painted appearance. A pixel-atlas alternative was inspected but not included because its grain pattern formed visible dashed grid lines when repeated.
- Only the colour map is used. No normal / bump / displacement / roughness maps, PBR shader, extra lights or decoder.
- Prepared using ImageMagick: `magick sand_1.jpg -resize 128x128! -dither None -colors 12 -strip -define webp:lossless=true sand.webp`.
- Uploaded once, mipmapped, repeated and scrolled using a bounded UV offset. Approximate RGBA GPU memory including mipmaps: 85 KiB. GPU memory depends on browser implementation. `assetsInlineLimit: 0` preserves an independent cacheable texture asset even though it is smaller than 4 KiB.

## Pixel font

- File: `src/assets/fonts/press-start-2p.woff2` (29 920 bytes).
- Font: **Press Start 2P**, copyright 2012 The Press Start 2P Project Authors (cody@zone38.net).
- Source: [Google Fonts, Press Start 2P](https://github.com/google/fonts/tree/main/ofl/pressstart2p).
- Original TTF: https://raw.githubusercontent.com/google/fonts/main/ofl/pressstart2p/PressStart2P-Regular.ttf.
- Licence: **SIL Open Font License 1.1**. Full notice and licence are included in `src/assets/fonts/OFL.txt` and distributed as `public/licenses/OFL-PressStart2P.txt` (copied to `dist/licenses/` on build).
- Losslessly converted from TTF to WOFF2 with fontTools / Brotli. No glyph changes or subsetting. Cyrillic, Latin, digits and arrows are retained. Locally hosted, no third-party font requests.

## Original project assets

`src/assets/dinosaur.glb`, `art/dinosaur.blend`, the Python generator and the small pixel dinosaur SVG in `index.html` were authored for this project. The dinosaur GLB has vertex colours and no textures; the only Three.js texture is the sand road. The UI font and SVG do not add WebGL texture objects.

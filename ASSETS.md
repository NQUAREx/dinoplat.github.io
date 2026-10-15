# Local assets and licences

All assets are served from this static site. No runtime calls to Poly Haven, Google Fonts or other CDNs.

## Sand road

- File: `src/assets/sand.webp` (256×256, 11 766 bytes).
- Source: [Sand 01 — Poly Haven](https://polyhaven.com/a/sand_01), author **Rob Tuytel**.
- Licence: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
- Original albedo: https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/sand_01/sand_01_diff_1k.jpg.
- Selected after comparing Sand 01 / 02 / 03 and Aerial Sand: the compacted pattern gives useful movement cues without strong tyre tracks or large pebbles. A warm material tint integrates it with the light pixel palette.
- Only the colour map is used. No normal / bump / displacement / roughness maps, PBR shader, extra lights or decoder.
- Prepared using ImageMagick: `magick sand_01_diff_1k.jpg -resize 256x256! -strip -quality 82 sand.webp`.
- Uploaded once, mipmapped, repeated and scrolled using a bounded UV offset. Approximate RGBA GPU memory including mipmaps: 341 KiB. GPU memory depends on browser implementation.

## Pixel font

- File: `src/assets/fonts/press-start-2p.woff2` (29 920 bytes).
- Font: **Press Start 2P**, copyright 2012 The Press Start 2P Project Authors (cody@zone38.net).
- Source: [Google Fonts, Press Start 2P](https://github.com/google/fonts/tree/main/ofl/pressstart2p).
- Original TTF: https://raw.githubusercontent.com/google/fonts/main/ofl/pressstart2p/PressStart2P-Regular.ttf.
- Licence: **SIL Open Font License 1.1**. Full notice and licence are included in `src/assets/fonts/OFL.txt` and distributed as `public/licenses/OFL-PressStart2P.txt` (copied to `dist/licenses/` on build).
- Losslessly converted from TTF to WOFF2 with fontTools / Brotli. No glyph changes or subsetting. Cyrillic, Latin, digits and arrows are retained. Locally hosted, no third-party font requests.

## Original project assets

`src/assets/dinosaur.glb`, `art/dinosaur.blend`, the Python generator and the small pixel dinosaur SVG in `index.html` were authored for this project. The dinosaur GLB has vertex colours and no textures; the only Three.js texture is the sand road. The UI font and SVG do not add WebGL texture objects.

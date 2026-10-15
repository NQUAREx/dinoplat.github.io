# Local assets and licences

All assets are served from this static site. No runtime calls to OpenGameArt, Google Fonts or other CDNs.

## Pixel terrain array

- File: `src/assets/terrains.webp`, 512×512, **108 282 bytes**, 16 cells in a 4×4 grid, 128×128 per material.
- Reference supplied by the user: https://chatgpt.com/s/m_6ad0f47f37dc8191bb6ba760102e41b4 . Original 1536×1024 image is preserved in `art/terrain-reference.png`. Treat this as user-provided reference art, not an asserted CC0 asset; its upstream copyright/licence has not been independently established.
- `art/terrain-atlas-source.png`: AI-assisted production adaptation of that reference. The sixteen original material identities, row-major order, palette and pixel-art style were retained; ragged patches on black were extended into fully filled square cells. No black background remains in the runtime atlas.
- `npm run terrain:build` runs `tools/prepare_terrains.mjs`: nearest-neighbour reduction to 512×512, matching opposing edges within an 8px strip, 128-colour quantisation without dithering and lossless WebP compression. Narrow edge matching avoids the obvious symmetry of full-tile mirroring. Original art PNGs are not included in the site build.
- Runtime: decode once into a `DataArrayTexture`, 16 independent 128×128 sRGB layers, nearest magnification, trilinear mipmaps, anisotropy 1. Approximate RGBA GPU memory including mipmaps: **1.33 MiB** (implementation dependent). One texture object, no per-segment loading, allocations or new draw calls. Browser resource tests verify all 16 layers and stable resource counts across 100 restarts.
- Each square spans 5.25×5.25 world metres; UV scroll is bounded. The road's small unlit shader takes one texture sample outside transitions, two within a spatial 16m transition, and adds distance fog. No normal / bump / displacement maps, PBR, postprocessing or extra lights.
- Coverings are independently seeded and change every 500m. All sixteen configurable weights are 1; the current material is excluded from the next draw, so remaining candidates each have probability 1/15. Previous/current/next IDs preserve the boundary when the player crosses it.
- The former OpenGameArt sand asset was removed; it is not shipped or requested anymore.

## Pixel font

- File: `src/assets/fonts/press-start-2p.woff2` (29 920 bytes).
- Font: **Press Start 2P**, copyright 2012 The Press Start 2P Project Authors (cody@zone38.net).
- Source: [Google Fonts, Press Start 2P](https://github.com/google/fonts/tree/main/ofl/pressstart2p).
- Original TTF: https://raw.githubusercontent.com/google/fonts/main/ofl/pressstart2p/PressStart2P-Regular.ttf.
- Licence: **SIL Open Font License 1.1**. Full notice and licence are included in `src/assets/fonts/OFL.txt` and distributed as `public/licenses/OFL-PressStart2P.txt` (copied to `dist/licenses/` on build).
- Losslessly converted from TTF to WOFF2 with fontTools / Brotli. No glyph changes or subsetting. Cyrillic, Latin, digits and arrows are retained. Locally hosted, no third-party font requests.

## Original project assets

`src/assets/dinosaur.glb`, `art/dinosaur.blend`, the Python generator and the small pixel dinosaur SVG in `index.html` were authored for this project. The dinosaur GLB has vertex colours and no textures; the only Three.js texture object is the terrain array. The UI font and SVG do not add WebGL texture objects.

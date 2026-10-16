# Local assets and attribution

All runtime assets are local static files, with no third-party CDN requests.

## dino3d voxel models — GPLv3

- Source: https://github.com/hushenghao/dino3d , commit **cae7ed3da5646839e6aaa24f698b8c07cc3ffc85**. Original upstream author: **© 2020 Abraham Tugalov**, https://howdyho.net . See upstream README for other contributors. Licence: **GNU GPL version 3**; preserved in LICENSE and public/licenses/GPL-3.0.txt.
- The project owner explicitly approved distributing DinoPlat3d under compatible GPLv3 terms. The menu links the licence/source and states the lack of warranty.
- Original preferred editable files are preserved in `art/reference-models/t-rex/` (0–7.vox and death.vox, upstream other/wow.vox) and `art/reference-models/cactus/` (six upstream cactus/fcactus variants). The original author used MagicaVoxel. No upstream game code, old Three.js, Howler, vox.js or Nebula is included in this game.
- Modified adaptation by DinoPlat3d, 2026-10-15: original `tools/build-reference-models.mjs` reads VOX, emits only exposed coloured surfaces, greedily merges coplanar same-colour faces, indexes shared vertices, stores normalized vertex colours and converts axes/scales for our rear camera.
- Runtime: `src/assets/voxel-models.glb`, **661 040 bytes**, 19 meshes: eight running poses, one death pose, seven original low-poly cacti and three project-authored voxel pickups. The filename is historical; cacti are NOT voxel geometry. No images, texture maps, skeleton, Draco/KTX decoders or runtime VOX parser. Source editable geometry stays outside dist. Original cactus VOX files are archival attribution/source only: neither builder nor runtime reads them.
- Run/jump/death integration and foot dust are written for this project. Running swaps cached poses; jumping chooses takeoff/falling poses, with height controlled by our simulation; foot dust uses one fixed instanced pool. Upstream animation/gameplay implementation is not copied.
- `src/assets/model-colliders.json` is regenerated with the model library and holds normalized variant bounds. Cactus yaw is included in collision extents. The retired hand-made Blender dinosaur, GLB and generator were removed from the current tree; history retains them.

## Cartoon terrain and painted connectors

- User-provided reference: https://chatgpt.com/s/m_6ad0f47f37dc8191bb6ba760102e41b4 . Preserved in `art/terrain-reference.png` (1536×1024). This is user-supplied art, not an asserted CC0 asset; independent upstream rights have not been established.
- `art/terrain-atlas-source.png`: AI-assisted adaptation into 16 filled swatches, keeping the supplied identities/order and pixel-art style. `art/terrain-transitions-source.png`: AI-assisted hand-drawn-style material-to-common-stone connectors; the organic pixel borders are opaque art, not runtime material overlays. `art/terrain-stone-source.png` supplies the one common stone tile.
- `art/terrain-transitions-attached.jpg` is the exact 1280×640 sheet reattached by the user. The builder crops its 4×4 rectangular tiles, preserves the full authored interiors/borders/rocks, and creates separate exits rotated **180 degrees** (both axes, not a vertical mirror). The earlier mask-replacement process is removed. Only narrow endpoint collars receive minimum-error hard cuts to neighbouring surfaces; no colour modulation of the attached source. Browser tests compare the packed interiors against the attachment in both orientations.
- `tools/prepare_terrains.mjs` and `tools/pixel-quilter.mjs` perform offline size/palette preparation and minimum-error hard-cut quilting for base patterns. Four rotated/phase-shifted interiors share edge phases; no mirrored patterns, blurred seam bands or runtime overlays. Build with `npm run terrain:build` (ImageMagick).
- Runtime atlas: `src/assets/terrains.webp`, **529 386 bytes**, 10×10 cells of 128×128 (three unused). It decodes once into **97 DataArrayTexture layers**: 64 base variants, one shared stone, 16 entries and 16 rotated exits. Independent mipmaps prevent layer bleeding. RGBA memory including mipmaps is about **8.1 MiB**, implementation dependent.
- A base tile now covers **2.5×2.5m**; painted strips are 1.25m in / 2.5m stone / 1.25m out. Nearest magnification, LINEAR_MIPMAP_LINEAR minification to reduce subpixel shimmer. Unchanged authored art and one opaque albedo sample, no source repacking, biome overlays or N² connectors.
- `TerrainSurface` is project-authored indexed low-poly terrain, 192m / 24×24 cells / 1152 triangles, normals and height-provider hooks. Currently flat; future relief/decoration anchors can reuse it. World-anchored cells and wrapped shader cell hashes preserve texture identity across origin changes. Standard Lambert lighting/shadow/fog pipeline replaces hand tinting. No normal/bump/displacement maps, PBR or postprocessing; source PNGs stay outside dist.
- The retired planar voxel-silhouette/stencil shadow path is removed. One generated runtime 256² BasicShadowMap (colour + native depth attachments) supports future nonflat/low-poly receivers and day/moonlight. No imported shadow art or additional downloaded texture. Cached captures at 8Hz/4Hz, continuous origin correction, shared model instances and explicit GPU ownership.
- No visible moon asset/mesh. One virtual directional-light slot moves continuously through day/night with interpolated colour/intensity, plus a hemisphere ambient. The dinosaur uses a project-authored 16-triangle contact ellipse, animated from its interpolated height/yaw/duck; no texture or additional shadow target. It is an approximate footprint, not an exact silhouette.

## Original low-poly cacti

- Editable original source: `tools/low-poly-cacti.mjs`, included under the project GPLv3. Broad bevels, six/eight-sided stems, faceted pads and coral flowers. Seven silhouettes: saguaro, tall fork, flowering barrel, flowering shrub, twin towers, prickly pear and candelabra. General saturated/chunky cartoon art direction; no Brawl Stars assets are copied.
- Built offline by `npm run model:build`, one indexed vertex-colour mesh per variant, **548/548/316/668/568/548/592 triangles**. Soft body/bevel normals, vertical green ribs, raised pale areoles, short solid triangular spines, rounded pads and coral/yellow blossoms. Linear vertex colours packed as normalized Uint8; no added textures, materials or draw calls. Pole degenerates removed. All seven world-size envelopes remain unchanged (2.1–3.1m tall). Collider JSON comes from final normalized model bounds; renderer and registry apply the same 2× scale exactly once.
- Art direction references: the owner's attached Brawl Stars environment screenshot, [Supercell's official cactus artwork](https://supercell.com/en/safe-fair-play/) and [EDEK's vertex-colour stylized cactus example](https://www.fab.com/listings/a0b6e6ec-6eba-432d-a1aa-ade32d753b0a). References were inspected online; no meshes, textures, character faces or source code were downloaded/copied. Models remain original project-authored GPLv3 assets. Existing shadows, dinosaur, HUD and authored terrain art are retained.

## Original DinoPlat HUD icons

- User-owned original repository: https://github.com/NQUAREx/dinoplat.github.io/tree/main/resources/images/icons . Requested icons: coin.png, diamond.png, live.png, record.png, pause.png. No changes are published to the original repository.
- Original PNGs are preserved in `art/hud-icons/`; optimized runtime copies are under `src/assets/icons/`. `npm run icons:build` nearest-resizes them to at most 32×32 and strips metadata. In particular, the original 1600×1600 pause icon is not decoded at that size during gameplay.
- These are supplied from the user's project at their request; no unverified third-party licence is claimed. The distance footsteps SVG and menu mascot are project-authored. DOM images/SVGs are not WebGL texture objects.

## Project-authored voxel collectibles

- Generated for this project from the user-owned HUD coin/diamond/heart silhouettes and palettes, not downloaded third-party models. Editable MagicaVoxel sources: `art/collectibles/coin.vox`, `diamond.vox`, `heart.vox`. Distributed with the project under GPLv3; original icon rights remain as noted above.
- Original authoring tool `tools/build-collectibles.mjs` samples 17×15, 18×15 and 18×16 pixels with nearest filtering, quantizes to five/six saturated icon colours and builds solid cubic voxels with a two-step bevel and five-cell central thickness. Both faces retain the icon colours. These are real volumes (819/665/696 voxels), not textured extruded image planes.
- `npm run collectibles:build` uses offline ImageMagick, writes VOX files and runs the existing colour-aware greedy mesher/GLB builder. The runtime does not load source PNG/VOX files or require modelling software. The GLB contains `pickup-coin`, `pickup-diamond`, `pickup-heart`: **748/900/800 triangles**, heights **0.75/0.7/0.7m**. Removed internal faces, indexed vertices, vertex colours, one shared opaque material and three bounded instanced banks; no new texture maps or animation clips.
- Rotation/bobbing is project-authored numerical animation, with one shared phase for all items, driven by simulation time and interpolated for rendering. Pickup colliders conservatively cover every yaw; bob is included in vertical collision and culling.

## Home-screen app icons

- `public/icons/icon.svg` adapts the project-authored menu mascot, not an upstream model/image. Saturated project palette, crisp SVG edges, opaque sky background.
- `public/icons/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (180²) are generated by `npm run app-icons:build` using the existing Playwright Chromium development dependency; no new runtime libraries or external icon requests. The three PNGs total about 3.9KB.
- `public/manifest.webmanifest` references relative icon/start/scope paths for GitHub Pages. Manifest/Apple metadata enable home-screen launch; they do not guarantee an install prompt, offline mode or fullscreen in an ordinary iPhone tab. No Service Worker added.

## Pixel font

- `src/assets/fonts/press-start-2p.woff2`, **29 920 bytes**, Press Start 2P, © 2012 The Press Start 2P Project Authors (cody@zone38.net).
- Source: https://github.com/google/fonts/tree/main/ofl/pressstart2p . **SIL Open Font License 1.1**, preserved in src/assets/fonts/OFL.txt and public/licenses/OFL-PressStart2P.txt. Cyrillic/Latin/digits retained; locally hosted WOFF2, no glyph modifications.

## Libraries and developer skills

Three.js retains its MIT licence in npm distribution; Vite, TypeScript and test tools remain development dependencies as listed in package-lock.json. No imported reference-game runtime dependencies were added.

Development used installed threejs-loaders and threejs-geometry skills from CloudAI-X/threejs-skills (commit b1c623076c661fc9b03dac19292e825a5d106823): async one-time asset loading, explicit geometry/material ownership, greedy/indexed meshes and pooled instancing. These are development guidance, not game dependencies.

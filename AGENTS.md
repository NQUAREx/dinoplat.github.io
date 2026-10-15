# DinoPlat3d: project conventions

## Scope and publishing

- Work only in this repository. `NQUAREx/dinoplat.github.io` hosts a separate live 2D game; never push these changes there.
- This is a static browser game for GitHub Pages. Build with Vite and publish `dist/`. No backend, external asset CDN, runtime Blender or server-only code.

## Product and art direction

- A friendly, bright, child-oriented pixel game: mint sky, warm sand, leaf-green buttons, coral accents and dark readable outlines.
- All UI text uses the locally hosted pixel font, including Cyrillic. Buttons have square/stepped corners, hard pixel borders and a pressed state. No rounded modern dashboard design, dark theme, blur, glass or expensive effects.
- Centre all menus, button groups, HUD and instructional text on the portrait playfield. Do not move controls to screen corners.
- Touch-only, portrait gameplay. Require touch capability and a coarse pointer; unsupported desktops show a phone prompt without loading GPU assets. No keyboard/mouse gameplay or desktop layout. Landscape devices get a rotation prompt and a paused simulation; returning requires explicit resume.
- Exactly **five obstacle columns**, generated from `LANES`, never hard-coded last-column indices or mask limits. Dinosaur X is continuous: holding either screen half integrates lateral velocity until release/cancel. No destination increments, half-column steps or lane snapping. Interpolate the rendered pose between fixed simulation steps. No white separators; preserve the reachable safe route.
- Crossing the screen midpoint during a hold reverses direction. Up-swipe jumps before finger release, suppressing lateral steering for the rest of that gesture. Clear held input on pause, reset, collision, visibility loss, orientation changes and lost capture. Never restore a stale hold after resume.
- Turn the dinosaur smoothly to ±45° while actually moving sideways, and back to 0° when moving straight. Its body collider is rotation-invariant; visual pose does not change collision rules. Collision checks follow actual swept position, including positions between obstacle columns.
- White low-poly dinosaur and white cube obstacles. Sixteen cartoon pixel terrains based on `art/terrain-reference.png`: sand, clay, rock, grass, volcanic stone. Preserve the reference style; no photographic textures. Keep obstacle contrast and readability.
- Close portrait camera: vertical FOV 50°, position Y=10/Z=12, look at Y=1/Z=-5, far plane 64m. Follow 75% of the rendered player's X so edge positions remain visible without pulling the camera away to fit the entire road. The road may extend past the sides near the player; do not restore the old distant all-road framing. Fog depth 24–56m must match the custom ground shader and finish before the far plane.

## Implementation and performance

- Three.js + TypeScript + Vite; minimal dependencies. `simulation.ts` stays independent of Three.js and DOM.
- Fixed-step simulation, actual-position swept collisions, pooled typed arrays, instanced obstacles. No allocations or creation/disposal of objects in the game loop.
- Derive road width, player bounds, pool capacity and obstacle-column X positions from constants. Rows must always have at least one obstacle and at least one safe column; the safe column changes at most one column per row. Player position and steering must not depend on column indices.
- Prefer one draw call for the dinosaur and one for all obstacles. No shadows, postprocessing, normal maps or physics engines.
- Cull each cube with its full AABB against the actual camera frustum, using reused bounds/matrices. Never remove a still-visible trailing cube at a fixed near-player cutoff. Recycle rows only behind `ROW_RECYCLE_Z=-16`; camera tests must prove all cubes are offscreen before that point, including camera X follow and narrow/short phone aspects.
- Ground: one local 512×512 atlas, decoded once into one 16-layer DataArrayTexture (128×128 each, sRGB, mipmaps, nearest magnification). Correct edge seams offline, no whole-tile mirroring or texture atlas bleeding. Keep square world-space texels, bounded UVs, one road draw call; sample two layers only in transition bands. `npm run terrain:build` reproduces the optimized WebP; authoring PNGs must not enter dist.
- Covering changes every 500m; `terrain.ts` owns an independent seeded weighted RNG, with all 16 weights currently 1. Exclude the current covering from the next draw. Keep previous/current/next states so the spatial 16m transition stays continuous across a segment boundary; never swap the entire visible road at once. This is visual only and cannot change obstacle generation or collisions.
- Font is local WOFF2; preserve upstream licences and attribution.
- Keep adaptive render resolution, pause on visibility/orientation changes, optional storage and graceful WebGL 2 / asset failure handling.
- Model source is `art/dinosaur.blend`; regenerate with `npm run model:build`. Runtime asset is `src/assets/dinosaur.glb`. Blender is not needed for CI/build/play.

## Verification and handoff

- Run `npm test`, `npm run build` and `npm run test:browser` for gameplay/rendering changes. Cover sustained touch without pointermove events, fractional X/release/cancel, midpoint reversal, +/-45-degree turns, no mouse/keyboard controls, all five columns, swept collisions/gaps, safe route at max speed, jumps, restart, portrait/rotation suspension, all terrain layers and exact 500m changes.
- Inspect portrait screenshots, including a narrow phone and a short viewport. Pixel font Cyrillic must load; centred menus and controls must fit.
- Test texture count and resource stability after repeated restarts. Never claim a device FPS without measurements on that device.
- Update README / VERIFICATION when architecture, style, compatibility or measured resource budgets change. Keep historical measurements clearly labelled.

# DinoPlat3d: project conventions

## Scope and publishing

- Work only in this repository. `NQUAREx/dinoplat.github.io` hosts a separate live 2D game; never push these changes there.
- This is a static browser game for GitHub Pages. Build with Vite and publish `dist/`. No backend, external asset CDN, runtime Blender or server-only code.

## Product and art direction

- A friendly, bright, child-oriented pixel game: mint sky, warm sand, leaf-green buttons, coral accents and dark readable outlines.
- All UI text uses the locally hosted pixel font, including Cyrillic. Buttons have square/stepped corners, hard pixel borders and a pressed state. No rounded modern dashboard design, dark theme, blur, glass or expensive effects.
- Centre all menus, button groups, HUD and instructional text on the portrait playfield. Do not move controls to screen corners.
- Portrait gameplay only. Desktop gets a centred portrait playfield; coarse-pointer landscape devices get a rotation prompt and a paused simulation. Returning to portrait requires explicit resume. Do not add a landscape gameplay layout or camera branch.
- Exactly **five obstacle columns**, generated from `LANES`, never hard-coded last-column indices or mask limits. The dinosaur moves freely along X and starts at X=0: one tap/keypress moves its target by 1 world unit, not a column. No lane snapping or white lane separators. Preserve the reachable safe route.
- Turn the dinosaur smoothly to ±45° while actually moving sideways, and back to 0° when moving straight. Its body collider is rotation-invariant; visual pose does not change collision rules. Collision checks follow actual swept position, including positions between obstacle columns.
- White low-poly dinosaur, white cube obstacles, one small repeating **cartoon** sand albedo. Use simple warm colours and bold hand-drawn/pixel shapes, never photographic gravel/noise. Keep contrast and obstacle readability; avoid visual clutter.
- Camera looks 10 degrees further down than the original camera; keep the entire road width visible at the player in narrow portrait views.

## Implementation and performance

- Three.js + TypeScript + Vite; minimal dependencies. `simulation.ts` stays independent of Three.js and DOM.
- Fixed-step simulation, actual-position swept collisions, pooled typed arrays, instanced obstacles. No allocations or creation/disposal of objects in the game loop.
- Derive road width, player bounds, pool capacity and obstacle-column X positions from constants. Rows must always have at least one obstacle and at least one safe column; the safe column changes at most one column per row. Player movement and target position must not depend on column indices.
- Prefer one draw call for the dinosaur and one for all obstacles. No shadows, postprocessing, normal maps or physics engines.
- Sand texture: one local power-of-two albedo, maximum 256×256, mipmaps, bounded scrolling offset; reuse and dispose once. Font is local WOFF2; preserve upstream licences and attribution.
- Keep adaptive render resolution, pause on visibility/orientation changes, optional storage and graceful WebGL 2 / asset failure handling.
- Model source is `art/dinosaur.blend`; regenerate with `npm run model:build`. Runtime asset is `src/assets/dinosaur.glb`. Blender is not needed for CI/build/play.

## Verification and handoff

- Run `npm test`, `npm run build` and `npm run test:browser` for gameplay/rendering changes. Tests must cover continuous X positions, one-unit input, +/-45-degree turns, all five obstacle columns, gaps between cubes, safe route at maximum speed, jumps, restart, portrait UI and landscape suspension.
- Inspect portrait screenshots, including a narrow phone and a short viewport. Pixel font Cyrillic must load; centred menus and controls must fit.
- Test texture count and resource stability after repeated restarts. Never claim a device FPS without measurements on that device.
- Update README / VERIFICATION when architecture, style, compatibility or measured resource budgets change. Keep historical measurements clearly labelled.

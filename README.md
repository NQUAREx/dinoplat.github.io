# Dino Plat 3D

[Play on a portrait phone](https://nquarex.github.io/DinoPlat3d/)

A lightweight, touch-only endless 3D runner built with Three.js 0.186.1, TypeScript and Vite. Static files only: **no game server, Node.js runtime, accounts or CDN are required on GitHub Pages**. The separate original DinoPlat repository/game is untouched.

## Controls

- Hold the left/right half to turn continuously in that direction. Release to keep running along the new heading. Full 360° movement, no lanes/boundaries; speed never stops during normal play.
- Camera follows turns with a short 0.28s delay. Distance counts travelled path length, including sideways/backward travel, not a world coordinate.
- Release a hold and make a separate upward swipe to jump. Downward swipe dives in the air or ducks for 0.85s on the ground. Vertical gestures never start steering.
- A stationary hold classifies after 40ms, horizontal intent after 3px; a moving pending swipe is not converted to steering by a timer. A committed hold cannot later turn into a jump—use a separate gesture.
- Bottom-left Pause opens settings for sound, vibration, camera shake and fullscreen. Portrait touch browsers only; keyboard/mouse and landscape gameplay are intentionally unsupported.
- Damage displays a small 2D -1 heart notice and freezes the contact pose for one second, including fatal hits; then two seconds of immunity/blinking and temporary start speed. Pickups display +1 icons; a full-health heart displays MAX. Pause freezes timers and restart clears feedback.
- Coins/diamonds survive new runs via a validated, year-long, project-scoped cookie. Hearts restore one up to three. Browser privacy/deletion can clear storage; this is a client-side prototype economy, not secure server money.

## iPhone / Android rendering

- Fixed the old whole-canvas `image-rendering:pixelated` enlargement and aggressive resolution reduction that treated a healthy 30Hz Safari cadence as overload.
- Rendering now requests native antialiasing, uses normal canvas compositing, caps DPR at 2 and physical pixels at 1.3M, and does not reduce ordinary phone buffers below one CSS pixel per pixel. Icons/fonts and terrain magnification retain pixel-art filtering. Terrain mipmaps and at most 2× anisotropy reduce distant shimmer.
- Sustained frame intervals above40ms can reduce resolution with6s hysteresis; recovery requires12s healthy cadence. Stable30Hz does not progressively lower quality. This trades some extra fill cost for clarity; it is not proof of higher FPS on every device.
- The owner's screenshot shows a yellow battery/Low Power Mode. [WebKit documents a 30fps requestAnimationFrame throttle in Low Power Mode](https://bugs.webkit.org/show_bug.cgi?id=168837). Turn it off when comparing smoothness. Web code cannot override OS refresh/power/thermal limits, and cloud tests cannot guarantee Brawl Stars/native-game performance.
- Android/compatible browsers request fullscreen on Play/Resume user activation and fall back safely on denial. Normal iPhone Safari tabs cannot be forced fullscreen: Share → Add to Home Screen, then launch the installed icon. The local manifest/icons support standalone/fullscreen display; offline play is not implemented.
- Native touch selection/callout, scrolling, overscroll, dragging, tap flash and zoom gestures are disabled; settings sliders and attribution links remain usable. Landscape, background, fullscreen exit and context loss pause rather than silently continuing.

## Art and procedural world

- Original angular cartoon dinosaur inspired by the owner's watch/keyring references: long chamfered muzzle, large eyes/teeth, tapered turquoise body and tail, cream belly and coral plates. 788 triangles /11 bones /five cached blended run, jump, duck, hit, death clips; appearance is independent of the stable body collider.
- Seven detailed cactus variants with enlarged spines/rounded bumps and2–8 enlarged scattered stones:750/774/468/930/886/810/936 triangles. Seven simplified copies omit detail:192/192/48/192/168/192/192 triangles. No additional textures or separate detail objects.
- Distance-based **LOD**: detailed within22m, low beyond30m, complementary opaque4×4 dither fade between. Both tiers are preloaded with identical core normalization/positions. No network requests, per-obstacle LOD nodes or geometry generation during play.
- One cached local `src/assets/game-models.glb`:18 meshes /589812 bytes, no texture maps or external decoders. Editable original generators: `tools/low-poly-dinosaur.mjs`, `tools/low-poly-cacti.mjs`. Only coin/diamond/heart meshes remain voxel models matching HUD icons. Imported GPL VOX art is archival only, not runtime dinosaur/cactus geometry.
- World positions are continuous Float64 X/Z with a bounded symmetric15×15 chunk ring:2250 numeric slots, not2250 rendered objects. Actual instances are full-volume camera culled, with a small shadow-caster guard. Deterministic candidates in a numerical neighbourhood allow turns/revisits without near-camera spawning or an ever-growing scene.
- Cacti use yaw-aware swept collision and hard-core spacing. Separate pickup RNG preserves cactus distribution; coin:diamond:heart weights250:10:1. Safe continuous corridors remain reserved and tested with a delayed heading-steering pilot at maximum speed.
- Ground is a world-anchored lit224m low-poly mesh (1568 triangles), 2.5m pixel tiles and original painted material↔stone transitions. Seeded500×500m regions extend in both axes and remain fixed on revisits; terrain cannot use the odometer as Z anymore. Every adjacent region differs, all16 types equally likely. Existing odometer milestone metadata is independent.
- One shared 97-layer128² terrain array (~8.1MiB RGBA/mips), no overlapping floor planes. Origin rebases preserve UV/tile identity, including negative and huge coordinates, and do not re-upload flat geometry.
- 128 pooled8-triangle dust puffs, one draw,18 per step/30 on landing. Heading-relative world-anchored trails; stronger running bob (+50% versus the previous build) and landing impulse respect shake settings/reduced motion.
- One360s day/night cycle, smooth fog/ambient and opposite-side virtual moonlight; no visible moon or second sun/map. Cached256² shadows stay enabled at low quality; their focus follows the delayed view without rotating celestial direction. Dinosaur uses a separate small jump/duck-aware contact shadow.

## Local development

Requires Node.js22+ and npm.

```sh
npm ci
npm run dev
# open the forwarded port5173 on a touch device / browser mobile emulation
npm run build
npm run preview
```

Codex Cloud: start the dev server and use its forwarded browser port/preview if the client provides one. Desktop browsers need touch/mobile emulation; otherwise the intentional phone prompt appears without loading GPU assets. If no preview/port forwarding is offered, use the deployed Pages link or run the commands locally.

```sh
npm run model:build          # offline original character/cacti + voxel pickups → GLB
npm run collectibles:build   # requires ImageMagick, rebuilds pickups + GLB
npm run terrain:build        # requires ImageMagick; preserves authored connectors
npm test
npm run test:browser         # Playwright Chromium
npm run test:mobile          # Playwright Chromium + WebKit
```

Install Playwright browser binaries/system dependencies as required by your environment. Some managed hosts need `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` only after the needed libraries are available. Test outputs/screenshots go to ignored `test-results/`.

## GitHub Pages

The committed workflow `.github/workflows/pages.yml` builds/tests and deploys `dist/` on main. If Pages needs manual activation:

1. Open NQUAREx/DinoPlat3d → Settings → Pages.
2. Under Build and deployment → Source choose **GitHub Actions** (not a branch).
3. Enable Actions if disabled; run **Build and deploy static game** or push to main.
4. Wait for the deploy job/environment to finish, then open the URL above.

Vite uses relative asset paths so the `/DinoPlat3d/` subpath works on static hosting. Only development/build needs Node.js; Pages serves HTML/JS/CSS/fonts/GLB/WebP/icons. No backend routes or server-only code.

## Architecture and verification

- `Simulation`, `WorldSpawner`, `ObjectRegistry`, wallet/health/bonus/events: numeric gameplay, fixed pools and extension contracts (future bonuses/enemies/destruction are not active features).
- `RenderPose`, `CameraRig`, `View`, instanced renderers and `RenderQuality`: one floating origin, delayed camera, LOD/culling and bounded adaptive rendering.
- `TerrainSurface`, `TerrainField`, `Ground`, `LightingRig`, `CachedShadows`: world-fixed biomes and lit terrain, one cached map with moving focus. The Three r186 upload-epoch fix must remain: actual GPU-matrix readback tests cover rotating cameras/shadow captures.
- `ModelLibrary`, `AnimatedDinosaur`, `FootDust`, `FloatingFeedback`: explicit GPU/animation/DOM ownership, no runtime model generation or per-pickup node creation.
- `MobileBrowser`, `GestureRecognizer`, `GameUI`, `CurrencyCookies`, sound/haptics/settings: mobile lifecycle/gesture/UI/persistence, user-activated optional browser features.

Budget after warm-up: up to35 draws during shadow/LOD overlap,21 otherwise;21 geometries /4 textures, stable fixed pools. Finite100-restart tests are evidence of bounded resources, not proof against every leak. Physical-device FPS remains unmeasured. See [VERIFICATION.md](VERIFICATION.md), [ASSETS.md](ASSETS.md), and [AGENTS.md](AGENTS.md) for current results, licensing and mandatory invariants.

GPL-3.0-only; no warranty. Preserve source/attribution when redistributing. Original reference artwork and third-party notices are documented in ASSETS.md.

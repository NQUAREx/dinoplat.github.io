# Dino Run

[Play on a portrait phone](https://nquarex.github.io/DinoPlat3d/)

A lightweight, touch-only endless 3D runner built with Three.js 0.186.1, TypeScript and Vite. Static files only: **no game server, Node.js runtime, accounts or CDN are required on GitHub Pages**. The separate original DinoPlat repository/game is untouched.

## Controls

- Hold the left/right half to turn continuously in that direction. Release to keep running along the new heading. Full 360° movement, no lanes/boundaries; speed never stops during normal play.
- Camera follows turns with a 0.42s delay. Distance counts travelled path length, including sideways/backward travel, not a world coordinate.
- Release a hold and make a separate upward swipe to jump. Downward swipe dives in the air or ducks for 0.85s on the ground. Vertical gestures never start steering.
- A stationary hold classifies after 36ms, horizontal intent after 2.7px; a moving pending swipe is not converted to steering by a timer. A committed hold cannot later turn into a jump—use a separate gesture.
- Consecutive top-left tabs open Home, Shop and Settings only before a run or after death. Pause is separate and contains only Resume and Settings. Sound effects and music have independent saved toggles. Camera shake stays fixed at290%; landing impact is50% stronger, respecting reduced motion. Portrait touch browsers only; keyboard/mouse and landscape gameplay are intentionally unsupported.
- Damage displays a small 2D -1 heart notice and freezes the contact pose for one second, including fatal hits; then two seconds of immunity/blinking and temporary start speed. Pickups display +1 icons; a full-health heart displays MAX. Pause freezes timers and restart clears feedback.
- Coins/diamonds survive new runs via a validated, year-long, project-scoped cookie. Hearts restore one up to three. Browser privacy/deletion can clear storage; this is a client-side prototype economy, not secure server money.
- Shop shows a sticky coin/diamond balance, refreshed after purchases. Home, Shop and Settings share the world background; the rotatable character preview retains its own framed area. Menus draw on interaction only, not an idle loop, and use no extra WebGL context or background texture.
- Jump flight lasts about1.008s (16.7% shorter), with the same4.020m apex/obstacle clearance. Take-off speed15.96m/s and gravity31.68m/s² replace13.3/22; jump/dive collisions remain swept.

## iPhone / Android rendering

- Fixed the old whole-canvas `image-rendering:pixelated` enlargement and aggressive resolution reduction that treated a healthy 30Hz Safari cadence as overload.
- Rendering now requests native antialiasing, uses normal canvas compositing, caps DPR at 2 and physical pixels at 1.3M, and does not reduce ordinary phone buffers below one CSS pixel per pixel. Icons/fonts and terrain magnification retain pixel-art filtering. Terrain mipmaps and at most 2× anisotropy reduce distant shimmer.
- Sustained frame intervals above40ms can reduce resolution with6s hysteresis; recovery requires12s healthy cadence. Stable30Hz does not progressively lower quality. This trades some extra fill cost for clarity; it is not proof of higher FPS on every device.
- The owner's screenshot shows a yellow battery/Low Power Mode. [WebKit documents a 30fps requestAnimationFrame throttle in Low Power Mode](https://bugs.webkit.org/show_bug.cgi?id=168837). Turn it off when comparing smoothness. Web code cannot override OS refresh/power/thermal limits, and cloud tests cannot guarantee Brawl Stars/native-game performance.
- Android/compatible browsers request fullscreen on Play/Resume user activation and fall back safely on denial. Normal iPhone Safari tabs cannot be forced fullscreen: Share → Add to Home Screen, then launch the installed icon. The local manifest/icons support standalone/fullscreen display; offline play is not implemented.
- Native touch selection/callout, scrolling, overscroll, dragging, tap flash and zoom gestures are disabled; settings buttons and attribution links remain usable. Landscape, background, fullscreen exit and context loss pause rather than silently continuing.

## Art and procedural world

- Home shows a larger touch-rotatable3D dinosaur with equipped accessories, result, record and wallet. Four dinosaur cards: free green, white750coins, pink60diamonds, gold1000diamonds. Three hats cost240/360coins or75diamonds; three shoes270/360coins or60diamonds. Locked prices show currency icons. Purchases/equipment persist in localStorage; spending persists in the wallet cookie. Closed soles cover the feet. Cosmetics never change physics or speed.
- Fatal contact freezes for1s, then the stopped dinosaur falls sideways and bounces for1.25s before Home. No bone death animation is required. First-person temporarily returns to the rear camera for the fall. Dust emits from alternating animated planted feet; landing emits from both feet.
- Richer audio uses13 selected Kenney CC0 cues, varied footsteps/pitches, layered reward/impact feedback and an original quiet16s music loop. One160KB local MP3, one cached decoded buffer, eight bounded SFX channels plus music, compressor protection. No autoplay before touch; independent music/effects toggles; pause and background stop all playback. No streaming/CDN/runtime audio library. Sources/notices in art/audio and public/licenses/kenney-audio.txt.
- Bottom-right camera button switches between delayed third-person and first-person views. Both views use the same .42s heading smoothing. A .65s sinusoidally eased position/rotation/FOV transition preserves the ongoing run. First person hides the dinosaur and follows jumping/crouching. Turning is1.6rad/s; third-person follow delay is.42s. Crouching retains an animated distance-driven walking gait.
- Original angular cartoon dinosaur inspired by the owner's watch/keyring references: long chamfered muzzle, large eyes/teeth, tapered turquoise body and tail, cream belly and coral plates. 788 triangles /11 bones /five cached blended run, jump, duck, hit, death clips; appearance is independent of the stable body collider.
- Seven detailed cactus variants with enlarged spines/rounded bumps and2–8 enlarged scattered stones:750/774/468/930/886/810/936 triangles. Seven simplified copies omit detail:192/192/48/192/168/192/192 triangles. No additional textures or separate detail objects.
- Distance-based **LOD**: detailed within22m, low beyond30m, complementary opaque4×4 dither fade between. Both tiers are preloaded with identical core normalization/positions. No network requests, per-obstacle LOD nodes or geometry generation during play.
- One cached local `src/assets/game-models.glb`:27 meshes /653724 bytes, no texture maps or external decoders. Editable original generators: `tools/low-poly-dinosaur.mjs`, `tools/low-poly-cacti.mjs`. Coin/diamond/heart are original volumetric low-poly models (192/48/84 triangles), matching HUD palettes; source tools/low-poly-collectibles.mjs. Imported GPL VOX art is archival only, not runtime dinosaur/cactus geometry.
- World positions are continuous Float64 X/Z with a bounded symmetric15×15 chunk ring:2250 numeric slots, not2250 rendered objects. Actual instances are full-volume camera culled, with a small shadow-caster guard. Deterministic candidates in a numerical neighbourhood allow turns/revisits without near-camera spawning or an ever-growing scene.
- Cacti use forgiving simple swept collision (.65× cactus half extents plus .22m body radius), separate from full visual/culling bounds, and and hard-core spacing. Separate pickup RNG preserves cactus distribution; coin:diamond:heart weights250:10:1, with10% fewer pickup candidates via an independent deterministic gate. Safe continuous corridors remain reserved and tested with a delayed heading-steering pilot at maximum speed.
- Ground is a world-anchored lit224m low-poly mesh (1568 triangles), 2.5m pixel tiles and original painted material↔stone transitions. Seeded500×500m regions extend in both axes and remain fixed on revisits; terrain cannot use the odometer as Z anymore. Every adjacent region differs, all16 types equally likely. Existing odometer milestone metadata is independent.
- One shared 97-layer128² terrain array (~8.1MiB RGBA/mips), no overlapping floor planes. Origin rebases preserve UV/tile identity, including negative and huge coordinates, and do not re-upload flat geometry.
- 256 pooled8-triangle dust puffs, one draw,42 per step/72 on landing with varied lift and .85s lifetime. Heading-relative world-anchored trails; stronger running bob (+50% versus the previous build) and landing impulse respect fixed290% shake/reduced motion.
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
npm run model:build          # offline characters/accessories/cacti/pickups → GLB
npm run shop:build           # ten actual-model WebP thumbnails (Chromium + ffmpeg)
npm run audio:build          # local CC0 clips + original music → MP3 (ffmpeg)
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

Budget after warm-up: up to38 draws during shadow/LOD overlap with accessories,24 otherwise; at most30geometries/5textures with the full wardrobe and preview. The default100-restart probe stays at21geometries/5textures. Fixed pools and finite tests are evidence of bounded resources, not proof against every leak. Physical-device FPS remains unmeasured. See [VERIFICATION.md](VERIFICATION.md), [ASSETS.md](ASSETS.md), and [AGENTS.md](AGENTS.md) for current results, licensing and mandatory invariants.

GPL-3.0-only; no warranty. Preserve source/attribution when redistributing. Original reference artwork and third-party notices are documented in ASSETS.md.

## Optional Codex communication skill

The environment has the authentic [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) skill installed globally using `DO_NOT_TRACK=1 npx --yes skills add JuliusBrussee/caveman --skill caveman --agent codex --global --yes`. Installed file: `/home/agent/.agents/skills/caveman/SKILL.md`; its Git blob hash matches the official source: `9a94044529e5ee1576361c891b4a271504518e6f`. This installs the skill only, not Caveman's proxy, model routing or CLI suite. It does not add a game dependency or change code/documentation style. Global installation belongs to this environment; a different environment needs installation again.

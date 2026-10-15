# DinoPlat3d: development rules

## Scope, licence and reference

- Change only `NQUAREx/DinoPlat3d`. Never publish changes to the separate live original `NQUAREx/dinoplat.github.io`.
- Static Three.js + TypeScript + Vite application for GitHub Pages. No backend, runtime Blender, external CDNs, physics engines or particle libraries.
- The owner approved GPLv3 for this project. Keep LICENSE, public GPL notice, original VOX sources and upstream attribution. Reference models: hushenghao/dino3d, commit cae7ed3da5646839e6aaa24f698b8c07cc3ffc85; original author Abraham Tugalov, 2020. Do not copy upstream gameplay code or add its old dependencies.
- Visual reference: https://hushenghao.github.io/dino3d/ — green voxel dinosaur, eight run poses, held jump pose, small foot dust and varied cacti. Preserve that character language, but keep our portrait rear camera, free lateral movement, bright pixel ground and different mechanics. Reference needed local startup fixes to run; do not import those hacks into this application.

## Saturated child-friendly pixel design

- Canonical palette: sky **#73d8ff**, ink **#24374d**, lime buttons **#7be344**, button shadow **#43b52c**, warm cream **#fff2c3**, coral **#ff704c**, rich yellow/orange ground. Friendly, saturated cartoon colour, never washed-out mint/grey or realistic grit. Match 3D sky/fog (`Palette`) and CSS theme.
- Local Press Start 2P WOFF2 with Cyrillic; square stepped buttons, hard pixel borders, nearest-filtered pixel icons. No glass, rounded dashboard cards, gradients-as-decoration, bloom, postprocessing or shadows.
- Menus centred. During RUNNING hide logo, slogans, help and decorative text entirely. Only the full-width top HUD (coin/diamond/lives/distance/record icons and values) and the **bottom-left** icon pause button remain. These are intentional exceptions to centred menus. Preserve safe-area spacing, >=48px pause hit target and short 320×568 viewport fit.
- HUD coin, diamond, heart, trophy and pause icons come from the original DinoPlat. Keep original files under art/hud-icons; publish only <=32px optimized versions. Sources/licences belong in ASSETS.md.
- Touch-only, portrait-only. Desktop gets a phone prompt without allocating a renderer or loading game models/terrain. Landscape pauses simulation and RAF; returning needs explicit resume. No keyboard/mouse game handlers or desktop layout.

## Mobile browser shell

- Support current iOS Safari/WebKit and Android Chromium browsers with WebGL 2 (target Safari/iOS 16+). Detect touch/any coarse pointer, including touch iPadOS reporting MacIntel; no UA-only gate. Do not claim support for old browsers without WebGL 2.
- Fullscreen API requires a trusted activation. Request it synchronously from Play/Resume or the pause-settings fullscreen button; feature-detect standard/WebKit API, catch denials and never prevent playing. No fullscreen requests on load, timers, synthetic activation or repeated prompts. Pause on leaving native fullscreen.
- iPhone Safari cannot be forced into fullscreen in an ordinary tab. Provide relative-path `manifest.webmanifest` (fullscreen/standalone fallback, portrait, start/scope ./), local 192/512 PNG icons and Apple 180 icon/meta. Explain Share → Add to Home Screen in pause settings/README. Do not promise automatic installation, offline play, hidden OS bars/gestures or successful orientation lock on every device. No service worker/stale asset cache added just for fullscreen.
- `MobileBrowser` owns viewport/fullscreen/long-press/lifecycle integration. Fixed document, no scroll/overscroll, user selection, callout, image drag, tap flash or pinch/double-tap zoom. Cancel document contextmenu/selectstart/dragstart/WebKit gesture events; nonpassive touchmove guard must exempt a single native range touch. Preserve working slider/buttons/attribution links and accessible labels.
- Use visualViewport dimensions (only at scale≈1), dvh/CSS fallback and safe-area envs. Coalesce browser chrome resize events in one RAF; do not resize the WebGL buffer if CSS dimensions and DPR are unchanged. Change dimensions + DPR once via setDrawingBufferSize. Cache touch midpoint on resize instead of querying layout in pointermove.
- Pagehide/freeze/background/fullscreen exit clear pointer capture, pause physics, stop RAF/vibration and suspend Web Audio. BFCache pageshow redraws but must not auto-resume the run or held input. Resume audio/fullscreen only on user activation; dispose all shell listeners/RAF on teardown.
- Run `npm run test:mobile` after building, with Playwright Chromium/WebKit installed. Engine/device emulation is not testing physical iOS/Android hardware; report that limitation. Home-screen modes and missing/denied fullscreen need separate tests.

## World and collision rules

- **No road boundaries and no fixed lane count.** X is continuous and unbounded in both directions. Forward is logical world Z; Y is jump height. Never restore X clamping, white lines, edge rails or a road-shaped ground mesh.
- `Simulation` is DOM/Three-independent. World/physics numbers are Float64; subtract player world position before sending any Float32 positions to GPU. Camera, avatar and ground stay near local origin even after millions of metres. Bounded tile UV offsets preserve pixel precision.
- `WorldSpawner` uses a fixed 2D numeric chunk ring: at most `Rules.poolSize = 702` candidate slots (13×9 chunks, six candidates each), no growing maps/history/scene objects. Chunks are storage keys only: obstacle X/Z are independent continuous random coordinates, never aligned rows or jittered lanes. Refill only on chunk/window changes; numeric guard slots prepare incoming objects. Density is deterministic by natural distance-based speed; hard-core thinning prevents interpenetrating clusters.
- Keep continuous safe routes spaced 32m apart with derivative <=.081. Reserve actual rotated cactus extents plus avatar radius, reaction margin and route slope over the full Z extent. Route starts at X=0; no route lines or avatar lanes. Verify max-speed reachability with 300ms reaction and all lives, not survival masked by immunity.
- Swept X/Z collision uses actual old/new player positions and jump height. Cactus collider extents come from normalized model bounds rotated by the instance yaw. Decorative dinosaur head/tail do not enlarge the stable body collider. Grounded jump only; damage immunity prevents repeated hits on the same cactus, three lives, restart resets run state without reallocating pools.
- Cull **full** object AABBs with the actual camera frustum; retain partially visible trailing cacti. Ring retirement must remain outside every supported frustum. No fixed -4m visual cutoff.

## Components and extensions

- Small OOP components with explicit ownership: GameApplication/GameUI, Simulation, WorldSpawner/ObjectRegistry, ObjectRendererRegistry/InstancedObjectType, ModelLibrary, AnimatedDinosaur, FootDust, Ground, CameraRig, Haptics, Wallet, Health, BonusSystem, GameEvents, Input/GestureRecognizer.
- `ObjectDefinition` describes kind, spawn weight, colliders, reward/bonus and optional destruction metadata. Only cacti have nonzero spawn weight today. Coin/diamond/bonus/enemy types and currency/bonus handling are ready, but do NOT introduce active drops, enemies, destruction or debris until asked. `DestructionDefinition` is a reserved contract, not an implemented break mechanic.
- Collider baseY supports floating items/flying enemies; use it consistently in numerical spawn, vertical body overlap, frustum bounds and instance transforms. Speed modifiers must still obey the max-speed timing budget of the proven route; expanding that budget also requires changing generation/proof tests.
- Register a new object definition and renderer rather than hard-coding it into Simulation. Model geometries/materials belong to asset/view owners; instance banks own only instance buffers. Bonuses use a fixed active-slot pool and definition registry; defaults contain no active bonuses.
- Event bus sends small numeric payloads. Haptics and camera effects subscribe once and unsubscribe on disposal. Vibration is optional, switchable, throttled and feature-detected (iOS may not support it). Never promise haptics work on every phone.
- CameraRig supports event-driven `setPose` and `impulse`, distance-synchronised step bob and reduced-motion support. Preserve baseline Y=10/Z=12, look Y=1/Z=-5, FOV 50°; far 96m and fog 36–84m. Pause settings persist vibration, sound and shake multiplier 0–3 (default 1). Reduced motion overrides shake. One reusable Web Audio voice unlocks only on user activation; pause/mute/dispose stop sound.
- Cacti geometry and model-derived colliders are both scaled exactly 2× at load/registry creation, never every frame. Jump velocity 13.3 preserves useful clearance. On damage: two seconds of immunity, alternating 50%/100% dinosaur opacity, start speed 12m/s; expiry restores distance-based speed. HUD lives are three filled/empty hearts, never a numeric counter.

## Touch classification

- A new touch is PENDING: **do not steer on pointerdown**. Upward motion resolves to JUMP and must never move X, even briefly. A stationary hold resolves after 40ms (formerly 140ms); horizontal intent commits at >3px immediately. A moving pending finger must not time out while preparing a slow swipe. Zero-delay stationary steering and guaranteed zero drift on a later up-swipe are physically incompatible; do not hide this tradeoff or roll back physics.
- Classification is exclusive: a committed hold cannot turn into a jump later. Release it and start a separate upward swipe. During a hold, crossing the screen midpoint reverses X. Release/cancel/lost capture/pause/rotation/visibility loss/reset clear input. No rollback of already simulated movement or collisions.
- Keep recognition independently unit-tested, plus real touch-event browser tests for unchanged X throughout a jump gesture.

## Ground assets and performance

- 16 terrain types change every 500m with equal configurable weights, no immediate repeat; terrain RNG must not affect world spawning.
- Tiles cover **10×10 world metres** (half the previous 20m size). Four non-mirrored, phase/rotation-varied interiors per material, shared prepared edge collars; choose by seeded world-cell hash. Never mirror whole repeating terrain tiles into symmetric patterns.
- Prepare periodic patterns/variant seams with offline minimum-error hard cuts (`tools/pixel-quilter.mjs`), never blur/average opposite edges into straight grid bands. Shader texture gradients must be calculated before region branches and passed explicitly to textureGrad; connector UV resets must not select an averaged last mip and produce a thin straight stripe.
- One local DataArrayTexture, 97 independent 128² layers: 64 base variants + one stone + 16 entry + 16 exit transitions. One sample per fragment, nearest magnification/mip selection, no runtime alpha layering/crossfade. GPU RGBA budget incl. mipmaps ~8.1MiB; upload once.
- Use EXACT authored transitions from `art/terrain-transitions-attached.jpg` (user attachment): crop 4×4 rectangular tiles, retain full drawn border and rocks, rotate exits by 180° offline. Do not replace interiors with base/stone masks again. Only narrow endpoint collars get hard-cut seam preparation; browser test compares preserved interiors with the attachment.
- Every boundary: 5m painted A→stone, 10m common stone, 5m rotated stone→B. Endpoints match base/stone edge phases. All materials share one stone, no N² pairwise assets. Original source images stay in art/, never dist/.
- Preprocess VOX models with original colour-aware greedy meshing and indexed vertices; retain original palettes and voxel animation. One cached GLB, no textures/rig/decoder on models. Run poses swap preloaded geometry; never create/dispose meshes per frame. Foot dust is a fixed 32-particle opaque instanced pool, no shadows or external engine.
- I/O and preparation are async (parallel loading, shader preparation, authoring scripts). **Fixed-step simulation, input state and RAF rendering must stay synchronous**: do not wrap frame work in promises, async tasks or microtasks. This is a performance requirement, not missing asynchrony.
- No allocations in hot loops, no per-obstacle meshes, no unbounded caches, minimal dependencies. Reuse matrices/frusta/bounds/materials. Cap DPR and physical buffer at 900k pixels; retain adaptive resolution and lifecycle cleanup. Dispose textures/geometries/instance buffers/listeners exactly once, including HMR and asset failure paths.

## Verification

- Run npm test, npm run build and npm run test:browser. Verify infinite X both ways, bounded/repeatable 2D windows, safe max-speed route, yaw-aware swept collision/jump/lives, separate gestures, all animation/cactus variants, dust, painted connectors, viewport/pose changes, HUD, pause, optional storage/vibration, WebGL recovery and asset errors.
- Test huge world coordinates with bounded GPU positions; visually inspect running/paused/short portrait and terrain border screenshots. Warm all poses/variants before comparing resource counts across 100 restarts. Do not compare cold geometry counts with warmed counts.
- Record measured draw calls/resources and honest platform limits in VERIFICATION. Cloud Chromium/SwiftShader is not a physical weak phone; never promise a device FPS without measuring it.
- Remove superseded unused runtime assets/tools; preserve original imported model art and licences. Keep source readable and formatted. No compatibility aliases for removed lane APIs just to keep obsolete tests passing; replace tests with the new mechanics.

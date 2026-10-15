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

## World and collision rules

- **No road boundaries and no fixed lane count.** X is continuous and unbounded in both directions. Forward is logical world Z; Y is jump height. Never restore X clamping, white lines, edge rails or a road-shaped ground mesh.
- `Simulation` is DOM/Three-independent. World/physics numbers are Float64; subtract player world position before sending any Float32 positions to GPU. Camera, avatar and ground stay near local origin even after millions of metres. Bounded tile UV offsets preserve pixel precision.
- `WorldSpawner` uses a fixed 2D numeric ring: at most `Rules.poolSize = 198` cells, no growing maps/history/scene objects. Refill only on a world-column/row or viewport-window change. Guard cells are numeric data for upcoming visibility; generate no unlimited hidden world. Cacti use all visible X, seeded independent shape/yaw choices.
- Keep connected safe corridors: every fifth logical column is free, offset changes by at most one column per 20m row. This is a generation guarantee, not a lane movement system or visible road layout. All blockers must respect it. Verify max-speed reachability with 300ms reaction and full lives, not just survival under immunity.
- Swept X/Z collision uses actual old/new player positions and jump height. Cactus collider extents come from normalized model bounds rotated by the instance yaw. Decorative dinosaur head/tail do not enlarge the stable body collider. Grounded jump only; damage immunity prevents repeated hits on the same cactus, three lives, restart resets run state without reallocating pools.
- Cull **full** object AABBs with the actual camera frustum; retain partially visible trailing cacti. Ring retirement must remain outside every supported frustum. No fixed -4m visual cutoff.

## Components and extensions

- Small OOP components with explicit ownership: GameApplication/GameUI, Simulation, WorldSpawner/ObjectRegistry, ObjectRendererRegistry/InstancedObjectType, ModelLibrary, AnimatedDinosaur, FootDust, Ground, CameraRig, Haptics, Wallet, Health, BonusSystem, GameEvents, Input/GestureRecognizer.
- `ObjectDefinition` describes kind, spawn weight, colliders, reward/bonus and optional destruction metadata. Only cacti have nonzero spawn weight today. Coin/diamond/bonus/enemy types and currency/bonus handling are ready, but do NOT introduce active drops, enemies, destruction or debris until asked. `DestructionDefinition` is a reserved contract, not an implemented break mechanic.
- Collider baseY supports floating items/flying enemies; use it consistently in numerical spawn, vertical body overlap, frustum bounds and instance transforms. Speed modifiers must still obey the max-speed timing budget of the proven route; expanding that budget also requires changing generation/proof tests.
- Register a new object definition and renderer rather than hard-coding it into Simulation. Model geometries/materials belong to asset/view owners; instance banks own only instance buffers. Bonuses use a fixed active-slot pool and definition registry; defaults contain no active bonuses.
- Event bus sends small numeric payloads. Haptics and camera effects subscribe once and unsubscribe on disposal. Vibration is optional, switchable, throttled and feature-detected (iOS may not support it). Never promise haptics work on every phone.
- CameraRig supports event-driven `setPose` and `impulse`, small distance-synchronised step bob and reduced-motion support. Keep close portrait baseline Y=10/Z=12, look Y=1/Z=-5, FOV 50°, far 64m; fog depth 24–56m. No large shake or continuous device vibration.

## Touch classification

- A new touch is PENDING: **do not steer on pointerdown**. Upward motion resolves to JUMP and must never move X, even briefly. A still hold resolves after the short recognition delay; a decisive horizontal gesture can commit earlier. A moving pending finger must not time out into sideways steering while preparing a slow swipe.
- Classification is exclusive: a committed hold cannot turn into a jump later. Release it and start a separate upward swipe. During a hold, crossing the screen midpoint reverses X. Release/cancel/lost capture/pause/rotation/visibility loss/reset clear input. No rollback of already simulated movement or collisions.
- Keep recognition independently unit-tested, plus real touch-event browser tests for unchanged X throughout a jump gesture.

## Ground assets and performance

- 16 terrain types change every 500m with equal configurable weights, no immediate repeat; terrain RNG must not affect world spawning.
- Tiles cover **20×20 world metres**, not the old 5.25m dense repeat. Four non-mirrored, phase/rotation-varied interiors per material, shared prepared edge collars; choose by seeded world-cell hash. Never mirror whole repeating terrain tiles into symmetric patterns.
- Prepare periodic patterns/variant seams with offline minimum-error hard cuts (`tools/pixel-quilter.mjs`), never blur/average opposite edges into straight grid bands. Shader texture gradients must be calculated before region branches and passed explicitly to textureGrad; connector UV resets must not select an averaged last mip and produce a thin straight stripe.
- One local DataArrayTexture, 81 independent 128² layers: 64 base variants + one common stone + 16 hand-drawn material-to-stone transitions. One texture sample per fragment, nearest magnification/mip selection, no runtime alpha layering/crossfade. GPU RGBA budget incl. mipmaps ~6.75MiB; keep atlas cached and upload once.
- Every boundary: 10m painted A→stone, 20m stone strip, 10m reversed painted stone→B. Transition endpoints must match exact base/stone texels. All materials connect through that single stone, not N² pairwise assets. Art PNGs stay in art/, never dist/.
- Preprocess VOX models with original colour-aware greedy meshing and indexed vertices; retain original palettes and voxel animation. One cached GLB, no textures/rig/decoder on models. Run poses swap preloaded geometry; never create/dispose meshes per frame. Foot dust is a fixed 32-particle opaque instanced pool, no shadows or external engine.
- I/O and preparation are async (parallel loading, shader preparation, authoring scripts). **Fixed-step simulation, input state and RAF rendering must stay synchronous**: do not wrap frame work in promises, async tasks or microtasks. This is a performance requirement, not missing asynchrony.
- No allocations in hot loops, no per-obstacle meshes, no unbounded caches, minimal dependencies. Reuse matrices/frusta/bounds/materials. Cap DPR and physical buffer at 900k pixels; retain adaptive resolution and lifecycle cleanup. Dispose textures/geometries/instance buffers/listeners exactly once, including HMR and asset failure paths.

## Verification

- Run npm test, npm run build and npm run test:browser. Verify infinite X both ways, bounded/repeatable 2D windows, safe max-speed route, yaw-aware swept collision/jump/lives, separate gestures, all animation/cactus variants, dust, painted connectors, viewport/pose changes, HUD, pause, optional storage/vibration, WebGL recovery and asset errors.
- Test huge world coordinates with bounded GPU positions; visually inspect running/paused/short portrait and terrain border screenshots. Warm all poses/variants before comparing resource counts across 100 restarts. Do not compare cold geometry counts with warmed counts.
- Record measured draw calls/resources and honest platform limits in VERIFICATION. Cloud Chromium/SwiftShader is not a physical weak phone; never promise a device FPS without measuring it.
- Remove superseded unused runtime assets/tools; preserve original imported model art and licences. Keep source readable and formatted. No compatibility aliases for removed lane APIs just to keep obsolete tests passing; replace tests with the new mechanics.

import * as THREE from "three";
import { FOG_START, FOG_END } from "./camera";
import { GridMath } from "./config";
import { TerrainLayout, TERRAIN_LENGTH } from "./terrain";
import type { Simulation } from "./simulation";
import type { LightingRig } from "./lighting";
import type { RenderPose } from "./render-pose";

/** A camera-local unbounded-looking surface; no edges, lanes or per-tile meshes. */
export class Ground {
  private readonly geometry = new THREE.PlaneGeometry(192, 192);
  private readonly material: THREE.ShaderMaterial;
  private shadowMaterial?: THREE.ShaderMaterial;
  readonly mesh: THREE.Mesh;
  constructor(
    private readonly texture: THREE.DataArrayTexture,
    private readonly lighting: LightingRig,
  ) {
    this.geometry.rotateX(-Math.PI / 2);
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        ground: { value: texture },
        types: { value: new THREE.Vector3() },
        origin: { value: new THREE.Vector2() },
        tiles: { value: new THREE.Vector2() },
        progress: { value: 0 },
        hasPrevious: { value: 0 },
        seed: { value: 1 },
        fogColour: { value: lighting.fogColour },
        groundTint: { value: lighting.groundTint },
        shadowStrength: { value: 0 },
      },
      vertexShader: `out vec2 world; out float depth;
        void main() { vec4 p = modelMatrix * vec4(position, 1.0); world = p.xz;
          vec4 eye = viewMatrix * p; depth = -eye.z; gl_Position = projectionMatrix * eye; }`,
      fragmentShader: `precision highp sampler2DArray;
        uniform sampler2DArray ground;
        uniform vec3 types; uniform vec2 origin; uniform vec2 tiles;
        uniform float progress; uniform float hasPrevious; uniform uint seed;
        uniform vec3 fogColour; uniform vec3 groundTint;
        uniform float shadowStrength;
        in vec2 world; in float depth; out vec4 terrainColour;
        #define gl_FragColor terrainColour
        uint tileHash(ivec2 p) {
          uint h = uint(p.x) * 521288629u ^ uint(p.y) * 1597334677u ^ seed;
          h = (h ^ (h >> 16u)) * 2146121005u;
          return h ^ (h >> 15u);
        }
        void main() {
          vec2 uv = (vec2(world.x, -world.y) + origin) / ${TerrainLayout.worldTileSize.toFixed(1)};
          // Derivatives must be taken before UV/layer branches. Otherwise the
          // 1->0 connector UV reset selects the last mip for one screen row,
          // producing a straight averaged-colour stripe despite matching art.
          vec2 gradX = dFdx(uv), gradY = dFdy(uv);
          ivec2 tile = ivec2(floor(uv) + tiles);
          float variant = float(tileHash(tile) & 3u);
          float s = progress - world.y;
          float before = types.y, after = types.z, boundary = s - ${TERRAIN_LENGTH.toFixed(1)};
          if (s < 250.0) { before = types.x; after = types.y; boundary = s; }
          float layer;
          vec2 sampleUv = uv;
          if (hasPrevious < 0.5 && s < 250.0) layer = types.y * 4.0 + variant;
          else if (boundary < -5.0) layer = before * 4.0 + variant;
          else if (boundary < -2.5) {
            layer = ${TerrainLayout.transitionLayer.toFixed(1)} + before;
            sampleUv.y = clamp((boundary + 5.0) / 2.5, 0.00390625, 0.99609375);
            gradX.y *= 2.0; gradY.y *= 2.0;
          } else if (boundary <= 2.5) {
            layer = ${TerrainLayout.stoneLayer.toFixed(1)};
            sampleUv.y = (boundary + 2.5) / 5.0;
          } else if (boundary <= 5.0) {
            layer = ${TerrainLayout.exitTransitionLayer.toFixed(1)} + after;
            sampleUv.y = clamp((boundary - 2.5) / 2.5, 0.00390625, 0.99609375);
            gradX.y *= 2.0; gradY.y *= 2.0;
          } else layer = after * 4.0 + variant;
          // One opaque texture sample. Transitions are painted assets, not overlays.
          vec3 colour = textureGrad(ground, vec3(sampleUv, layer), gradX, gradY).rgb * groundTint;
          #ifdef PROJECTED_SHADOW
            colour *= 1.0 - shadowStrength * (1.0 - smoothstep(20.0, 28.0, length(world)));
          #endif
          gl_FragColor = vec4(mix(colour, fogColour, smoothstep(${FOG_START.toFixed(1)}, ${FOG_END.toFixed(1)}, depth)), 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.position.set(0, -0.015, -40);
    this.mesh.frustumCulled = false;
  }
  createShadowMaterial() {
    if (this.shadowMaterial) return this.shadowMaterial;
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        ...this.material.uniforms,
        shadowStrength: { value: 0 },
        sunSlope: { value: this.lighting.shadowSlope },
      },
      defines: { PROJECTED_SHADOW: 1 },
      vertexShader: `uniform vec2 sunSlope; out vec2 world; out float depth;
        void main() {
          vec4 p = modelMatrix * instanceMatrix * vec4(position, 1.0);
          p.xz -= (p.y + 0.015) * sunSlope; p.y = -0.015;
          world = p.xz; vec4 eye = viewMatrix * p; depth = -eye.z;
          gl_Position = projectionMatrix * eye;
        }`,
      fragmentShader: this.material.fragmentShader,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      // One opaque shade per pixel, even where many projected voxel faces or
      // several cacti overlap. Other materials do not test this stencil bit.
      stencilWrite: true,
      stencilFunc: THREE.NotEqualStencilFunc,
      stencilRef: 1,
      stencilZPass: THREE.ReplaceStencilOp,
    });
    this.shadowMaterial = material;
    return material;
  }
  update(game: Simulation, pose: RenderPose) {
    const uniforms = this.material.uniforms;
    uniforms.types.value.set(
      game.terrain.previous,
      game.terrain.current,
      game.terrain.next,
    );
    const tileSize = TerrainLayout.worldTileSize;
    uniforms.origin.value.set(
      GridMath.mod(pose.x, tileSize),
      GridMath.mod(pose.distance, tileSize),
    );
    uniforms.tiles.value.set(
      GridMath.mod(Math.floor(pose.x / tileSize), 65536),
      GridMath.mod(Math.floor(pose.distance / tileSize), 65536),
    );
    // Interpolation may still be just before the simulation's segment boundary.
    uniforms.progress.value =
      pose.distance - game.terrain.segment * TERRAIN_LENGTH;
    uniforms.hasPrevious.value = game.terrain.segment > 0 ? 1 : 0;
    uniforms.seed.value = game.seed >>> 0;
    if (this.shadowMaterial)
      this.shadowMaterial.uniforms.shadowStrength.value =
        this.lighting.shadowStrength;
  }
  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.shadowMaterial?.dispose();
    this.texture.dispose();
  }
}

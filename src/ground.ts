import * as THREE from "three";
import { FOG_START, FOG_END } from "./camera";
import { Palette, GridMath } from "./config";
import { TerrainLayout, TERRAIN_LENGTH } from "./terrain";
import type { Simulation } from "./simulation";

/** A camera-local unbounded-looking surface; no edges, lanes or per-tile meshes. */
export class Ground {
  private readonly geometry = new THREE.PlaneGeometry(192, 192);
  private readonly material: THREE.ShaderMaterial;
  readonly mesh: THREE.Mesh;
  constructor(private readonly texture: THREE.DataArrayTexture) {
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
        fogColour: { value: new THREE.Color(Palette.sky) },
      },
      vertexShader: `out vec2 world; out float depth;
        void main() { vec4 p = modelMatrix * vec4(position, 1.0); world = p.xz;
          vec4 eye = viewMatrix * p; depth = -eye.z; gl_Position = projectionMatrix * eye; }`,
      fragmentShader: `precision highp sampler2DArray;
        uniform sampler2DArray ground;
        uniform vec3 types; uniform vec2 origin; uniform vec2 tiles;
        uniform float progress; uniform float hasPrevious; uniform uint seed;
        uniform vec3 fogColour;
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
          else if (boundary < -20.0) layer = before * 4.0 + variant;
          else if (boundary < -10.0) {
            layer = ${TerrainLayout.transitionLayer.toFixed(1)} + before;
            sampleUv.y = clamp((boundary + 20.0) / 10.0, 0.00390625, 0.99609375);
            gradX.y *= 2.0; gradY.y *= 2.0;
          } else if (boundary <= 10.0) {
            layer = ${TerrainLayout.stoneLayer.toFixed(1)};
            sampleUv.y = (boundary + 10.0) / 20.0;
          } else if (boundary <= 20.0) {
            layer = ${TerrainLayout.transitionLayer.toFixed(1)} + after;
            sampleUv.y = clamp(1.0 - (boundary - 10.0) / 10.0, 0.00390625, 0.99609375);
            gradX.y *= -2.0; gradY.y *= -2.0;
          } else layer = after * 4.0 + variant;
          // One opaque texture sample. Transitions are painted assets, not overlays.
          vec3 colour = textureGrad(ground, vec3(sampleUv, layer), gradX, gradY).rgb;
          gl_FragColor = vec4(mix(colour, fogColour, smoothstep(${FOG_START.toFixed(1)}, ${FOG_END.toFixed(1)}, depth)), 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.position.set(0, -0.015, -40);
    this.mesh.frustumCulled = false;
  }
  update(game: Simulation) {
    const uniforms = this.material.uniforms;
    uniforms.types.value.set(
      game.terrain.previous,
      game.terrain.current,
      game.terrain.next,
    );
    uniforms.origin.value.set(GridMath.mod(game.x, 20), game.distance % 20);
    uniforms.tiles.value.set(
      GridMath.mod(Math.floor(game.x / 20), 65536),
      Math.floor(game.distance / 20) % 65536,
    );
    uniforms.progress.value = game.distance % TERRAIN_LENGTH;
    uniforms.hasPrevious.value = game.terrain.segment > 0 ? 1 : 0;
    uniforms.seed.value = game.seed >>> 0;
  }
  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

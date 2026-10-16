import {
  MeshLambertMaterial,
  Vector2,
  Vector3,
  type DataArrayTexture,
} from "three";
import { GridMath } from "./config";
import { TerrainLayout, TERRAIN_LENGTH } from "./terrain";
import { TerrainSurface } from "./terrain-surface";
import type { Simulation } from "./simulation";
import type { RenderPose } from "./render-pose";

/** Standard Lambert lighting/shadows, with painted terrain as albedo. */
export class Ground {
  // Interpolated vertex normals are exactly constant on today's flat surface;
  // avoid per-fragment normal derivatives (cost + subpixel variation). Relief
  // can choose flatShading later without changing the terrain/world contracts.
  readonly material = new MeshLambertMaterial();
  readonly surface = new TerrainSurface(this.material);
  readonly mesh = this.surface.mesh;
  readonly uniforms;
  constructor(private readonly texture: DataArrayTexture) {
    this.uniforms = {
      terrainAtlas: { value: texture },
      terrainTypes: { value: new Vector3() },
      terrainOrigin: { value: new Vector2() },
      terrainTiles: { value: new Vector2() },
      terrainProgress: { value: 0 },
      terrainHasPrevious: { value: 0 },
      terrainSeed: { value: 1 },
    };
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader =
        "varying vec2 vTerrainLocal;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvTerrainLocal = position.xz;",
      );
      shader.fragmentShader =
        `
        uniform highp sampler2DArray terrainAtlas;
        uniform vec3 terrainTypes; uniform vec2 terrainOrigin, terrainTiles;
        uniform float terrainProgress, terrainHasPrevious; uniform uint terrainSeed;
        varying vec2 vTerrainLocal;
        uint tileHash(ivec2 p) {
          // Wrap BOTH the local sum and CPU anchor: otherwise variants change
          // when the origin crosses zero/65536 cells despite matching UV phase.
          uvec2 cell = uvec2(p) & uvec2(65535u);
          uint h = cell.x * 521288629u ^ cell.y * 1597334677u ^ terrainSeed;
          h = (h ^ (h >> 16u)) * 2146121005u;
          return h ^ (h >> 15u);
        }
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `
        vec2 uv = (vec2(vTerrainLocal.x, -vTerrainLocal.y) + terrainOrigin) / ${TerrainLayout.worldTileSize.toFixed(1)};
        vec2 gradX = dFdx(uv), gradY = dFdy(uv);
        float variant = float(tileHash(ivec2(floor(uv) + terrainTiles)) & 3u);
        float s = terrainProgress - vTerrainLocal.y;
        float before = terrainTypes.y, after = terrainTypes.z, boundary = s - ${TERRAIN_LENGTH.toFixed(1)};
        if (s < 250.0) { before = terrainTypes.x; after = terrainTypes.y; boundary = s; }
        float layer; vec2 sampleUv = uv;
        if (terrainHasPrevious < 0.5 && s < 250.0) layer = terrainTypes.y * 4.0 + variant;
        else if (boundary < -2.5) layer = before * 4.0 + variant;
        else if (boundary < -1.25) {
          layer = ${TerrainLayout.transitionLayer.toFixed(1)} + before;
          sampleUv.y = clamp((boundary + 2.5) / 1.25, 0.00390625, 0.99609375);
          gradX.y *= 2.0; gradY.y *= 2.0;
        } else if (boundary <= 1.25) {
          layer = ${TerrainLayout.stoneLayer.toFixed(1)};
          sampleUv.y = (boundary + 1.25) / 2.5;
        } else if (boundary <= 2.5) {
          layer = ${TerrainLayout.exitTransitionLayer.toFixed(1)} + after;
          sampleUv.y = clamp((boundary - 1.25) / 1.25, 0.00390625, 0.99609375);
          gradX.y *= 2.0; gradY.y *= 2.0;
        } else layer = after * 4.0 + variant;
        diffuseColor.rgb *= textureGrad(terrainAtlas, vec3(sampleUv, layer), gradX, gradY).rgb;
      `,
      );
    };
    this.material.customProgramCacheKey = () => "lit-terrain-array-v3";
  }
  update(game: Simulation, pose: RenderPose) {
    this.surface.update(pose);
    const u = this.uniforms,
      size = TerrainLayout.worldTileSize;
    const x = this.surface.anchorX,
      distance = this.surface.anchorDistance;
    u.terrainTypes.value.set(
      game.terrain.previous,
      game.terrain.current,
      game.terrain.next,
    );
    u.terrainOrigin.value.set(
      GridMath.mod(x, size),
      GridMath.mod(distance, size),
    );
    u.terrainTiles.value.set(
      GridMath.mod(Math.floor(x / size), 65536),
      GridMath.mod(Math.floor(distance / size), 65536),
    );
    u.terrainProgress.value = distance - game.terrain.segment * TERRAIN_LENGTH;
    u.terrainHasPrevious.value = game.terrain.segment > 0 ? 1 : 0;
    u.terrainSeed.value = game.seed >>> 0;
  }
  dispose() {
    this.surface.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

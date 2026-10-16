import { MeshLambertMaterial, Vector2, type DataArrayTexture } from "three";
import { GridMath } from "./config";
import { TerrainLayout, TERRAIN_LENGTH } from "./terrain";
import { TerrainSurface } from "./terrain-surface";
import { TerrainField } from "./terrain-field";
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
      terrainOrigin: { value: new Vector2() },
      terrainTiles: { value: new Vector2() },
      terrainBiomeOffset: { value: new Vector2() },
      terrainBiomeCell: { value: new Vector2() },
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
        uniform vec2 terrainOrigin, terrainTiles, terrainBiomeOffset, terrainBiomeCell;
        uniform uint terrainSeed;
        varying vec2 vTerrainLocal;
        uint tileHash(ivec2 p) {
          // Wrap BOTH the local sum and CPU anchor: otherwise variants change
          // when the origin crosses zero/65536 cells despite matching UV phase.
          uvec2 cell = uvec2(p) & uvec2(65535u);
          uint h = cell.x * 521288629u ^ cell.y * 1597334677u ^ terrainSeed;
          h = (h ^ (h >> 16u)) * 2146121005u;
          return h ^ (h >> 15u);
        }
        float biome(ivec2 cell) {
          // Match GridMath.hash exactly, using bounded low integer bits.
          uint h = uint(cell.x) * 521288629u ^ uint(cell.y) * 1597334677u ^ terrainSeed;
          h = (h ^ (h >> 16u)) * 2146121005u;
          h = (h ^ (h >> 15u)) * 2221713035u;
          h = h ^ (h >> 16u);
          return float((h & 7u) * 2u + (uint(cell.x + cell.y) & 1u));
        }
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `
        vec2 uv = (vec2(vTerrainLocal.x, -vTerrainLocal.y) + terrainOrigin) / ${TerrainLayout.worldTileSize.toFixed(1)};
        vec2 gradX = dFdx(uv), gradY = dFdy(uv);
        float variant = float(tileHash(ivec2(floor(uv) + terrainTiles)) & 3u);
        vec2 regionUv = (vec2(vTerrainLocal.x, -vTerrainLocal.y) + terrainBiomeOffset) / ${TERRAIN_LENGTH.toFixed(1)};
        ivec2 cell = ivec2(floor(regionUv)) + ivec2(terrainBiomeCell);
        vec2 nearest = (fract(regionUv) - step(vec2(.5), fract(regionUv))) * ${TERRAIN_LENGTH.toFixed(1)};
        bool acrossX = abs(nearest.x) < abs(nearest.y);
        float boundary = acrossX ? nearest.x : nearest.y;
        float layer; vec2 sampleUv = uv;
        if (abs(nearest.x) <= 1.25 && abs(nearest.y) <= 1.25) layer = ${TerrainLayout.stoneLayer.toFixed(1)};
        else if (abs(boundary) > 2.5) layer = biome(cell) * 4.0 + variant;
        else {
          ivec2 axis = acrossX ? ivec2(1,0) : ivec2(0,1);
          ivec2 lower = cell - (boundary >= 0. ? axis : ivec2(0));
          float before = biome(lower), after = biome(lower + axis);
          if (acrossX) { sampleUv = vec2(-uv.y,uv.x); gradX = vec2(-gradX.y,gradX.x); gradY = vec2(-gradY.y,gradY.x); }
          if (boundary < -1.25) {
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
          }
        }
        diffuseColor.rgb *= textureGrad(terrainAtlas, vec3(sampleUv, layer), gradX, gradY).rgb;
      `,
      );
    };
    this.material.customProgramCacheKey = () => "lit-terrain-world-field-v4";
  }
  update(game: Simulation, pose: RenderPose) {
    this.surface.update(pose);
    const u = this.uniforms,
      size = TerrainLayout.worldTileSize;
    const x = this.surface.anchorX,
      distance = this.surface.anchorDistance;
    u.terrainOrigin.value.set(
      GridMath.mod(x, size),
      GridMath.mod(distance, size),
    );
    u.terrainTiles.value.set(
      GridMath.mod(Math.floor(x / size), 65536),
      GridMath.mod(Math.floor(distance / size), 65536),
    );
    u.terrainBiomeOffset.value.set(
      GridMath.mod(x + TerrainField.originX, TERRAIN_LENGTH),
      GridMath.mod(distance + TerrainField.originZ, TERRAIN_LENGTH),
    );
    u.terrainBiomeCell.value.set(
      Math.floor((x + TerrainField.originX) / TERRAIN_LENGTH),
      Math.floor((distance + TerrainField.originZ) / TERRAIN_LENGTH),
    );
    u.terrainSeed.value = game.seed >>> 0;
  }
  dispose() {
    this.surface.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

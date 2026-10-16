import {
  DataArrayTexture,
  RepeatWrapping,
  SRGBColorSpace,
  NearestFilter,
  LinearMipmapLinearFilter,
} from "three";
import terrainUrl from "./assets/terrains.webp?url";
import { TerrainLayout } from "./terrain";

export class TerrainTexture {
  static async load() {
    try {
      const image = new Image();
      image.src = terrainUrl;
      await image.decode();
      const size = TerrainLayout.tileSize,
        width = size * TerrainLayout.atlasColumns;
      if (image.width !== width || image.height !== width)
        throw new Error("Invalid terrain atlas");
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = width;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      context.drawImage(image, 0, 0);
      const source = context.getImageData(0, 0, width, width).data;
      const data = new Uint8Array(size * size * 4 * TerrainLayout.layers);
      for (let layer = 0; layer < TerrainLayout.layers; layer++)
        for (let y = 0; y < size; y++) {
          const start =
            ((Math.floor(layer / TerrainLayout.atlasColumns) * size + y) *
              width +
              (layer % TerrainLayout.atlasColumns) * size) *
            4;
          data.set(
            source.subarray(start, start + size * 4),
            (layer * size * size + y * size) * 4,
          );
        }
      const texture = new DataArrayTexture(
        data,
        size,
        size,
        TerrainLayout.layers,
      );
      texture.colorSpace = SRGBColorSpace;
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.magFilter = NearestFilter;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.anisotropy = 1;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
      canvas.width = canvas.height = 1;
      return texture;
    } catch {
      throw new Error(
        "Не удалось загрузить покрытия земли. Проверь соединение и попробуй снова.",
      );
    }
  }
}

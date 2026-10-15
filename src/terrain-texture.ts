import {
  DataArrayTexture, RepeatWrapping, SRGBColorSpace,
  NearestFilter, LinearMipmapLinearFilter,
} from "three";
import terrainUrl from "./assets/terrains.webp?url";

/** One GPU array: 16 independent 128² layers, no atlas bleeding at any mip. */
export async function loadTerrainTexture() {
  try {
    const image = new Image();
    image.src = terrainUrl;
    await image.decode();
    if (image.width !== 512 || image.height !== 512) throw new Error("Invalid atlas");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas unavailable");
    context.drawImage(image, 0, 0);
    const source = context.getImageData(0, 0, 512, 512).data;
    const size = 128;
    const data = new Uint8Array(size * size * 4 * 16);
    for (let layer = 0; layer < 16; layer++)
      for (let y = 0; y < size; y++) {
        const start = ((Math.floor(layer / 4) * size + y) * 512 + layer % 4 * size) * 4;
        data.set(source.subarray(start, start + size * 4), (layer * size * size + y * size) * 4);
      }
    const texture = new DataArrayTexture(data, size, size, 16);
    texture.colorSpace = SRGBColorSpace;
    // Opposite tile edges are matched offline; no mirrored rocks or atlas bleed.
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.magFilter = NearestFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.anisotropy = 1;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    canvas.width = canvas.height = 1;
    return texture;
  } catch {
    throw new Error("Не удалось загрузить покрытия дорожки. Проверь соединение и попробуй снова.");
  }
}

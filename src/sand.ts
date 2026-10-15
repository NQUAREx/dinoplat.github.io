import {
  TextureLoader,
  RepeatWrapping,
  SRGBColorSpace,
  NearestFilter,
  LinearMipmapLinearFilter,
} from "three";
import sandUrl from "./assets/sand.webp?url";

export async function loadSandTexture() {
  try {
    const texture = await new TextureLoader().loadAsync(sandUrl);
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.repeat.set(2, 24);
    texture.magFilter = NearestFilter;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.anisotropy = 1;
    texture.generateMipmaps = true;
    return texture;
  } catch {
    throw new Error(
      "Не удалось загрузить песчаную дорожку. Проверь соединение и попробуй снова.",
    );
  }
}

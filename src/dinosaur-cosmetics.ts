import { Mesh, type SkinnedMesh } from "three";
import type { ModelLibrary } from "./models";
import type { CosmeticInventory } from "./cosmetics";

/** Three reusable bone attachments; skin swaps reuse the existing rig/material. */
export class DinosaurCosmetics {
  private readonly hat: Mesh;
  private readonly left: Mesh;
  private readonly right: Mesh;
  private revision = -1;
  constructor(
    private readonly models: Pick<ModelLibrary, "greenGeometry" | "cosmetics">,
    private readonly dinosaur: SkinnedMesh,
  ) {
    this.hat = new Mesh(models.cosmetics.get("hat-cap"), dinosaur.material);
    this.left = new Mesh(models.cosmetics.get("boots-red"), dinosaur.material);
    this.right = new Mesh(models.cosmetics.get("boots-red"), dinosaur.material);
    for (const mesh of [this.hat, this.left, this.right]) {
      mesh.visible = false;
      mesh.frustumCulled = false;
    }
    dinosaur.skeleton.bones.find((b) => b.name === "dino-head")!.add(this.hat);
    dinosaur.skeleton.bones
      .find((b) => b.name === "dino-shin-l")!
      .add(this.left);
    dinosaur.skeleton.bones
      .find((b) => b.name === "dino-shin-r")!
      .add(this.right);
  }
  apply(inventory: CosmeticInventory) {
    if (this.revision === inventory.revision) return;
    this.revision = inventory.revision;
    this.dinosaur.geometry =
      inventory.equipped.dino === "dino-green"
        ? this.models.greenGeometry
        : this.models.cosmetics.get(inventory.equipped.dino)!;
    const hat = this.models.cosmetics.get(inventory.equipped.hat),
      boots = this.models.cosmetics.get(inventory.equipped.boots);
    this.hat.visible = !!hat;
    this.left.visible = this.right.visible = !!boots;
    if (hat) this.hat.geometry = hat;
    if (boots) this.left.geometry = this.right.geometry = boots;
  }
  stats() {
    return {
      hatVisible: this.hat.visible,
      bootsVisible: this.left.visible,
      hatParent: this.hat.parent?.name,
      leftParent: this.left.parent?.name,
      rightParent: this.right.parent?.name,
      skinTriangles: this.dinosaur.geometry.index!.count / 3,
    };
  }
}

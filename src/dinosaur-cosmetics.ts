import { Mesh, type SkinnedMesh } from "three";
import type { ModelLibrary } from "./models";
import type { CosmeticInventory } from "./cosmetics";

/** Six reusable bone attachments; skin swaps reuse the existing rig/material. */
export class DinosaurCosmetics {
  private readonly hat: Mesh;
  private readonly left: Mesh;
  private readonly right: Mesh;
  private readonly watch: Mesh;
  private readonly gloveLeft: Mesh;
  private readonly gloveRight: Mesh;
  private revision = -1;
  groundLift = 0;
  constructor(
    private readonly models: Pick<ModelLibrary, "greenGeometry" | "cosmetics">,
    private readonly dinosaur: SkinnedMesh,
  ) {
    this.hat = new Mesh(models.cosmetics.get("hat-cap"), dinosaur.material);
    this.left = new Mesh(models.cosmetics.get("boots-red"), dinosaur.material);
    this.right = new Mesh(models.cosmetics.get("boots-red"), dinosaur.material);
    this.watch = new Mesh(
      models.cosmetics.get("watch-extra-01"),
      dinosaur.material,
    );
    this.gloveLeft = new Mesh(
      models.cosmetics.get("gloves-extra-01"),
      dinosaur.material,
    );
    this.gloveRight = new Mesh(
      models.cosmetics.get("gloves-extra-01"),
      dinosaur.material,
    );
    for (const mesh of [
      this.hat,
      this.left,
      this.right,
      this.watch,
      this.gloveLeft,
      this.gloveRight,
    ]) {
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
    dinosaur.skeleton.bones
      .find((b) => b.name === "dino-arm-l")!
      .add(this.watch, this.gloveLeft);
    dinosaur.skeleton.bones
      .find((b) => b.name === "dino-arm-r")!
      .add(this.gloveRight);
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
    this.groundLift = boots ? 0.04 : 0;
    if (hat) this.hat.geometry = hat;
    if (boots) this.left.geometry = this.right.geometry = boots;
    const watch = this.models.cosmetics.get(inventory.equipped.watch),
      gloves = this.models.cosmetics.get(inventory.equipped.gloves);
    this.watch.visible = !!watch;
    this.gloveLeft.visible = this.gloveRight.visible = !!gloves;
    if (watch) this.watch.geometry = watch;
    if (gloves) this.gloveLeft.geometry = this.gloveRight.geometry = gloves;
  }
  stats() {
    return {
      hatVisible: this.hat.visible,
      bootsVisible: this.left.visible,
      hatParent: this.hat.parent?.name,
      leftParent: this.left.parent?.name,
      rightParent: this.right.parent?.name,
      skinTriangles: this.dinosaur.geometry.index!.count / 3,
      watchVisible: this.watch.visible,
      glovesVisible: this.gloveLeft.visible,
      watchParent: this.watch.parent?.name,
    };
  }
}

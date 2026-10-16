import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import type { ModelLibrary } from "./models";
import type { CosmeticInventory } from "./cosmetics";
import { DinosaurCosmetics } from "./dinosaur-cosmetics";

/** Event-driven preview: shared renderer/geometry, independent rig and material. */
export class MenuPreview {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
  private readonly material = new THREE.MeshLambertMaterial({
    vertexColors: true,
  });
  private readonly mesh: THREE.SkinnedMesh;
  private readonly cosmetics: DinosaurCosmetics;
  private readonly abort = new AbortController();
  private readonly avatar = document.getElementById("menu-avatar")!;
  private readonly size = new THREE.Vector2();
  private readonly colour = new THREE.Color();
  private readonly bounds = new THREE.Vector3();
  private pointer = -1;
  private lastX = 0;
  yaw = 0.35;
  constructor(models: ModelLibrary, redraw: () => void) {
    this.mesh = clone(models.dinosaur) as THREE.SkinnedMesh;
    this.mesh.geometry.computeBoundingBox();
    this.mesh.geometry.boundingBox!.getSize(this.bounds);
    this.mesh.material = this.material;
    this.mesh.frustumCulled = false;
    this.cosmetics = new DinosaurCosmetics(models, this.mesh);
    this.scene.add(this.mesh, new THREE.HemisphereLight(0xffffff, 0x9e805a, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(-3, 5, -4);
    this.scene.add(light);
    this.camera.position.set(0, 1.3, -3.9);
    this.camera.lookAt(0, 1.05, 0);
    const options = { signal: this.abort.signal };
    this.avatar.addEventListener(
      "pointerdown",
      (event) => {
        if (event.pointerType !== "touch" || !event.isPrimary) return;
        event.preventDefault();
        this.pointer = event.pointerId;
        this.lastX = event.clientX;
        this.avatar.setPointerCapture(event.pointerId);
      },
      options,
    );
    this.avatar.addEventListener(
      "pointermove",
      (event) => {
        if (event.pointerId !== this.pointer) return;
        event.preventDefault();
        this.yaw += (event.clientX - this.lastX) * 0.012;
        this.lastX = event.clientX;
        redraw();
      },
      options,
    );
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
      this.avatar.addEventListener(
        name,
        () => {
          this.pointer = -1;
        },
        options,
      );
  }
  get visible() {
    return (
      !document.getElementById("overlay")!.hidden &&
      document.getElementById("app")!.dataset.menu === "home"
    );
  }
  apply(inventory: CosmeticInventory) {
    this.cosmetics.apply(inventory);
    this.mesh.position.y = this.cosmetics.groundLift;
  }
  draw(renderer: THREE.WebGLRenderer) {
    renderer.getSize(this.size);
    renderer.getClearColor(this.colour);
    const auto = renderer.autoClear;
    renderer.setScissorTest(false);
    renderer.setClearColor(0x73d8ff);
    renderer.clear();
    const canvas = renderer.domElement.getBoundingClientRect();
    const clearRect = (element: HTMLElement, colour: number) => {
      const r = element.getBoundingClientRect();
      const x = r.left - canvas.left,
        y = canvas.bottom - r.bottom;
      renderer.setViewport(x, y, r.width, r.height);
      renderer.setScissor(x, y, r.width, r.height);
      renderer.setScissorTest(true);
      renderer.setClearColor(colour);
      renderer.clear();
      return r;
    };
    clearRect(document.getElementById("menu-content")!, 0xfff2c3);
    const r = clearRect(this.avatar, 0xb8ec9b);
    if (r.width > 0 && r.height > 0) {
      this.camera.aspect = r.width / r.height;
      this.camera.updateProjectionMatrix();
      const width =
        Math.abs(Math.cos(this.yaw)) * this.bounds.x +
        Math.abs(Math.sin(this.yaw)) * this.bounds.z;
      this.camera.position.z = -Math.max(
        4.8,
        (width + 0.35) /
          (2 * Math.tan((16 * Math.PI) / 180) * this.camera.aspect) +
          0.5,
      );
      this.camera.lookAt(0, 1.1, 0);
      this.mesh.rotation.y = this.yaw;
      renderer.autoClear = false;
      renderer.render(this.scene, this.camera);
    }
    renderer.autoClear = auto;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, this.size.x, this.size.y);
    renderer.setClearColor(this.colour);
  }
  stats() {
    return { visible: this.visible, yaw: this.yaw, ...this.cosmetics.stats() };
  }
  dispose() {
    this.abort.abort();
    this.mesh.skeleton.dispose();
    this.material.dispose();
  }
}

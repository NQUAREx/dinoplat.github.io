export class GameSettings {
  vibration = true;
  sound = true;
  shake = 1;
  constructor() {
    try {
      const saved = JSON.parse(
        localStorage.getItem("dinoplat-settings") ?? "null",
      );
      if (!saved || typeof saved !== "object") return;
      if (typeof saved.vibration === "boolean")
        this.vibration = saved.vibration;
      if (typeof saved.sound === "boolean") this.sound = saved.sound;
      if (typeof saved.shake === "number" && Number.isFinite(saved.shake))
        this.shake = Math.max(0, Math.min(3, saved.shake));
    } catch {
      /* Storage is optional. */
    }
  }
  save() {
    try {
      localStorage.setItem(
        "dinoplat-settings",
        JSON.stringify({
          vibration: this.vibration,
          sound: this.sound,
          shake: this.shake,
        }),
      );
    } catch {
      /* Storage is optional. */
    }
  }
}

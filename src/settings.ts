export class GameSettings {
  vibration = true;
  sound = true;
  readonly shake = 2.9;
  constructor() {
    try {
      const saved = JSON.parse(
        localStorage.getItem("dinoplat-settings") ?? "null",
      );
      if (!saved || typeof saved !== "object") return;
      if (typeof saved.vibration === "boolean")
        this.vibration = saved.vibration;
      if (typeof saved.sound === "boolean") this.sound = saved.sound;
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
        }),
      );
    } catch {
      /* Storage is optional. */
    }
  }
}

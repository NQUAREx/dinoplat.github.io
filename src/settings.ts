export class GameSettings {
  vibration = true;
  sound = true;
  music = true;
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
      if (typeof saved.music === "boolean") this.music = saved.music;
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
          music: this.music,
        }),
      );
    } catch {
      /* Storage is optional. */
    }
  }
}

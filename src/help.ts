import coin from "./assets/icons/coin.png";
import diamond from "./assets/icons/diamond.png";
import heart from "./assets/icons/live.png";
import record from "./assets/icons/record.png";
import { Rules } from "./config";

/** Shared content entries are the manual's source of truth, not marketing copy. */
export const HELP_ENTRIES = [
  {
    id: "movement",
    icon: "↔",
    title: "Бег и повороты",
    text: "Дино бежит постоянно в любом направлении. Удерживайте левую или правую половину экрана, чтобы поворачивать. Отпустите — направление сохранится. Границ и полос нет.",
  },
  {
    id: "gestures",
    icon: "↑",
    title: "Прыжок, нырок, присед",
    text: () =>
      `Отдельный свайп вверх — прыжок. Свайп вниз в воздухе ускоряет падение, на земле — присед на ${Rules.duckDuration} с. Нельзя превратить удержание в прыжок: сначала отпустите палец. Препятствий для приседа пока нет.`,
  },
  {
    id: "coin",
    icon: coin,
    title: "Монеты",
    text: "Золотые монеты дают +1 монету. Баланс сохраняется между забегами. Подбор сразу начисляет награду; подъём и растворение предмета — только визуальный эффект.",
  },
  {
    id: "diamond",
    icon: diamond,
    title: "Алмазы",
    text: "Алмаз даёт +1 алмаз. Встречается значительно реже монет. Монеты и алмазы покупают косметику в магазине.",
  },
  {
    id: "heart",
    icon: heart,
    title: "Жизни и лечение",
    text: "Редкое сердечко восстанавливает 1 жизнь, максимум 3. При полном здоровье появляется MAX. Сердечки не дают валюту и не снимают неуязвимость.",
  },
  {
    id: "damage",
    icon: heart,
    title: "Кактусы и столкновения",
    text: () =>
      `Кактус отнимает 1 жизнь. Контакт замирает на ${Rules.hitStopSeconds} с. Затем ${Rules.immunitySeconds} с дино мигает, не получает урон и бежит со стартовой скоростью. При 0 жизней он падает, после чего открывается главное меню.`,
  },
  {
    id: "record",
    icon: record,
    title: "Дистанция и рекорд",
    text: "Дистанция — весь пройденный путь, даже при движении назад или по кругу. Скорость постепенно растёт до предела. Рекорд сохраняется на устройстве.",
  },
  {
    id: "wardrobe",
    icon: "▣",
    title: "Магазин",
    text: "Скины, шапки, ботинки, часы и перчатки меняют только внешний вид. Покупка однократная, повторное надевание бесплатно. Аксессуары можно снять; зелёный дино открыт сразу. Модель в главном меню вращается автоматически и пальцем без изменения масштаба.",
  },
  {
    id: "camera",
    icon: "▣",
    title: "Камера и пауза",
    text: "Кнопка камеры справа внизу плавно меняет вид от первого/третьего лица. Пауза слева останавливает забег. В ней доступны продолжение, настройки и справка. Настройки звука, музыки и вибрации независимы.",
  },
  {
    id: "world",
    icon: "☀",
    title: "Мир и браузер",
    text: "Покрытия и кактусы процедурные и сохраняют положение при разворотах. День и ночь меняются плавно. Игра предназначена для вертикального сенсорного экрана. Уход из браузера ставит паузу. В Safari полноэкранный запуск — через «На экран Домой».",
  },
  {
    id: "storage",
    icon: "▣",
    title: "Сохранения",
    text: "Валюта хранится в cookie, рекорд и гардероб — в хранилище браузера. Очистка данных может стереть прогресс. Аккаунтов, облачных сохранений и серверной экономики пока нет.",
  },
] as const;

export class HelpUI {
  static readonly key = "dinorun-help-seen-v1";
  static firstVisit() {
    try {
      return localStorage.getItem(this.key) !== "1";
    } catch {
      return true;
    }
  }
  static seen() {
    try {
      localStorage.setItem(this.key, "1");
    } catch {
      /* Optional storage. */
    }
  }
  constructor(root: HTMLElement) {
    for (const entry of HELP_ENTRIES) {
      const article = document.createElement("article"),
        heading = document.createElement("h3"),
        text = document.createElement("p");
      if (entry.icon.length > 3) {
        const img = document.createElement("img");
        img.src = entry.icon;
        img.alt = "";
        heading.append(img);
      } else {
        const icon = document.createElement("span");
        icon.textContent = entry.icon;
        icon.className = "manual-icon";
        heading.append(icon);
      }
      heading.append(entry.title);
      text.textContent =
        typeof entry.text === "function" ? entry.text() : entry.text;
      article.dataset.help = entry.id;
      article.append(heading, text);
      root.append(article);
    }
  }
}

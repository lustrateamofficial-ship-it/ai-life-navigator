// Внешний вид: тема (системная, светлая, тёмная или по расписанию) и облегчённый режим.
// Всё хранится на телефоне и входит в файл копии.
const KEY = "navigator:appearance";

export type ThemeMode = "auto" | "light" | "dark" | "schedule";

export interface Appearance {
  theme: ThemeMode;
  darkFrom: string; // "ЧЧ:ММ": с этого времени тёмная тема (режим «по расписанию»)
  darkTo: string; // до этого времени
  lite: boolean; // облегчённый режим: меньше кнопок и карточек
}

const DEFAULTS: Appearance = { theme: "auto", darkFrom: "21:00", darkTo: "07:00", lite: false };
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function readAppearance(): Appearance {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw && typeof raw === "object") return normalizeAppearance(raw);
  } catch {
    /* повреждено или недоступно: значения по умолчанию */
  }
  return { ...DEFAULTS };
}

export function normalizeAppearance(raw: any): Appearance {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    theme: ["auto", "light", "dark", "schedule"].includes(r.theme) ? r.theme : DEFAULTS.theme,
    darkFrom: typeof r.darkFrom === "string" && TIME.test(r.darkFrom) ? r.darkFrom : DEFAULTS.darkFrom,
    darkTo: typeof r.darkTo === "string" && TIME.test(r.darkTo) ? r.darkTo : DEFAULTS.darkTo,
    lite: r.lite === true,
  };
}

export function writeAppearance(a: Appearance) {
  try {
    localStorage.setItem(KEY, JSON.stringify(normalizeAppearance(a)));
  } catch {
    /* не сохранится: после перезапуска вернутся значения по умолчанию */
  }
  applyAppearance();
  window.dispatchEvent(new Event("navigator:appearance"));
}

function minutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Тёмная ли тема сейчас по расписанию. Если «с» позже «до», окно идёт через полночь.
export function isDarkBySchedule(from: string, to: string, now: Date): boolean {
  const n = now.getHours() * 60 + now.getMinutes();
  const a = minutes(from);
  const b = minutes(to);
  if (a === b) return false;
  return a < b ? n >= a && n < b : n >= a || n < b;
}

export function applyAppearance(now = new Date()) {
  const a = readAppearance();
  const root = document.documentElement;
  let theme: "light" | "dark" | null = null;
  if (a.theme === "light" || a.theme === "dark") theme = a.theme;
  else if (a.theme === "schedule") theme = isDarkBySchedule(a.darkFrom, a.darkTo, now) ? "dark" : "light";
  if (theme) root.setAttribute("data-theme", theme);
  else root.removeAttribute("data-theme");
  if (a.lite) root.setAttribute("data-lite", "1");
  else root.removeAttribute("data-lite");

  const dark = theme ? theme === "dark" : !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = dark ? "#0e1013" : "#f4f5f7";
}

// Применить при запуске и обновлять раз в минуту: время расписания наступает и при открытом приложении.
export function startAppearance() {
  applyAppearance();
  setInterval(() => applyAppearance(), 60_000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) applyAppearance();
  });
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => applyAppearance());
}

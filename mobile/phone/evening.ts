// Вечерний вопрос: раз в день в выбранное время приходит напоминание записать пару строк в дневник.
// Настройка хранится на телефоне.
const KEY = "navigator:evening";

export interface EveningSettings {
  enabled: boolean;
  time: string; // "ЧЧ:ММ"
}

export function readEvening(): EveningSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (raw && typeof raw.enabled === "boolean" && /^\d{2}:\d{2}$/.test(raw.time)) return raw;
  } catch {
    /* настройки повреждены или недоступны: берём значения по умолчанию */
  }
  return { enabled: false, time: "21:00" };
}

export function writeEvening(s: EveningSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* хранилище недоступно: настройка не сохранится */
  }
}

export function eveningParts(s: EveningSettings): { hour: number; minute: number } {
  const [h, m] = s.time.split(":").map(Number);
  return { hour: h || 0, minute: m || 0 };
}

export const EVENING_TITLE = "Дневник";
export const EVENING_BODY = "Как прошёл день? Запиши пару строк.";

// Подбор времени по тому, когда человек обычно пишет: середина (медиана) времени последних записей,
// округлённая до 5 минут и не раньше 08:00 и не позже 23:00. Если записей мало, ничего не предлагаем.
export function suggestEveningTime(createdAt: Array<Date | string>): string | null {
  const mins = createdAt
    .map((d) => new Date(d))
    .filter((d) => !isNaN(d.getTime()))
    // записи после полуночи (до 04:00) считаем продолжением вечера, иначе медиана «разваливается» надвое
    .map((d) => (d.getHours() < 4 ? 24 * 60 : 0) + d.getHours() * 60 + d.getMinutes())
    .sort((a, b) => a - b);
  if (mins.length < 5) return null;
  const mid = mins[Math.floor(mins.length / 2)];
  const clamped = Math.min(23 * 60, Math.max(8 * 60, Math.round(mid / 5) * 5));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

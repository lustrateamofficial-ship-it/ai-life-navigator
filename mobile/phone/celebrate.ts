// Праздник, когда выполнены все задачи дня: картинка, музыка и «каскад карт» как при победе в косынке.
// Показывается один раз за день, в момент, когда последняя задача отмечена. Включается и выключается в «Настройках».
import { dayProgress } from "./charts";
import { api } from "../src/api/client";

const KEY = "navigator:celebrate";
const DAY_KEY = "navigator:celebrate-day";
export const CELEBRATE_EVENT = "navigator:celebrate";

export interface CelebrateSettings {
  on: boolean; // показывать праздник
  sound: boolean; // с музыкой
}

const DEFAULTS: CelebrateSettings = { on: true, sound: true };

export function normalizeCelebrate(raw: any): CelebrateSettings {
  const r = raw && typeof raw === "object" ? raw : {};
  return { on: r.on !== false, sound: r.sound !== false };
}

export function readCelebrate(): CelebrateSettings {
  try {
    return normalizeCelebrate(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeCelebrate(s: CelebrateSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(normalizeCelebrate(s)));
  } catch {
    /* не сохранится: останутся значения по умолчанию */
  }
}

function dayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Показать праздник сейчас (кнопка «Посмотреть» в настройках и сам момент победы). */
export function showCelebration() {
  window.dispatchEvent(new Event(CELEBRATE_EVENT));
}

/** Вызывается после того, как задача отмечена выполненной: если задач на сегодня не осталось, один раз за день празднуем. */
export async function celebrateIfDayDone(): Promise<boolean> {
  try {
    if (!readCelebrate().on) return false;
    const today = dayKey();
    if (localStorage.getItem(DAY_KEY) === today) return false;
    const p = await dayProgress();
    if (p.total === 0 || p.done < p.total) return false;
    // Кольцо не считает задачи без даты, а список «Сегодня» показывает их: праздник только когда и там пусто.
    const open = await api.get<unknown[]>("/tasks?range=today");
    if (open.length > 0) return false;
    localStorage.setItem(DAY_KEY, today);
    showCelebration();
    return true;
  } catch {
    return false;
  }
}

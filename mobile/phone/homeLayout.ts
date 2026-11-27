// Какие плитки видны на экранах «Сегодня», «Дневник», «Планы» и «Я» и в каком порядке.
// Человек сам включает, выключает и переставляет их: один набор на экран, без привязки ко времени суток.
// Хранится на телефоне, в копию данных попадает.

import { introActive } from "./intro";

export type ScreenId = "today" | "journal" | "plans" | "me";
export type BlockId = "week" | "weight" | "brief" | "ring" | "write" | "focus" | "earlier" | "insight";

export interface TileDef {
  id: string;
  label: string;
  hint: string;
  /** Маленькая плитка: две подряд встают в ряд, одинокая растягивается на всю ширину. */
  half?: boolean;
}

export const SCREENS: Array<{ id: ScreenId; label: string; title: string }> = [
  { id: "today", label: "Сегодня", title: "Сегодня" },
  { id: "journal", label: "Дневник", title: "Дневник" },
  { id: "plans", label: "Планы", title: "Планы" },
  { id: "me", label: "Я", title: "Я" },
];

export const TILES: Record<ScreenId, TileDef[]> = {
  today: [
    { id: "week", label: "Неделя", hint: "Семь квадратов: как прошли дни этой недели" },
    { id: "weight", label: "Вес", hint: "Линия веса, цель и процент выполнения", half: true },
    { id: "brief", label: "Сводка", hint: "Погода, вес, главное и расписание" },
    { id: "ring", label: "Кольцо дня", hint: "Сколько задач дня сделано", half: true },
    { id: "write", label: "Запись в дневник", hint: "Поле записи и подсказки" },
    { id: "focus", label: "Что полезно сейчас", hint: "Задачи и ближайшее напоминание" },
    { id: "earlier", label: "Раньше", hint: "Что писал в этот день раньше" },
    { id: "insight", label: "Наблюдение и подсказка", hint: "Короткие выводы ИИ по записям" },
  ],
  journal: [
    { id: "write", label: "Поле записи", hint: "Новая запись и подсказки" },
    { id: "week", label: "Итоги недели", hint: "Сводка по записям за неделю" },
    { id: "principles", label: "Мои принципы", hint: "Что приложение заметило в твоих записях" },
    { id: "search", label: "Поиск и период", hint: "Найти запись или выбрать период" },
  ],
  plans: [
    { id: "tasks", label: "Задачи", hint: "Список дел, сроки и напоминания" },
    { id: "goals", label: "Цели", hint: "Куда идёшь и как продвигаешься" },
    { id: "calendar", label: "Расписание", hint: "События и занятия по дням" },
  ],
  me: [
    { id: "mission", label: "Моя миссия", hint: "Строка с твоей миссией" },
    { id: "stats", label: "Вес и серия", hint: "Две плитки сверху и подробности под ними" },
    { id: "habits", label: "Привычки", hint: "Ярлык раздела" },
    { id: "finance", label: "Финансы", hint: "Ярлык раздела" },
    { id: "ideas", label: "Идеи", hint: "Ярлык раздела" },
    { id: "memory", label: "Память", hint: "Ярлык раздела" },
    { id: "mission-page", label: "Миссия (раздел)", hint: "Ярлык раздела" },
    { id: "analytics", label: "Аналитика", hint: "Ярлык раздела" },
    { id: "trash", label: "Корзина", hint: "Ярлык раздела" },
  ],
};

/** Ярлыки разделов на экране «Я»: они собираются в одну сетку по три в ряд. */
export const ME_SHORTCUTS: ReadonlySet<string> = new Set(["habits", "finance", "ideas", "memory", "mission-page", "analytics", "trash"]);

export type Layouts = Record<ScreenId, string[]>;

// Утро, день и вечер остались только в приветствии на «Сегодня»: «Доброе утро», «Добрый день», «Добрый вечер».
export type Period = "morning" | "day" | "evening";
export const PERIODS: Array<{ id: Period; label: string; greeting: string }> = [
  { id: "morning", label: "Утро", greeting: "Доброе утро" },
  { id: "day", label: "День", greeting: "Добрый день" },
  { id: "evening", label: "Вечер", greeting: "Добрый вечер" },
];
export function periodAt(d: Date = new Date()): Period {
  const h = d.getHours();
  return h < 12 ? "morning" : h < 18 ? "day" : "evening";
}

const KEY = "navigator:home-layout";
const ids = (s: ScreenId) => TILES[s].map((t) => t.id);

export function defaultLayouts(): Layouts {
  return {
    today: ["week", "ring", "weight", "brief", "focus", "write", "earlier"],
    journal: ids("journal"),
    plans: ids("plans"),
    me: ids("me"),
  };
}

// Первые дни: поле записи и «что полезно сейчас». Остальное откроется после трёх шагов знакомства.
function introLayouts(): Layouts {
  return { ...defaultLayouts(), today: ["write", "focus"] };
}

function cleanList(v: unknown, screen: ScreenId): string[] | null {
  if (!Array.isArray(v)) return null;
  const known = new Set(ids(screen));
  const seen = new Set<string>();
  return v.filter((x): x is string => typeof x === "string" && known.has(x) && !seen.has(x) && !!seen.add(x));
}

/**
 * Принимает и новый вид ({today, journal, plans, me}), и старый: отдельные наборы для утра, дня и вечера
 * ({morning, day, evening}) или просто список. Из старого берётся набор того времени суток, что сейчас на экране.
 */
export function normalizeLayouts(raw: unknown, now: Date = new Date()): Layouts {
  const base = defaultLayouts();
  if (Array.isArray(raw)) return { ...base, today: cleanList(raw, "today") ?? base.today };
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const out = { ...base };
  if ("morning" in r || "day" in r || "evening" in r) {
    const old = cleanList(r[periodAt(now)], "today") ?? cleanList(r.day, "today");
    if (old) out.today = old;
    return out;
  }
  for (const s of SCREENS) {
    const l = cleanList(r[s.id], s.id);
    if (l) out[s.id] = l;
  }
  return out;
}

export function readLayouts(): Layouts {
  try {
    const s = localStorage.getItem(KEY);
    return s ? normalizeLayouts(JSON.parse(s)) : introActive() ? introLayouts() : defaultLayouts();
  } catch {
    return defaultLayouts();
  }
}

export function writeLayouts(l: Layouts): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(normalizeLayouts(l)));
    window.dispatchEvent(new Event("navigator:home-layout"));
  } catch {
    /* хранилище недоступно: настройка просто не сохранится */
  }
}

export const readTiles = (screen: ScreenId): string[] => readLayouts()[screen];
export function writeTiles(screen: ScreenId, list: string[]): void {
  writeLayouts({ ...readLayouts(), [screen]: list });
}

/**
 * Ширина каждой плитки в списке. Две маленькие подряд встают рядом, одинокая маленькая занимает всю ширину,
 * поэтому пустых мест не бывает при любом порядке.
 */
export function spans(list: string[], isHalf: (id: string) => boolean): Array<"half" | "full"> {
  const out: Array<"half" | "full"> = [];
  for (let i = 0; i < list.length; i++) {
    if (isHalf(list[i]!) && i + 1 < list.length && isHalf(list[i + 1]!)) {
      out.push("half", "half");
      i++;
    } else out.push("full");
  }
  return out;
}

/**
 * Сколько колонок из шести занимает каждый ярлык в сетке по три в ряд. Последний неполный ряд растягивается:
 * один ярлык занимает весь ряд, два делят его пополам.
 */
export function shortcutSpans(n: number): number[] {
  const out = Array(n).fill(2) as number[];
  const rest = n % 3;
  if (n > 0 && rest === 1) out[n - 1] = 6;
  if (rest === 2) {
    out[n - 1] = 3;
    out[n - 2] = 3;
  }
  return out;
}

export function moveTile(list: string[], from: number, to: number): string[] {
  if (from < 0 || from >= list.length) return list;
  const t = Math.max(0, Math.min(list.length - 1, to));
  if (t === from) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(t, 0, item!);
  return next;
}

export function toggleTile(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

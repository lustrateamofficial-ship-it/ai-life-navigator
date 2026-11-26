// Что показано на экране «Сегодня» в разное время суток. Человек сам выбирает блоки и порядок,
// либо берёт готовый набор: «Минимум», «Баланс» или «Всё». Хранится на телефоне, в копию попадает.

import { introActive } from "./intro";

export type Period = "morning" | "day" | "evening";
export type BlockId = "week" | "weight" | "brief" | "ring" | "write" | "focus" | "earlier" | "insight";
export type PresetId = "min" | "balance" | "all";

export const PERIODS: Array<{ id: Period; label: string; greeting: string }> = [
  { id: "morning", label: "Утро", greeting: "Доброе утро" },
  { id: "day", label: "День", greeting: "Добрый день" },
  { id: "evening", label: "Вечер", greeting: "Добрый вечер" },
];

export const BLOCKS: Array<{ id: BlockId; label: string; hint: string }> = [
  { id: "week", label: "Неделя", hint: "Семь квадратов: как прошли дни этой недели" },
  { id: "weight", label: "Вес", hint: "Линия веса, цель и процент выполнения" },
  { id: "brief", label: "Сводка", hint: "Погода, вес, главное и расписание" },
  { id: "ring", label: "Кольцо дня", hint: "Сколько задач дня сделано" },
  { id: "write", label: "Запись в дневник", hint: "Поле записи и подсказки" },
  { id: "focus", label: "Что полезно сейчас", hint: "Задачи и ближайшее напоминание" },
  { id: "earlier", label: "Раньше", hint: "Что писал в этот день раньше" },
  { id: "insight", label: "Наблюдение и подсказка", hint: "Короткие выводы ИИ по записям" },
];

export type Layout = Record<Period, BlockId[]>;

export const PRESETS: Array<{ id: PresetId; label: string; layout: Layout }> = [
  {
    id: "min",
    label: "Минимум",
    layout: { morning: ["brief", "focus"], day: ["ring", "focus", "write"], evening: ["write", "brief"] },
  },
  {
    id: "balance",
    label: "Баланс",
    layout: {
      morning: ["week", "ring", "weight", "brief", "focus", "write", "earlier"],
      day: ["week", "ring", "weight", "focus", "brief", "write", "earlier"],
      evening: ["write", "ring", "weight", "week", "focus", "brief", "earlier"],
    },
  },
  {
    id: "all",
    label: "Всё",
    layout: {
      morning: ["week", "ring", "weight", "brief", "focus", "write", "earlier", "insight"],
      day: ["week", "ring", "weight", "brief", "focus", "write", "earlier", "insight"],
      evening: ["write", "ring", "weight", "week", "brief", "focus", "earlier", "insight"],
    },
  },
];

const KEY = "navigator:home-layout";
const IDS = new Set<string>(BLOCKS.map((b) => b.id));

// Первые дни: поле записи и «что полезно сейчас». Остальное откроется после трёх шагов знакомства.
function introLayout(): Layout {
  return { morning: ["write", "focus"], day: ["write", "focus"], evening: ["write", "focus"] };
}

// Плитки, которые встают по две в ряд. Одинокая плитка растягивается на всю ширину.
export const HALF_BLOCKS: ReadonlySet<BlockId> = new Set<BlockId>(["ring", "weight"]);

export function defaultLayout(): Layout {
  return structuredClone(PRESETS[1]!.layout);
}

export function normalizeLayout(raw: unknown): Layout {
  const base = defaultLayout();
  if (!raw || typeof raw !== "object") return base;
  const out = { ...base };
  for (const p of PERIODS) {
    const v = (raw as Record<string, unknown>)[p.id];
    if (Array.isArray(v)) {
      const seen = new Set<string>();
      out[p.id] = v.filter((x): x is BlockId => typeof x === "string" && IDS.has(x) && !seen.has(x) && !!seen.add(x));
    }
  }
  return out;
}

export function readLayout(): Layout {
  try {
    const s = localStorage.getItem(KEY);
    return s ? normalizeLayout(JSON.parse(s)) : introActive() ? introLayout() : defaultLayout();
  } catch {
    return defaultLayout();
  }
}

export function writeLayout(l: Layout): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(normalizeLayout(l)));
    window.dispatchEvent(new Event("navigator:home-layout"));
  } catch {
    /* хранилище недоступно: настройка просто не сохранится */
  }
}

export function periodAt(d: Date = new Date()): Period {
  const h = d.getHours();
  return h < 12 ? "morning" : h < 18 ? "day" : "evening";
}

/** Какой готовый набор совпадает с текущим выбором (или null, если человек настроил по-своему). */
export function matchPreset(l: Layout): PresetId | null {
  const s = JSON.stringify(l);
  return PRESETS.find((p) => JSON.stringify(p.layout) === s)?.id ?? null;
}

export function moveBlock(list: BlockId[], id: BlockId, dir: -1 | 1): BlockId[] {
  const i = list.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

export function toggleBlock(list: BlockId[], id: BlockId): BlockId[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

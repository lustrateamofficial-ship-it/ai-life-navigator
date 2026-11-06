// Настройки, которые живут только на телефоне, но должны попадать в копию данных:
// бюджет по категориям и время вечернего вопроса. Дописываются в файл копии отдельным разделом,
// серверная часть о нём не знает и просто не трогает.
import { readEvening, writeEvening, type EveningSettings } from "./evening";
import { readDaily, writeDaily, normalizeDaily, readPlans, writePlans, type DailySettings } from "./daily";
import { readAppearance, writeAppearance, normalizeAppearance, type Appearance } from "./appearance";

const BUDGET_KEY = "navigator:budget";

export type BudgetLimits = Record<string, number>;

export function readBudget(): BudgetLimits {
  try {
    const raw = JSON.parse(localStorage.getItem(BUDGET_KEY) ?? "{}");
    const out: BudgetLimits = {};
    for (const [k, v] of Object.entries(raw ?? {})) if (typeof v === "number" && v > 0 && isFinite(v)) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

export function writeBudget(limits: BudgetLimits) {
  try {
    localStorage.setItem(BUDGET_KEY, JSON.stringify(limits));
  } catch {
    /* хранилище недоступно: лимиты не сохранятся */
  }
}

export interface PhoneExtras {
  budget: BudgetLimits;
  evening: EveningSettings;
  appearance: Appearance;
  daily: DailySettings;
  dayPlans: ReturnType<typeof readPlans>;
}

export function collectExtras(): PhoneExtras {
  return { budget: readBudget(), evening: readEvening(), appearance: readAppearance(), daily: readDaily(), dayPlans: readPlans() };
}

export function applyExtras(raw: any) {
  if (!raw || typeof raw !== "object") return;
  if (raw.budget && typeof raw.budget === "object") {
    const merged = { ...readBudget() };
    for (const [k, v] of Object.entries(raw.budget)) if (typeof v === "number" && v > 0 && isFinite(v)) merged[k] = v;
    writeBudget(merged);
  }
  const e = raw.evening;
  if (e && typeof e.enabled === "boolean" && typeof e.time === "string" && /^\d{2}:\d{2}$/.test(e.time)) writeEvening(e);
  if (raw.appearance && typeof raw.appearance === "object") writeAppearance(normalizeAppearance(raw.appearance));
  if (raw.daily && typeof raw.daily === "object") writeDaily(normalizeDaily(raw.daily));
  if (raw.dayPlans && typeof raw.dayPlans === "object") writePlans({ ...readPlans(), ...raw.dayPlans });
}

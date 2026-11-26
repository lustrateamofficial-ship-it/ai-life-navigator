// Данные для графиков: кольцо дня и финансы по месяцам. Считается на телефоне из тех же записей.
import { prisma } from "../shim/prisma";
import { dayKey, readPlans } from "./daily";

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export interface DayProgress {
  done: number;
  total: number;
}

/** Сколько задач дня сделано и сколько всего. Задачи дня: на сегодня по сроку или времени, просроченные и выбранные в плане. */
export async function dayProgress(now = new Date()): Promise<DayProgress> {
  const from = startOfDay(now);
  const to = new Date(from.getTime() + 86400000);
  const all = await prisma.task.findMany({});
  const planned = new Set(readPlans()[dayKey(now)]?.taskIds ?? []);
  let done = 0;
  let open = 0;
  for (const t of all) {
    if (t.status === "cancelled") continue;
    if (t.status === "done") {
      if (t.completedAt && new Date(t.completedAt) >= from && new Date(t.completedAt) < to) done++;
      continue;
    }
    const sched = t.scheduledTime ? new Date(t.scheduledTime) : null;
    const dl = t.deadline ? new Date(t.deadline) : null;
    if ((sched && sched >= from && sched < to) || (dl && dl < to) || planned.has(t.id)) open++;
  }
  return { done, total: done + open };
}

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

export interface MonthRow {
  label: string;
  income: number;
  expense: number;
}

export async function financeSeries(now = new Date(), months = 6): Promise<MonthRow[]> {
  const first = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const rows = await prisma.financialTransaction.findMany({ where: { date: { gte: first } } });
  const out: MonthRow[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(first.getFullYear(), first.getMonth() + i, 1);
    out.push({ label: MONTHS[d.getMonth()]!, income: 0, expense: 0 });
  }
  for (const r of rows) {
    const d = new Date(r.date);
    const idx = (d.getFullYear() - first.getFullYear()) * 12 + d.getMonth() - first.getMonth();
    if (idx < 0 || idx >= months) continue;
    if (r.type === "income") out[idx]!.income += r.amount;
    else if (r.type === "expense") out[idx]!.expense += r.amount;
  }
  return out;
}

export interface CategoryRow {
  category: string;
  amount: number;
}

/** Расходы текущего месяца по категориям, крупные первыми; хвост мелких собирается в «Остальное». */
export async function expensesByCategory(now = new Date(), top = 5): Promise<CategoryRow[]> {
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const rows = await prisma.financialTransaction.findMany({ where: { type: "expense", date: { gte: first } } });
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.category || "Без категории", (m.get(r.category || "Без категории") ?? 0) + r.amount);
  const list = [...m.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  if (list.length <= top) return list;
  const rest = list.slice(top).reduce((s, x) => s + x.amount, 0);
  return [...list.slice(0, top), { category: "Остальное", amount: rest }];
}

import { prisma } from "../db/prisma.js";

// Раздел 23: Correlation Engine.
// Считаем корреляцию Пирсона между парами ежедневных метрик, которые реально
// есть в БД. НЕ выдаём корреляцию за причинность — формулировки всегда
// "сопровождались", "в твоих данных за N дней", с указанием количества наблюдений.

interface DailyPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export function pearson(a: number[], b: number[]): number | null {
  const n = a.length;
  if (n < 5) return null; // раздел 23: не выдавать корреляцию на слишком малой выборке

  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;

  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA === 0 || varB === 0) return null;
  return cov / Math.sqrt(varA * varB);
}

function toDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function dailyTaskCompletion(userId: string, since: Date): Promise<Map<string, number>> {
  const tasks = await prisma.task.findMany({
    where: { userId, status: "done", completedAt: { gte: since } },
    select: { completedAt: true },
  });
  const map = new Map<string, number>();
  for (const t of tasks) {
    const key = toDayKey(t.completedAt!);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

async function dailyWeightDelta(userId: string, since: Date): Promise<Map<string, number>> {
  const logs = await prisma.weightLog.findMany({
    where: { userId, date: { gte: since } },
    orderBy: { date: "asc" },
  });
  const map = new Map<string, number>();
  for (let i = 1; i < logs.length; i++) {
    const key = toDayKey(logs[i].date);
    map.set(key, logs[i].weightKg - logs[i - 1].weightKg);
  }
  return map;
}

async function dailyHabitCompletion(userId: string, since: Date): Promise<Map<string, number>> {
  const logs = await prisma.habitLog.findMany({
    where: { habit: { userId }, date: { gte: since }, completed: true },
    select: { date: true },
  });
  const map = new Map<string, number>();
  for (const l of logs) {
    const key = toDayKey(l.date);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

async function dailyExpenses(userId: string, since: Date): Promise<Map<string, number>> {
  const txs = await prisma.financialTransaction.findMany({
    where: { userId, type: "expense", date: { gte: since } },
  });
  const map = new Map<string, number>();
  for (const t of txs) {
    const key = toDayKey(t.date);
    map.set(key, (map.get(key) ?? 0) + t.amount);
  }
  return map;
}

// Настроение дня из отметки «Хорошо / Нормально / Плохо» (в приложении и в вечернем вопросе бота).
// «Пропустил» в расчёт не берётся: это не оценка дня. Числа условные (3/2/1), нужны только для
// корреляции, пользователю они не показываются.
const MOOD_VALUE: Record<string, number> = { good: 3, normal: 2, bad: 1 };

async function dailyMood(userId: string, since: Date): Promise<Map<string, number>> {
  const rows = await prisma.dailyCheckin.findMany({
    where: { userId, date: { gte: since }, rating: { in: ["good", "normal", "bad"] } },
    select: { date: true, rating: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) map.set(toDayKey(r.date), MOOD_VALUE[r.rating as string]);
  return map;
}

function alignSeries(mapA: Map<string, number>, mapB: Map<string, number>): [number[], number[], number] {
  const commonKeys = [...mapA.keys()].filter((k) => mapB.has(k));
  return [commonKeys.map((k) => mapA.get(k)!), commonKeys.map((k) => mapB.get(k)!), commonKeys.length];
}

interface Pair {
  metricA: string;
  metricB: string;
  description: (r: number, n: number) => string;
}

export async function computeCorrelations(userId: string, periodDays = 56) {
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const [tasks, weightDelta, habits, expenses, mood] = await Promise.all([
    dailyTaskCompletion(userId, since),
    dailyWeightDelta(userId, since),
    dailyHabitCompletion(userId, since),
    dailyExpenses(userId, since),
    dailyMood(userId, since),
  ]);

  const pairs: Pair[] = [
    {
      metricA: "habit_completion",
      metricB: "task_completion",
      description: (r, n) =>
        `В твоих данных за ${periodDays} дней (${n} наблюдений) дни с выполненными привычками ${
          r > 0 ? "сопровождались" : "не сопровождались"
        } более высоким выполнением задач (корреляция ${r.toFixed(2)}).`,
    },
    {
      metricA: "task_completion",
      metricB: "weight_change",
      description: (r, n) =>
        `За ${periodDays} дней (${n} наблюдений) дни с большим количеством выполненных задач ${
          r < 0 ? "сопровождались небольшим снижением" : "не показали явной связи со снижением"
        } веса (корреляция ${r.toFixed(2)}).`,
    },
    {
      metricA: "expenses",
      metricB: "task_completion",
      description: (r, n) =>
        `За ${periodDays} дней (${n} наблюдений) дни с более высокими расходами ${
          r < 0 ? "сопровождались" : "не сопровождались"
        } меньшим выполнением задач (корреляция ${r.toFixed(2)}).`,
    },
    {
      metricA: "mood",
      metricB: "task_completion",
      description: (r, n) =>
        `За ${periodDays} дней (${n} наблюдений) дни с лучшим настроением ${
          r > 0 ? "сопровождались" : "не сопровождались"
        } большим числом выполненных задач (корреляция ${r.toFixed(2)}). Это не значит, что одно вызывает другое.`,
    },
    {
      metricA: "mood",
      metricB: "habit_completion",
      description: (r, n) =>
        `За ${periodDays} дней (${n} наблюдений) дни с лучшим настроением ${
          r > 0 ? "сопровождались" : "не сопровождались"
        } выполнением привычек (корреляция ${r.toFixed(2)}). Это не значит, что одно вызывает другое.`,
    },
  ];

  const seriesMap: Record<string, Map<string, number>> = {
    habit_completion: habits,
    task_completion: tasks,
    weight_change: weightDelta,
    expenses,
    mood,
  };

  const results: Array<{ metricA: string; metricB: string; strength: number; observations: number; description: string }> = [];

  for (const pair of pairs) {
    const [a, b, n] = alignSeries(seriesMap[pair.metricA], seriesMap[pair.metricB]);
    const r = pearson(a, b);
    if (r === null) continue; // недостаточно данных — не сохраняем и не показываем
    results.push({
      metricA: pair.metricA,
      metricB: pair.metricB,
      strength: Math.round(r * 100) / 100,
      observations: n,
      description: pair.description(r, n),
    });
  }

  return results;
}

export async function saveCorrelations(userId: string) {
  const results = await computeCorrelations(userId);

  // Заменяем предыдущий снимок, чтобы не копить дубликаты при каждом запуске.
  await prisma.correlation.deleteMany({ where: { userId } });
  if (results.length === 0) return [];

  await prisma.correlation.createMany({
    data: results.map((r) => ({ userId, ...r })),
  });

  return prisma.correlation.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

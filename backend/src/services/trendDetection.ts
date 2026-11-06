import { prisma } from "../db/prisma.js";

// Раздел 27: "Куда я двигаюсь?" — Сейчас / 30 дней назад / Тенденция / Прогноз.
// Считается кодом на реальных Direction Score снимках, без AI.

export interface TrendMetric {
  metric: string;
  label: string;
  now: number | null;
  past: number | null;
  direction: "up" | "down" | "flat" | "unknown";
}

function direction(now: number | null, past: number | null): TrendMetric["direction"] {
  if (now === null || past === null) return "unknown";
  const diff = now - past;
  if (Math.abs(diff) < 3) return "flat"; // раздел 24: не реагировать на шум
  return diff > 0 ? "up" : "down";
}

export async function computeTrends(userId: string): Promise<TrendMetric[]> {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since37d = new Date(Date.now() - 37 * 24 * 60 * 60 * 1000);

  const [latest, past] = await Promise.all([
    prisma.directionScore.findFirst({ where: { userId }, orderBy: { date: "desc" } }),
    prisma.directionScore.findFirst({
      where: { userId, date: { gte: since37d, lte: since30d } },
      orderBy: { date: "desc" },
    }),
  ]);

  const metrics: TrendMetric[] = [
    {
      metric: "goals",
      label: "Главная цель",
      now: latest?.goalsScore ?? null,
      past: past?.goalsScore ?? null,
      direction: direction(latest?.goalsScore ?? null, past?.goalsScore ?? null),
    },
    {
      metric: "health",
      label: "Здоровье",
      now: latest?.healthScore ?? null,
      past: past?.healthScore ?? null,
      direction: direction(latest?.healthScore ?? null, past?.healthScore ?? null),
    },
    {
      metric: "finance",
      label: "Финансовый прогресс",
      now: latest?.financeScore ?? null,
      past: past?.financeScore ?? null,
      direction: direction(latest?.financeScore ?? null, past?.financeScore ?? null),
    },
    {
      metric: "time",
      label: "Время на развитие",
      now: latest?.timeScore ?? null,
      past: past?.timeScore ?? null,
      direction: direction(latest?.timeScore ?? null, past?.timeScore ?? null),
    },
  ];

  return metrics;
}

export async function saveDetectedTrends(userId: string) {
  const metrics = await computeTrends(userId);
  const meaningful = metrics.filter((m) => m.direction !== "unknown");
  if (meaningful.length === 0) return [];

  await prisma.detectedTrend.createMany({
    data: meaningful.map((m) => ({
      userId,
      metric: m.metric,
      direction: m.direction,
      periodDays: 30,
    })),
  });

  return meaningful;
}

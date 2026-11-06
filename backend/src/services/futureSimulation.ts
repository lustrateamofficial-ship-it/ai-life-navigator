import { prisma } from "../db/prisma.js";
import { generateVerifierText, verifyAgainstData } from "./ai/textGeneration.js";
import { isAiConfigured } from "../config/env.js";

// Раздел 28: Future Simulation.
// Числовая часть (линейная регрессия по истории Direction Score) считается кодом.
// AI используется только чтобы облечь цифры в понятный текст — и ОБЯЗАТЕЛЬНО
// с дисклеймером "это прогноз, а не гарантированный результат" (раздел 28).

interface LinearFit {
  slope: number; // изменение score за день
  intercept: number;
}

export function linearRegression(points: Array<{ x: number; y: number }>): LinearFit | null {
  const n = points.length;
  if (n < 5) return null;

  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;

  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) ** 2;
  }
  if (den === 0) return null;

  const slope = num / den;
  const intercept = meanY - slope * meanX;
  return { slope, intercept };
}

type Projection =
  | { possible: false; reason: string }
  | {
      possible: true;
      currentScore: number;
      projectedScore: number;
      dailyTrend: number;
      daysAhead: number;
      historyPoints: number;
    };

export async function projectDirectionScore(userId: string, daysAhead: number): Promise<Projection> {
  const history = await prisma.directionScore.findMany({
    where: { userId },
    orderBy: { date: "asc" },
  });

  if (history.length < 5) {
    return {
      possible: false,
      reason: "Недостаточно данных для прогноза (нужно минимум 5 дней истории Direction Score).",
    };
  }

  const t0 = history[0].date.getTime();
  const points = history.map((h) => ({
    x: (h.date.getTime() - t0) / (24 * 60 * 60 * 1000),
    y: h.overall,
  }));

  const fit = linearRegression(points);
  if (!fit) {
    return { possible: false, reason: "Недостаточно вариативности в данных для построения тренда." };
  }

  const lastX = points[points.length - 1].x;
  const projectedX = lastX + daysAhead;
  const projectedScore = Math.max(0, Math.min(100, fit.slope * projectedX + fit.intercept));

  return {
    possible: true,
    currentScore: history[history.length - 1].overall,
    projectedScore: Math.round(projectedScore),
    dailyTrend: Math.round(fit.slope * 100) / 100,
    daysAhead,
    historyPoints: history.length,
  };
}

export async function simulateFuture(
  userId: string,
  scenario: "current_trajectory" | "extra_hours",
  extraHoursPerWeek?: number
) {
  const daysAhead = 365;
  const base = await projectDirectionScore(userId, daysAhead);

  if (!base.possible) {
    return { ...base, narrative: null };
  }

  // Простая эвристика для сценария "добавить N часов в неделю" — раздел 28.
  // Не претендует на точность, это иллюстративная поправка, а не мед./фин. модель.
  let adjustedScore = base.projectedScore;
  if (scenario === "extra_hours" && extraHoursPerWeek) {
    const bonus = Math.min(15, extraHoursPerWeek * 1.5);
    adjustedScore = Math.max(0, Math.min(100, base.projectedScore + bonus));
  }

  let narrative: string | null = null;
  if (isAiConfigured()) {
    const prompt =
      scenario === "current_trajectory"
        ? `Текущий Direction Score: ${base.currentScore}. При сохранении текущего тренда (${base.dailyTrend} в день) через год прогноз: ${base.projectedScore}. Объясни это простыми словами в 2-3 предложениях.`
        : `Текущий Direction Score: ${base.currentScore}. Если добавить ${extraHoursPerWeek} часов в неделю на главную цель, прогноз через год примерно ${Math.round(adjustedScore)} вместо ${base.projectedScore}. Объясни в 2-3 предложениях.`;

    const draft = await generateVerifierText(
      "Ты объясняешь прогноз пользователю просто и без воды, на русском языке.",
      prompt
    );
    // Шаг [3] (verifier): прогноз цитирует конкретные числа (currentScore, projectedScore,
    // adjustedScore) — именно та ситуация, где модель может случайно переврать цифру
    // при пересказе своими словами. Сверяем перед показом.
    narrative = await verifyAgainstData(draft, {
      currentScore: base.currentScore,
      projectedScore: base.projectedScore,
      adjustedScore: scenario === "extra_hours" ? Math.round(adjustedScore) : undefined,
      dailyTrend: base.dailyTrend,
    });
  }

  return {
    ...base,
    scenario,
    adjustedScore: scenario === "extra_hours" ? Math.round(adjustedScore) : undefined,
    narrative,
    disclaimer: "Это прогноз на основе текущих данных, а не гарантированный результат.",
  };
}

import { prisma } from "../db/prisma.js";
import { localDateOnly } from "../utils/userTime.js";

// Раздел 24: Direction Score считается кодом на реальных данных, а не AI —
// AI используется только для объяснения "почему изменился" (см. orchestrator.whyDidIStop).

export interface DirectionScoreResult {
  overall: number;
  goalsScore: number;
  healthScore: number;
  financeScore: number;
  habitsScore: number;
  timeScore: number;
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

export async function computeDirectionScore(userId: string): Promise<DirectionScoreResult> {
  const since14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [goals, tasksLinkedDone, tasksTotalDone, habits, weightLogsRecent, txRecent] = await Promise.all([
    prisma.goal.findMany({ where: { userId, status: "active" } }),
    prisma.task.count({ where: { userId, status: "done", goalId: { not: null }, completedAt: { gte: since14d } } }),
    prisma.task.count({ where: { userId, status: "done", completedAt: { gte: since14d } } }),
    prisma.habit.findMany({ where: { userId, status: "active" } }),
    prisma.weightLog.findMany({ where: { userId, date: { gte: since7d } } }),
    prisma.financialTransaction.findMany({ where: { userId, date: { gte: since7d } } }),
  ]);

  // Goals score: средний прогресс активных целей + доля задач, связанных с целями
  const avgGoalProgress = goals.length ? goals.reduce((s, g) => s + g.progress, 0) / goals.length : 50;
  const goalTaskRatio = tasksTotalDone > 0 ? tasksLinkedDone / tasksTotalDone : 0.5;
  const goalsScore = clamp(avgGoalProgress * 0.6 + goalTaskRatio * 100 * 0.4);

  // Health score: наличие свежих логов веса как прокси вовлечённости (без AI-диагнозов)
  const healthScore = clamp(weightLogsRecent.length >= 4 ? 85 : weightLogsRecent.length * 20);

  // Finance score: положительный баланс за неделю
  const weekBalance = txRecent.reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0);
  const financeScore = clamp(weekBalance >= 0 ? 75 : 45);

  // Habits score: streak относительно targetDays
  const habitsScore = habits.length
    ? clamp(
        (habits.reduce((s, h) => s + Math.min(h.streak / h.targetDays, 1), 0) / habits.length) * 100
      )
    : 50;

  // Time score: доля задач, выполненных вовремя (упрощённо — есть completedAt <= deadline)
  const doneWithDeadline = await prisma.task.findMany({
    where: { userId, status: "done", deadline: { not: null }, completedAt: { gte: since14d } },
    select: { deadline: true, completedAt: true },
  });
  const onTime = doneWithDeadline.filter((t) => t.completedAt! <= t.deadline!).length;
  const timeScore = doneWithDeadline.length ? clamp((onTime / doneWithDeadline.length) * 100) : 60;

  const overall = Math.round(
    goalsScore * 0.35 + healthScore * 0.2 + financeScore * 0.15 + habitsScore * 0.15 + timeScore * 0.15
  );

  return {
    overall,
    goalsScore: Math.round(goalsScore),
    healthScore: Math.round(healthScore),
    financeScore: Math.round(financeScore),
    habitsScore: Math.round(habitsScore),
    timeScore: Math.round(timeScore),
  };
}

export async function saveDirectionScore(userId: string) {
  const score = await computeDirectionScore(userId);
  // БАГ (найден при повторном аудите): дата снимка считалась по часовому поясу сервера.
  // Эта функция вызывается и из cron (scheduler.ts, нет req) и из HTTP-роута — чтобы не
  // менять сигнатуру под оба случая, часовой пояс читаем сами, это одна лёгкая выборка.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const dateOnly = localDateOnly(new Date(), user?.timezone ?? "UTC");

  return prisma.directionScore.upsert({
    where: { userId_date: { userId, date: dateOnly } },
    update: score,
    create: { userId, date: dateOnly, ...score },
  });
}

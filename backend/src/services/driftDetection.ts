import { prisma } from "../db/prisma.js";

// Раздел 25: Drift Detection — не просто "мало задач сделано", а "задачи не связаны с целью".

export interface DriftResult {
  driftDetected: boolean;
  totalTasksCompleted: number;
  goalLinkedTasksCompleted: number;
  ratio: number;
  message: string | null;
}

const DRIFT_RATIO_THRESHOLD = 0.2; // если <20% выполненных задач связаны с целью — дрейф
const MIN_TASKS_FOR_SIGNAL = 8; // не делать выводы на малой выборке

// Вынесено в чистую функцию для тестируемости и переиспользования.
export function evaluateDrift(total: number, linked: number): { driftDetected: boolean; ratio: number } {
  const ratio = total > 0 ? linked / total : 0;
  const driftDetected = total >= MIN_TASKS_FOR_SIGNAL && ratio < DRIFT_RATIO_THRESHOLD;
  return { driftDetected, ratio: Math.round(ratio * 100) / 100 };
}

export async function detectDrift(userId: string, periodDays = 14): Promise<DriftResult> {
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const [total, linked] = await Promise.all([
    prisma.task.count({ where: { userId, status: "done", completedAt: { gte: since } } }),
    prisma.task.count({
      where: { userId, status: "done", completedAt: { gte: since }, goalId: { not: null } },
    }),
  ]);

  const { driftDetected, ratio } = evaluateDrift(total, linked);

  return {
    driftDetected,
    totalTasksCompleted: total,
    goalLinkedTasksCompleted: linked,
    ratio,
    message: driftDetected
      ? `Ты выполнил ${total} задач за ${periodDays} дней, но только ${linked} связаны с активными целями. ` +
        `Ты остаёшься продуктивным, но большая часть активности перестала приближать тебя к главной цели.`
      : null,
  };
}

// Раздел 30-31: Proactive AI не должен спамить — вызывается scheduler'ом,
// а не при каждом открытии приложения.
export async function maybeCreateDriftAlert(userId: string) {
  const drift = await detectDrift(userId);
  if (!drift.driftDetected) return null;

  // Не дублировать alert, если уже создавали за последние 7 дней
  const recentAlert = await prisma.aiAlert.findFirst({
    where: { userId, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, message: { contains: "дрейф" } },
  });
  if (recentAlert) return null;

  return prisma.aiAlert.create({
    data: { userId, message: `🟠 Обнаружен дрейф. ${drift.message}` },
  });
}

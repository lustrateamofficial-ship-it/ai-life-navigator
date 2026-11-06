import { prisma } from "../db/prisma.js";

// БАГ, найденный при аудите: поле Goal.progress (раздел 10 ТЗ — "Прогресс: 37%")
// нигде в кодовой базе не обновлялось, оставаясь равным 0 с момента создания цели
// навсегда. Это не только ломало сам экран "Цели", но и тихо занижало Direction
// Score (раздел 24): goalsScore на 60% строился на avgGoalProgress, которое всегда
// было нулевым для любой цели с хотя бы одним этапом.
//
// Логика: если у цели есть этапы — прогресс = доля этапов в статусе "completed".
// Если этапов нет — прогресс = доля выполненных задач, привязанных к цели напрямую.
// Если нет ни того, ни другого — прогресс не трогаем (остаётся 0, это честно).
//
// Чистая арифметика вынесена отдельно от похода в базу — так же, как evaluateDrift
// вынесена из detectDrift (services/driftDetection.ts) — чтобы покрыть её юнит-тестом
// без поднятия Prisma/Postgres (см. src/__tests__/goalProgress.test.ts).

export function calcProgressFromStages(stages: { status: string }[]): number {
  const completed = stages.filter((s) => s.status === "completed").length;
  return Math.round((completed / stages.length) * 100);
}

// null означает "не трогаем прогресс" — честное отсутствие данных, а не 0%.
export function calcProgressFromTasks(totalTasks: number, doneTasks: number): number | null {
  if (totalTasks === 0) return null;
  return Math.round((doneTasks / totalTasks) * 100);
}

export async function recalcGoalProgress(goalId: string): Promise<void> {
  const stages = await prisma.goalStage.findMany({ where: { goalId }, select: { status: true } });

  let progress: number | null;

  if (stages.length > 0) {
    progress = calcProgressFromStages(stages);
  } else {
    const [totalTasks, doneTasks] = await Promise.all([
      prisma.task.count({ where: { goalId } }),
      prisma.task.count({ where: { goalId, status: "done" } }),
    ]);
    progress = calcProgressFromTasks(totalTasks, doneTasks);
  }

  if (progress === null) return; // нет данных для прогресса — не трогаем

  await prisma.goal.update({ where: { id: goalId }, data: { progress } });
}

// Задача может быть привязана к этапу (stageId), а не напрямую к цели (goalId) —
// в этом случае нужно найти goalId через этап, чтобы пересчитать именно родительскую цель.
export async function recalcGoalProgressForTask(task: { goalId: string | null; stageId: string | null }) {
  if (task.goalId) {
    await recalcGoalProgress(task.goalId);
    return;
  }
  if (task.stageId) {
    const stage = await prisma.goalStage.findUnique({ where: { id: task.stageId }, select: { goalId: true } });
    if (stage) await recalcGoalProgress(stage.goalId);
  }
}

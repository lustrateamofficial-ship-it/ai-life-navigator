import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { recalcGoalProgressForTask } from "../services/goalProgress.js";
import { computeNextTrigger } from "../utils/reminderRecurrence.js";
import { localDateOnly } from "../utils/userTime.js";

export const tasksRouter = Router();

const taskSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  deadline: z.string().datetime().optional(),
  estimatedDurationMin: z.number().int().optional(),
  goalId: z.string().uuid().optional().nullable(),
  stageId: z.string().uuid().optional().nullable(),
  scheduledTime: z.string().datetime().optional(),
  status: z.enum(["todo", "in_progress", "done", "postponed", "cancelled"]).optional(),
  recurrence: z.enum(["daily", "weekly", "monthly"]).nullable().optional(),
});

// БАГ (найден при аудите, IDOR): раньше goalId/stageId принимались от клиента без
// проверки принадлежности текущему пользователю. Можно было привязать СВОЮ задачу
// к ЧУЖОЙ цели — и затем через GET /tasks (там include: { goal: { title } }) увидеть
// название чужой цели. Эта функция проверяет владение перед сохранением.
async function assertOwnedGoalAndStage(userId: string, goalId?: string | null, stageId?: string | null) {
  if (goalId) {
    const goal = await prisma.goal.findFirst({ where: { id: goalId, userId } });
    if (!goal) throw Object.assign(new Error("Goal not found"), { status: 400 });
  }
  if (stageId) {
    const stage = await prisma.goalStage.findFirst({ where: { id: stageId, goal: { userId } } });
    if (!stage) throw Object.assign(new Error("Stage not found"), { status: 400 });
    // БАГ (найден при независимом аудите): раньше goalId и stageId проверялись на
    // владение по отдельности, но не на то, что stageId реально принадлежит ИМЕННО
    // указанному goalId — а не какой-то другой цели того же пользователя. Можно было
    // создать задачу, формально привязанную к goalId="моя цель А" и stageId="этап
    // моей же цели Б" — бессмысленная, рассинхронизированная связка.
    if (goalId && stage.goalId !== goalId) {
      throw Object.assign(new Error("Stage does not belong to the given goal"), { status: 400 });
    }
  }
}

// GET /tasks?range=today|tomorrow|week|all|done
tasksRouter.get("/", async (req, res) => {
  const range = (req.query.range as string) ?? "today";
  // БАГ (найден при повторном аудите): "сегодня"/"завтра"/"неделя" считались по часовому
  // поясу сервера, а не пользователя (тот же класс бага, что чинил для веса/еды/привычек).
  const now = new Date();
  const startOfToday = localDateOnly(now, req.userTimezone ?? "UTC");
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const where: any = { userId: req.userId! };

  if (range === "today") {
    // БАГ (найден при аудите): раньше сюда попадали только задачи с явной
    // scheduledTime/deadline на сегодня. Но быстрое добавление (Tasks.tsx quickAdd,
    // бот naturalLanguageRouter) создаёт задачи БЕЗ даты вообще — такие задачи
    // никогда не показывались на главном экране "Сегодня", то есть основной
    // сценарий "быстро накидал дел — открыл Сегодня" был сломан. Теперь задачи
    // без даты тоже считаются "на сегодня" (как инбокс), пока их не запланируют иначе.
    where.OR = [
      { scheduledTime: { gte: startOfToday, lt: endOfToday } },
      { deadline: { gte: startOfToday, lt: endOfToday } },
      { AND: [{ scheduledTime: null }, { deadline: null }] },
    ];
    where.status = { not: "done" };
  } else if (range === "tomorrow") {
    const start = endOfToday;
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    where.OR = [{ scheduledTime: { gte: start, lt: end } }, { deadline: { gte: start, lt: end } }];
  } else if (range === "week") {
    const end = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
    where.OR = [{ scheduledTime: { gte: startOfToday, lt: end } }, { deadline: { gte: startOfToday, lt: end } }];
  } else if (range === "done") {
    where.status = "done";
  }
  // range === 'all' -> без доп. фильтра

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ priority: "desc" }, { scheduledTime: "asc" }],
    include: { goal: { select: { id: true, title: true } }, stage: { select: { id: true, title: true } } },
  });
  res.json(tasks);
});

// POST /tasks
tasksRouter.post("/", async (req, res) => {
  const parsed = taskSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    await assertOwnedGoalAndStage(req.userId!, parsed.data.goalId, parsed.data.stageId);
  } catch {
    return res.status(400).json({ error: "Указанная цель или этап не найдены" });
  }

  const task = await prisma.task.create({
    data: {
      userId: req.userId!,
      title: parsed.data.title,
      description: parsed.data.description,
      priority: parsed.data.priority,
      goalId: parsed.data.goalId ?? undefined,
      stageId: parsed.data.stageId ?? undefined,
      estimatedDurationMin: parsed.data.estimatedDurationMin,
      deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : undefined,
      scheduledTime: parsed.data.scheduledTime ? new Date(parsed.data.scheduledTime) : undefined,
      recurrence: parsed.data.recurrence ?? undefined,
    },
  });
  res.status(201).json(task);
});

// PUT /tasks/:id
tasksRouter.put("/:id", async (req, res) => {
  const existing = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const parsed = taskSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (parsed.data.goalId !== undefined || parsed.data.stageId !== undefined) {
    // БАГ (найден при аудите собственного же фикса выше): при частичном PUT, где
    // присылают только stageId БЕЗ goalId, parsed.data.goalId был бы undefined — проверка
    // "stage.goalId !== goalId" в assertOwnedGoalAndStage молча пропускалась бы, хотя
    // сверять нужно с уже сохранённым goalId задачи, а не с отсутствующим в запросе полем.
    const effectiveGoalId = parsed.data.goalId !== undefined ? parsed.data.goalId : existing.goalId;
    try {
      await assertOwnedGoalAndStage(req.userId!, effectiveGoalId, parsed.data.stageId);
    } catch {
      return res.status(400).json({ error: "Указанная цель или этап не найдены" });
    }
  }

  const data: any = { ...parsed.data };
  if (parsed.data.deadline) data.deadline = new Date(parsed.data.deadline);
  if (parsed.data.scheduledTime) data.scheduledTime = new Date(parsed.data.scheduledTime);

  if (parsed.data.status === "done" && existing.status !== "done") {
    data.completedAt = new Date();
  } else if (parsed.data.status && parsed.data.status !== "done" && existing.status === "done") {
    // БАГ (найден при аудите): при переключении задачи обратно из "done" в любой другой
    // статус completedAt раньше оставался от предыдущего выполнения — задача формально
    // "не выполнена", но с датой выполнения в прошлом. Эта дата нигде фатально не ломала
    // расчёты (они доп. фильтруют по status: "done"), но является мусорными данными,
    // которые могли сбить с толку при прямом просмотре БД или будущих отчётах.
    data.completedAt = null;
  }

  const task = await prisma.task.update({ where: { id: req.params.id }, data });

  // Повторяющаяся задача: когда её отмечают выполненной, появляется следующая. Срок считается от
  // прежнего срока (или от сегодняшнего дня, если срока не было) и всегда уходит в будущее.
  // Срабатывает только при переходе в «выполнена»: повторное сохранение второй копии не создаёт.
  if (parsed.data.status === "done" && existing.status !== "done" && existing.recurrence) {
    const base = existing.deadline ?? new Date();
    let next = computeNextTrigger(base, existing.recurrence);
    const now = new Date();
    let guard = 0;
    while (next <= now && guard++ < 1000) next = computeNextTrigger(next, existing.recurrence);
    await prisma.task.create({
      data: {
        userId: req.userId!,
        title: existing.title,
        description: existing.description,
        priority: existing.priority,
        goalId: existing.goalId,
        stageId: existing.stageId,
        estimatedDurationMin: existing.estimatedDurationMin,
        recurrence: existing.recurrence,
        deadline: next,
      },
    });
  }

  // Раздел 10/24: прогресс цели должен отражать реальное выполнение задач,
  // когда у цели нет этапов (см. services/goalProgress.ts).
  if (parsed.data.status && (task.goalId || task.stageId)) {
    await recalcGoalProgressForTask(task);
  }

  res.json(task);
});

// DELETE /tasks/:id
tasksRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  await prisma.task.delete({ where: { id: req.params.id } });

  // Удаление выполненной задачи тоже должно пересчитать прогресс цели (она больше не считается).
  if (existing.goalId || existing.stageId) {
    await recalcGoalProgressForTask(existing);
  }

  res.status(204).send();
});

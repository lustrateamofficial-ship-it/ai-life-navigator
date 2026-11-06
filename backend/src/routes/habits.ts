import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { localDateOnly } from "../utils/userTime.js";
import { calcStreakFromLogs, isHabitTargetReached } from "../services/habitStreak.js";

export const habitsRouter = Router();

const MAX_ACTIVE_HABITS = 2; // раздел 16 ТЗ: максимум 2 активные привычки одновременно

const habitSchema = z.object({
  title: z.string().min(1),
  targetDays: z.number().int().positive().optional(),
  reminderTime: z.string().optional(),
});

// GET /habits — банк + активные
habitsRouter.get("/", async (req, res) => {
  const habits = await prisma.habit.findMany({
    where: { userId: req.userId! },
    include: { logs: { orderBy: { date: "desc" }, take: 30 } },
    orderBy: { createdAt: "asc" },
  });
  res.json(habits);
});

// POST /habits — добавить в банк (не активирует автоматически)
habitsRouter.post("/", async (req, res) => {
  const parsed = habitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const habit = await prisma.habit.create({
    data: { userId: req.userId!, ...parsed.data, status: "in_bank" },
  });
  res.status(201).json(habit);
});

// DELETE /habits/:id — убрать привычку из банка (раньше такого эндпоинта не было).
habitsRouter.delete("/:id", async (req, res) => {
  const habit = await prisma.habit.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!habit) return res.status(404).json({ error: "Not found" });

  await prisma.habit.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// POST /habits/:id/activate — переносит из банка в активные, если есть свободный слот
habitsRouter.post("/:id/activate", async (req, res) => {
  const habit = await prisma.habit.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!habit) return res.status(404).json({ error: "Not found" });

  // БАГ (найден при аудите): раньше активировать можно было ЛЮБУЮ привычку, включая
  // уже активную или уже завершённую — повторный вызов на активной привычке незаметно
  // обнулял её streak и startedAt, а на завершённой — "воскрешал" её как активную заново.
  if (habit.status !== "in_bank") {
    return res.status(409).json({ error: "Эта привычка не в банке — её нельзя активировать повторно" });
  }

  const activeCount = await prisma.habit.count({ where: { userId: req.userId!, status: "active" } });
  if (activeCount >= MAX_ACTIVE_HABITS) {
    return res.status(409).json({ error: `Максимум ${MAX_ACTIVE_HABITS} активные привычки одновременно` });
  }

  const updated = await prisma.habit.update({
    where: { id: req.params.id },
    data: { status: "active", startedAt: new Date(), streak: 0 },
  });
  res.json(updated);
});

// POST /habits/:id/log — отметить выполнение за дату (раздел «Задачи» — natural input тоже сюда маппится)
habitsRouter.post("/:id/log", async (req, res) => {
  const habit = await prisma.habit.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!habit) return res.status(404).json({ error: "Not found" });

  // БАГ (найден при повторном аудите): этот роут пропустил фикс часового пояса, который
  // уже применён в health.ts (вес/еда) — "сегодня" здесь по-прежнему считалось по времени
  // сервера, а не пользователя (req.userTimezone, см. utils/userTime.ts). Для человека не
  // в UTC+0 отметка привычки поздно вечером могла уйти не в тот календарный день, что
  // напрямую искажает streak ниже (он считает подряд идущие КАЛЕНДАРНЫЕ дни).
  const date = req.body.date ? new Date(req.body.date) : new Date();
  const dateOnly = localDateOnly(date, req.userTimezone ?? "UTC");

  const log = await prisma.habitLog.upsert({
    where: { habitId_date: { habitId: habit.id, date: dateOnly } },
    update: { completed: req.body.completed ?? true },
    create: { habitId: habit.id, date: dateOnly, completed: req.body.completed ?? true },
  });

  // Чистая арифметика стрика вынесена в services/habitStreak.ts и покрыта юнит-тестами
  // (src/__tests__/habitStreak.test.ts) — здесь остаётся только выборка из базы.
  const logs = await prisma.habitLog.findMany({
    where: { habitId: habit.id, completed: true },
    orderBy: { date: "desc" },
  });
  const streak = calcStreakFromLogs(logs);
  const isDone = isHabitTargetReached(habit.startedAt, habit.targetDays);

  await prisma.habit.update({
    where: { id: habit.id },
    data: { streak, status: isDone ? "completed" : habit.status, completedAt: isDone ? new Date() : undefined },
  });

  res.json(log);
});

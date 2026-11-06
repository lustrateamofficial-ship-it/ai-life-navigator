import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { recalcGoalProgress } from "../services/goalProgress.js";

export const goalsRouter = Router();

const goalSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().optional(),
  reason: z.string().optional(),
  deadline: z.string().datetime().optional(),
});

const stageSchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().optional(),
  status: z.enum(["completed", "active", "planned", "blocked", "overdue"]).optional(),
  deadline: z.string().datetime().optional(),
  order: z.number().int().optional(),
});

// GET /goals — все цели пользователя со stages
goalsRouter.get("/", async (req, res) => {
  const goals = await prisma.goal.findMany({
    where: { userId: req.userId! },
    include: { stages: { orderBy: { order: "asc" } } },
    orderBy: { order: "asc" },
  });
  res.json(goals);
});

// POST /goals
goalsRouter.post("/", async (req, res) => {
  const parsed = goalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const goal = await prisma.goal.create({
    data: {
      userId: req.userId!,
      title: parsed.data.title,
      description: parsed.data.description,
      reason: parsed.data.reason,
      deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : undefined,
    },
  });
  res.status(201).json(goal);
});

// GET /goals/:id
goalsRouter.get("/:id", async (req, res) => {
  const goal = await prisma.goal.findFirst({
    where: { id: req.params.id, userId: req.userId! }, // user_id isolation
    include: { stages: { orderBy: { order: "asc" } }, tasks: true },
  });
  if (!goal) return res.status(404).json({ error: "Not found" });
  res.json(goal);
});

// PUT /goals/:id
goalsRouter.put("/:id", async (req, res) => {
  const parsed = goalSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existing = await prisma.goal.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const goal = await prisma.goal.update({
    where: { id: req.params.id },
    data: {
      ...parsed.data,
      deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : undefined,
    },
  });
  res.json(goal);
});

// DELETE /goals/:id
goalsRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.goal.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  await prisma.goal.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// GET /goals/:id/stages
goalsRouter.get("/:id/stages", async (req, res) => {
  const goal = await prisma.goal.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!goal) return res.status(404).json({ error: "Not found" });

  const stages = await prisma.goalStage.findMany({
    where: { goalId: req.params.id },
    orderBy: { order: "asc" },
  });
  res.json(stages);
});

// POST /goals/:id/stages
goalsRouter.post("/:id/stages", async (req, res) => {
  const goal = await prisma.goal.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!goal) return res.status(404).json({ error: "Not found" });

  const parsed = stageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const stage = await prisma.goalStage.create({
    data: {
      goalId: req.params.id,
      title: parsed.data.title,
      description: parsed.data.description,
      status: parsed.data.status,
      order: parsed.data.order ?? 0,
      deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : undefined,
    },
  });

  if (parsed.data.status) await recalcGoalProgress(req.params.id);

  res.status(201).json(stage);
});

// БАГ (найден при аудите): этого эндпоинта вообще не существовало — не было способа
// отметить этап выполненным через API, из-за чего Goal.progress никогда не считался
// (см. services/goalProgress.ts). Это главная причина, почему "Прогресс: 0%" висел
// на каждой цели постоянно, а Direction Score тихо занижался.
//
// PUT /goals/:goalId/stages/:stageId
goalsRouter.put("/:goalId/stages/:stageId", async (req, res) => {
  const goal = await prisma.goal.findFirst({ where: { id: req.params.goalId, userId: req.userId! } });
  if (!goal) return res.status(404).json({ error: "Not found" });

  const stage = await prisma.goalStage.findFirst({ where: { id: req.params.stageId, goalId: req.params.goalId } });
  if (!stage) return res.status(404).json({ error: "Not found" });

  const parsed = stageSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const data: any = { ...parsed.data };
  if (parsed.data.deadline) data.deadline = new Date(parsed.data.deadline);

  const updated = await prisma.goalStage.update({ where: { id: req.params.stageId }, data });

  if (parsed.data.status) await recalcGoalProgress(req.params.goalId);

  res.json(updated);
});

// DELETE /goals/:goalId/stages/:stageId
goalsRouter.delete("/:goalId/stages/:stageId", async (req, res) => {
  const goal = await prisma.goal.findFirst({ where: { id: req.params.goalId, userId: req.userId! } });
  if (!goal) return res.status(404).json({ error: "Not found" });

  const stage = await prisma.goalStage.findFirst({ where: { id: req.params.stageId, goalId: req.params.goalId } });
  if (!stage) return res.status(404).json({ error: "Not found" });

  await prisma.goalStage.delete({ where: { id: req.params.stageId } });
  await recalcGoalProgress(req.params.goalId);

  res.status(204).send();
});

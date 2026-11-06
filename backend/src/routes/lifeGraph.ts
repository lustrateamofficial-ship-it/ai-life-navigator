import { Router } from "express";
import { prisma } from "../db/prisma.js";

export const lifeGraphRouter = Router();

// Раздел 22: Life Graph — связи Mission → Goal → Stage → Task, а также
// Health ↕ Habits ↕ Schedule ↕ Goals. Мы НЕ храним граф отдельной таблицей —
// он целиком выводится из существующих связей (goalId, stageId и т.д.),
// поэтому не может рассинхронизироваться с реальными данными.

interface GraphNode {
  id: string;
  type: "mission" | "goal" | "stage" | "task" | "habit" | "health";
  label: string;
  meta?: Record<string, unknown>;
}

interface GraphEdge {
  from: string;
  to: string;
}

lifeGraphRouter.get("/", async (req, res) => {
  const userId = req.userId!;

  const [mission, goals, stages, tasks, habits, latestWeight] = await Promise.all([
    prisma.mission.findUnique({ where: { userId } }),
    prisma.goal.findMany({ where: { userId, status: "active" } }),
    prisma.goalStage.findMany({ where: { goal: { userId } } }),
    prisma.task.findMany({ where: { userId, status: { not: "done" } }, take: 50 }),
    prisma.habit.findMany({ where: { userId, status: "active" } }),
    prisma.weightLog.findFirst({ where: { userId }, orderBy: { date: "desc" } }),
  ]);

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  if (mission) {
    nodes.push({ id: "mission", type: "mission", label: mission.whatToAchieve ?? "Моя миссия" });
  }

  for (const g of goals) {
    nodes.push({ id: `goal:${g.id}`, type: "goal", label: g.title, meta: { progress: g.progress } });
    if (mission) edges.push({ from: "mission", to: `goal:${g.id}` });
  }

  for (const s of stages) {
    nodes.push({ id: `stage:${s.id}`, type: "stage", label: s.title, meta: { status: s.status } });
    edges.push({ from: `goal:${s.goalId}`, to: `stage:${s.id}` });
  }

  for (const t of tasks) {
    nodes.push({ id: `task:${t.id}`, type: "task", label: t.title, meta: { priority: t.priority } });
    if (t.stageId) edges.push({ from: `stage:${t.stageId}`, to: `task:${t.id}` });
    else if (t.goalId) edges.push({ from: `goal:${t.goalId}`, to: `task:${t.id}` });
  }

  // Раздел 22: Health ↕ Habits ↕ Schedule ↕ Goals — привычки и здоровье связаны
  // не через прямые FK, а через факт активности пользователя в один период,
  // поэтому эти узлы существуют отдельно, без edges к конкретным целям
  // (в отличие от Mission→Goal→Stage→Task, где связь — это реальный FK).
  for (const h of habits) {
    nodes.push({ id: `habit:${h.id}`, type: "habit", label: h.title, meta: { streak: h.streak } });
  }

  if (latestWeight) {
    nodes.push({
      id: "health:weight",
      type: "health",
      label: `Вес: ${latestWeight.weightKg} кг`,
    });
  }

  res.json({ nodes, edges });
});

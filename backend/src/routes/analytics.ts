import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { computeDirectionScore, saveDirectionScore } from "../services/directionScore.js";
import { detectDrift } from "../services/driftDetection.js";
import { computeTrends, saveDetectedTrends } from "../services/trendDetection.js";
import { saveCorrelations } from "../services/correlationEngine.js";
import { simulateFuture } from "../services/futureSimulation.js";
import { analyzePeriod } from "../services/ai/orchestrator.js";
import { isAiConfigured } from "../config/env.js";
import { monthBoundsInTimezone, weekStartInTimezone } from "../utils/userTime.js";

export const analyticsRouter = Router();
export const directionScoreRouter = Router();
export const trendsRouter = Router();
export const correlationsRouter = Router();
export const reportsRouter = Router();
export const simulationRouter = Router();

// GET /analytics — сводка для экрана "Аналитика"
analyticsRouter.get("/", async (req, res) => {
  const [score, drift, recentScores] = await Promise.all([
    computeDirectionScore(req.userId!),
    detectDrift(req.userId!),
    prisma.directionScore.findMany({ where: { userId: req.userId! }, orderBy: { date: "desc" }, take: 30 }),
  ]);
  res.json({ score, drift, history: recentScores });
});

// GET /direction-score — текущий + сохранить снимок на сегодня
directionScoreRouter.get("/", async (req, res) => {
  const saved = await saveDirectionScore(req.userId!);
  res.json(saved);
});

// GET /trends — раздел 27 "Куда я двигаюсь?" (реальный расчёт, не только сохранённые записи)
trendsRouter.get("/", async (req, res) => {
  const live = await computeTrends(req.userId!);
  res.json(live);
});

// POST /trends/snapshot — сохранить текущие тренды в историю (вызывается scheduler'ом)
trendsRouter.post("/snapshot", async (req, res) => {
  const saved = await saveDetectedTrends(req.userId!);
  res.json(saved);
});

// GET /correlations — раздел 23 Correlation Engine, пересчитывает и сохраняет на лету
correlationsRouter.get("/", async (req, res) => {
  const correlations = await saveCorrelations(req.userId!);
  res.json(correlations);
});

// GET /reports/weekly, /reports/monthly — раздел 34-35
reportsRouter.get("/:kind", async (req, res) => {
  const kind = req.params.kind;
  if (kind !== "weekly" && kind !== "monthly") return res.status(400).json({ error: "Unknown report kind" });

  if (!isAiConfigured()) {
    return res.status(503).json({ error: "AI временно недоступен. Основные функции продолжают работать." });
  }

  try {
    const result = await analyzePeriod(req.userId!, kind === "weekly" ? "week" : "month");

    // Начало периода считается по часовому поясу пользователя (а не сервера).
    const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { timezone: true } });
    const timezone = user?.timezone ?? "UTC";
    const periodStart = (
      kind === "weekly" ? weekStartInTimezone(new Date(), timezone) : monthBoundsInTimezone(new Date(), timezone).start
    )
      .toISOString()
      .slice(0, 10);

    if (kind === "weekly") {
      const saved = await prisma.weeklyReview.upsert({
        where: { userId_weekStart: { userId: req.userId!, weekStart: new Date(periodStart) } },
        update: { content: result as any },
        create: { userId: req.userId!, weekStart: new Date(periodStart), content: result as any },
      });
      return res.json(saved);
    } else {
      const saved = await prisma.monthlyReview.upsert({
        where: { userId_monthStart: { userId: req.userId!, monthStart: new Date(periodStart) } },
        update: { content: result as any },
        create: { userId: req.userId!, monthStart: new Date(periodStart), content: result as any },
      });
      return res.json(saved);
    }
  } catch (err) {
    console.error("[reports]", err);
    res.status(503).json({ error: "AI временно недоступен. Основные функции продолжают работать." });
  }
});

// GET /reports/weekly/history, /reports/monthly/history — прошлые отчёты
reportsRouter.get("/:kind/history", async (req, res) => {
  const kind = req.params.kind;
  if (kind === "weekly") {
    return res.json(
      await prisma.weeklyReview.findMany({ where: { userId: req.userId! }, orderBy: { weekStart: "desc" }, take: 12 })
    );
  }
  if (kind === "monthly") {
    return res.json(
      await prisma.monthlyReview.findMany({ where: { userId: req.userId! }, orderBy: { monthStart: "desc" }, take: 12 })
    );
  }
  res.status(400).json({ error: "Unknown report kind" });
});

// POST /simulation/future — раздел 28 Future Simulation
simulationRouter.post("/future", async (req, res) => {
  const scenario = req.body?.scenario === "extra_hours" ? "extra_hours" : "current_trajectory";
  const extraHoursPerWeek = req.body?.extraHoursPerWeek ? Number(req.body.extraHoursPerWeek) : undefined;

  const result = await simulateFuture(req.userId!, scenario, extraHoursPerWeek);
  res.json(result);
});

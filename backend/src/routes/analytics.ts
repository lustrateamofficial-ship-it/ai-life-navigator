import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { computeDirectionScore, saveDirectionScore } from "../services/directionScore.js";
import { detectDrift } from "../services/driftDetection.js";
import { computeTrends, saveDetectedTrends } from "../services/trendDetection.js";

export const analyticsRouter = Router();
export const directionScoreRouter = Router();
export const trendsRouter = Router();

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

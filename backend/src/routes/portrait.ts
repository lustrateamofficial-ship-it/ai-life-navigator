import { Router } from "express";
import { generateSelfPortrait, getLatestPortrait } from "../services/ai/selfPortrait.js";

export const portraitRouter = Router();

// GET /portrait — последний сохранённый портрет (или null, если ещё не генерировали)
portraitRouter.get("/", async (req, res) => {
  const portrait = await getLatestPortrait(req.userId!);
  res.json(portrait);
});

// POST /portrait/generate — пересчитать заново (дорогой вызов, под aiLimiter в index.ts)
portraitRouter.post("/generate", async (req, res) => {
  try {
    const result = await generateSelfPortrait(req.userId!);
    if (!result.possible) {
      return res.status(422).json({ error: result.reason });
    }
    res.status(201).json(result.content);
  } catch (err) {
    console.error("[portrait] generation failed:", err);
    res.status(503).json({ error: "AI временно недоступен. Основные функции продолжают работать." });
  }
});

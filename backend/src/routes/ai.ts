import { Router } from "express";
import { z } from "zod";
import { chat, nextBestAction, whyDidIStop, analyzePeriod } from "../services/ai/orchestrator.js";
import { isAiConfigured, isAnyAiConfigured } from "../config/env.js";

export const aiRouter = Router();

function aiUnavailableResponse(res: any) {
  // Раздел 48: "AI временно недоступен. Основные функции продолжают работать."
  return res.status(503).json({ error: "AI временно недоступен. Основные функции продолжают работать." });
}

aiRouter.post("/chat", async (req, res) => {
  // БАГ (найден при аудите): раньше гейтилось только Anthropic-ключом, хотя chat()
  // внутри идёт через слой [2] (роутер/специалист) — Gemini → Groq → Anthropic.
  // С isAiConfigured() человек, настроивший только бесплатные Gemini+Groq без
  // Anthropic, получал бы здесь 503, хотя чат прекрасно работал бы через них.
  if (!isAnyAiConfigured()) return aiUnavailableResponse(res);

  const parsed = z.object({ message: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const reply = await chat(req.userId!, parsed.data.message);
    res.json({ reply });
  } catch (err) {
    console.error("[ai/chat]", err);
    aiUnavailableResponse(res);
  }
});

aiRouter.post("/next-action", async (req, res) => {
  try {
    // nextBestAction сам умеет работать в облегчённом режиме без AI-ключа (раздел 8).
    const result = await nextBestAction(req.userId!, req.body?.availableMinutes);
    res.json(result);
  } catch (err) {
    console.error("[ai/next-action]", err);
    aiUnavailableResponse(res);
  }
});

// POST /ai/analyze — { kind: "why_stopped" | "weekly" | "monthly" }
// Здесь isAiConfigured() (не isAnyAiConfigured()) — осознанно: и whyDidIStop(),
// и analyzePeriod() внутри идут через verifier-слой, который всегда на Anthropic.
aiRouter.post("/analyze", async (req, res) => {
  if (!isAiConfigured()) return aiUnavailableResponse(res);

  const kind = req.body?.kind;
  try {
    if (kind === "why_stopped") {
      const answer = await whyDidIStop(req.userId!);
      return res.json({ answer });
    }
    if (kind === "weekly" || kind === "monthly") {
      const result = await analyzePeriod(req.userId!, kind === "weekly" ? "week" : "month");
      return res.json(result);
    }
    res.status(400).json({ error: "Unknown analysis kind" });
  } catch (err) {
    console.error("[ai/analyze]", err);
    aiUnavailableResponse(res);
  }
});

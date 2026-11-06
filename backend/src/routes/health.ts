import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { parseFoodText } from "../services/ai/orchestrator.js";
import { localDateOnly } from "../utils/userTime.js";

export const healthRouter = Router();

// ── WEIGHT (раздел 14) ──────────────────────────────

const weightSchema = z.object({
  date: z.string().datetime().optional(),
  weightKg: z.number().positive().max(500),
});

healthRouter.get("/weight", async (req, res) => {
  const logs = await prisma.weightLog.findMany({
    where: { userId: req.userId! },
    orderBy: { date: "desc" },
    take: 90,
  });

  // Скользящие средние — раздел 14: "AI не должен реагировать на единичное изменение"
  const avg = (n: number) => {
    const slice = logs.slice(0, n);
    if (slice.length === 0) return null;
    return slice.reduce((sum, l) => sum + l.weightKg, 0) / slice.length;
  };

  res.json({
    logs,
    current: logs[0]?.weightKg ?? null,
    changeSinceYesterday: logs.length >= 2 ? logs[0].weightKg - logs[1].weightKg : null,
    avg7d: avg(7),
    avg30d: avg(30),
  });
});

healthRouter.post("/weight", async (req, res) => {
  const parsed = weightSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const date = parsed.data.date ? new Date(parsed.data.date) : new Date();
  // БАГ (найден при аудите): раньше "сегодня" считалось по часовому поясу сервера —
  // теперь по часовому поясу пользователя (req.userTimezone, выставлен в middleware/auth.ts).
  const dateOnly = localDateOnly(date, req.userTimezone ?? "UTC");

  const log = await prisma.weightLog.upsert({
    where: { userId_date: { userId: req.userId!, date: dateOnly } },
    update: { weightKg: parsed.data.weightKg },
    create: { userId: req.userId!, date: dateOnly, weightKg: parsed.data.weightKg },
  });
  res.status(201).json(log);
});

// ── FOOD (раздел 15) ──────────────────────────────

const foodTextSchema = z.object({
  text: z.string().min(1), // "250 г курицы + 200 г риса"
  date: z.string().datetime().optional(),
});

healthRouter.get("/food", async (req, res) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const dateOnly = localDateOnly(date, req.userTimezone ?? "UTC"); // см. utils/userTime.ts
  const nextDay = new Date(dateOnly.getTime() + 24 * 60 * 60 * 1000);

  const logs = await prisma.foodLog.findMany({
    where: { userId: req.userId!, date: { gte: dateOnly, lt: nextDay } },
    include: { entries: true },
  });

  const totals = logs.reduce(
    (acc, log) => {
      for (const e of log.entries) {
        acc.calories += e.calories;
        acc.protein += e.proteinG;
        acc.fat += e.fatG;
        acc.carbs += e.carbsG;
      }
      return acc;
    },
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  );

  res.json({ logs, totals });
});

// POST /health/food — natural language, AI распознаёт продукты (раздел 15)
healthRouter.post("/food", async (req, res) => {
  const parsed = foodTextSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // AI используется ТОЛЬКО для распознавания/классификации, расчёты — обычным кодом.
  const items = await parseFoodText(parsed.data.text);

  const date = parsed.data.date ? new Date(parsed.data.date) : new Date();
  const dateOnly = localDateOnly(date, req.userTimezone ?? "UTC"); // см. utils/userTime.ts

  const foodLog = await prisma.foodLog.create({
    data: {
      userId: req.userId!,
      date: dateOnly,
      rawInput: parsed.data.text,
      entries: {
        create: items.map((item) => ({
          nameOverride: item.name,
          grams: item.grams,
          calories: item.calories,
          proteinG: item.proteinG,
          fatG: item.fatG,
          carbsG: item.carbsG,
        })),
      },
    },
    include: { entries: true },
  });

  res.status(201).json(foodLog);
});

// PUT /health/food/entry/:id — ручная корректировка позиции (раздел 15: "пользователь может исправить")
healthRouter.put("/food/entry/:id", async (req, res) => {
  const entry = await prisma.foodLogEntry.findFirst({
    where: { id: req.params.id, foodLog: { userId: req.userId! } },
  });
  if (!entry) return res.status(404).json({ error: "Not found" });

  const updated = await prisma.foodLogEntry.update({
    where: { id: req.params.id },
    data: {
      nameOverride: req.body.name ?? undefined,
      grams: req.body.grams ?? undefined,
      calories: req.body.calories ?? undefined,
      proteinG: req.body.proteinG ?? undefined,
      fatG: req.body.fatG ?? undefined,
      carbsG: req.body.carbsG ?? undefined,
    },
  });
  res.json(updated);
});

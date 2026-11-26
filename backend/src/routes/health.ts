import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
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

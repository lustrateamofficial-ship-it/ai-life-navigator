import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { localDateOnly } from "../utils/userTime.js";
import { getUserTimezone } from "../services/journalService.js";

export const moodRouter = Router();

// PUT /mood — отметить настроение сегодняшнего дня одним нажатием («Хорошо / Нормально / Плохо»).
// rating: null снимает отметку (повторное нажатие на выбранный вариант). Пишется в ту же таблицу
// DailyCheckin, что и вечерний вопрос бота, поэтому обе отметки — это одна и та же оценка дня.
moodRouter.put("/", async (req, res) => {
  const parsed = z.object({ rating: z.enum(["good", "normal", "bad"]).nullable() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const userId = req.userId!;
  const date = localDateOnly(new Date(), await getUserTimezone(userId));
  const saved = await prisma.dailyCheckin.upsert({
    where: { userId_date: { userId, date } },
    update: { rating: parsed.data.rating },
    create: { userId, date, rating: parsed.data.rating },
  });
  res.json({ rating: saved.rating });
});

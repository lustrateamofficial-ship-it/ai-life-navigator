import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";

export const calendarRouter = Router();

const eventSchema = z.object({
  title: z.string().trim().min(1).max(500),
  category: z.enum(["work", "training", "meeting", "personal", "sleep", "free_time"]).optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  recurrenceRule: z.string().optional(),
});

// БАГ (найден при независимом аудите): query-параметры from/to раньше шли в new Date(...)
// без проверки — мусорная строка превращалась в Invalid Date, которая долетала до Prisma
// и падала там необработанным исключением (generic 500 вместо понятной ошибки 400).
function parseQueryDate(value: unknown, fallback: Date): { date: Date; error?: string } {
  if (!value) return { date: fallback };
  const d = new Date(value as string);
  if (isNaN(d.getTime())) return { date: fallback, error: `Некорректная дата: "${value}"` };
  return { date: d };
}

// Раздел "функциональные пробелы UI": раньше пересечение с другим событием никак не
// отслеживалось — можно было молча создать событие поверх другого. Решение — ПРЕДУПРЕЖДАТЬ,
// а не блокировать (DESIGN_PRINCIPLES.md: "прощающий, а не гиперзаботливый" интерфейс):
// пересекающиеся события — не всегда ошибка (например, напоминание внутри рабочего блока),
// так что создание/сохранение всё равно проходит, а warning — просто информация для пользователя.
async function findOverlapping(userId: string, startTime: Date, endTime: Date, excludeId?: string) {
  return prisma.calendarEvent.findMany({
    where: {
      userId,
      id: excludeId ? { not: excludeId } : undefined,
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
    select: { id: true, title: true, startTime: true, endTime: true },
  });
}

function overlapWarning(overlapping: { title: string }[]): string | undefined {
  if (overlapping.length === 0) return undefined;
  const names = overlapping.map((e) => `«${e.title}»`).join(", ");
  return `Пересекается по времени с: ${names}`;
}

// GET /calendar?from=...&to=...
calendarRouter.get("/", async (req, res) => {
  const fromResult = parseQueryDate(req.query.from, new Date());
  if (fromResult.error) return res.status(400).json({ error: fromResult.error });
  const from = fromResult.date;

  const toResult = parseQueryDate(req.query.to, new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000));
  if (toResult.error) return res.status(400).json({ error: toResult.error });
  const to = toResult.date;

  const events = await prisma.calendarEvent.findMany({
    where: { userId: req.userId!, startTime: { gte: from, lte: to } },
    orderBy: { startTime: "asc" },
  });
  res.json(events);
});

calendarRouter.post("/", async (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // БАГ (найден при независимом аудите): нигде не проверялось, что endTime позже
  // startTime — можно было создать событие, которое заканчивается раньше, чем начинается.
  if (new Date(parsed.data.endTime) <= new Date(parsed.data.startTime)) {
    return res.status(400).json({ error: "Время окончания должно быть позже времени начала" });
  }

  const startTime = new Date(parsed.data.startTime);
  const endTime = new Date(parsed.data.endTime);

  const event = await prisma.calendarEvent.create({
    data: {
      userId: req.userId!,
      title: parsed.data.title,
      category: parsed.data.category,
      startTime,
      endTime,
      recurrenceRule: parsed.data.recurrenceRule,
    },
  });

  const overlapping = await findOverlapping(req.userId!, startTime, endTime, event.id);
  res.status(201).json({ ...event, warning: overlapWarning(overlapping) });
});

calendarRouter.put("/:id", async (req, res) => {
  const existing = await prisma.calendarEvent.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const parsed = eventSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const data: any = { ...parsed.data };
  if (parsed.data.startTime) data.startTime = new Date(parsed.data.startTime);
  if (parsed.data.endTime) data.endTime = new Date(parsed.data.endTime);

  // БАГ (найден при независимом аудите): та же проверка, что в POST, но здесь нужно
  // учитывать частичное обновление — если прислали только одно из двух полей, сверяем
  // его с уже сохранённым значением второго, а не считаем проверку пройденной просто
  // потому что оба поля "не пришли одновременно".
  const effectiveStart = data.startTime ?? existing.startTime;
  const effectiveEnd = data.endTime ?? existing.endTime;
  if (effectiveEnd <= effectiveStart) {
    return res.status(400).json({ error: "Время окончания должно быть позже времени начала" });
  }

  const event = await prisma.calendarEvent.update({ where: { id: req.params.id }, data });

  const overlapping = await findOverlapping(req.userId!, effectiveStart, effectiveEnd, event.id);
  res.json({ ...event, warning: overlapWarning(overlapping) });
});

calendarRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.calendarEvent.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  await prisma.calendarEvent.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

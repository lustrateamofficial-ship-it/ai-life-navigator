import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { isAnyAiConfigured } from "../config/env.js";
import { buildHomeFocus } from "../services/homeFocus.js";
import { detectCrisis } from "../services/distressDetection.js";
import { verifyObservation, verifyWeekSummary, verifyGoalSuggestions } from "../services/journalObservation.js";
import { generateRouterOrSpecialistJson } from "../services/ai/textGeneration.js";
import { localDateOnly } from "../utils/userTime.js";

export const homeRouter = Router();

// GET /home — что полезно сейчас. Только данные пользователя и простые правила, без AI.
homeRouter.get("/", async (req, res) => {
  const userId = req.userId!;
  const now = new Date();
  const [user, tasks, reminders, lastEntry] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
    prisma.task.findMany({
      where: { userId, status: { notIn: ["done", "cancelled"] } },
      select: { id: true, title: true, priority: true, status: true, deadline: true, scheduledTime: true },
      take: 200,
    }),
    prisma.reminder.findMany({
      where: { userId, active: true, triggerAt: { gt: now } },
      select: { title: true, triggerAt: true },
      orderBy: { triggerAt: "asc" },
      take: 20,
    }),
    prisma.journalEntry.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);

  const timezone = user?.timezone ?? "UTC";
  const checkin = await prisma.dailyCheckin.findUnique({
    where: { userId_date: { userId, date: localDateOnly(now, timezone) } },
    select: { rating: true },
  });
  const mood = checkin?.rating === "good" || checkin?.rating === "normal" || checkin?.rating === "bad" ? checkin.rating : null;

  res.json({
    ...buildHomeFocus({ tasks, reminders, lastJournalAt: lastEntry?.createdAt ?? null, now, timezone }),
    mood,
  });
});

const MIN_ENTRIES = 3;
const MAX_ENTRIES = 20;
const ENTRY_CHARS = 600;

// Записи, которые можно показывать внешней модели: не личные и не о тяжёлом состоянии.
async function loadUsableEntries(userId: string, windowDays: number, max = MAX_ENTRIES): Promise<string[]> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.journalEntry.findMany({
    where: { userId, isPrivate: false, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: max,
    select: { content: true },
  });
  return rows.filter((e) => !detectCrisis(e.content)).map((e) => e.content.slice(0, ENTRY_CHARS));
}

function notEnough(count: number, windowLabel: string) {
  return `Нужно хотя бы ${MIN_ENTRIES} записи за ${windowLabel} (подходящих сейчас: ${count}). Личные записи не учитываются.`;
}

const NO_AI = { reason: "AI не настроен на сервере." };
const NO_RESULT = "Ничего определённого по записям пока не видно.";
const FAILED = "Не получилось сейчас. Попробуй позже.";

// POST /home/observation — одно осторожное наблюдение по недавним записям, по кнопке.
// Наблюдение принимается, лишь если цитата из него дословно найдена в записях.
homeRouter.post("/observation", async (req, res) => {
  if (!isAnyAiConfigured()) return res.json({ observation: null, ...NO_AI });

  const entries = await loadUsableEntries(req.userId!, 30);
  if (entries.length < MIN_ENTRIES) return res.json({ observation: null, reason: notEnough(entries.length, "последний месяц") });

  try {
    const raw = await generateRouterOrSpecialistJson<unknown>({
      system:
        "Ты читаешь недавние записи личного дневника и находишь ОДНО осторожное наблюдение, которое " +
        "может быть человеку полезно: повторяющаяся тема, то, что он сам не раз называл важным, " +
        "или расхождение между сказанным и сделанным. Ты не психолог: не ставь диагнозов, не используй " +
        "клинические термины, не давай оценок личности, не утверждай причины. Формулируй мягко " +
        '(«в нескольких записях ты пишешь...»), на русском, не длиннее двух предложений. ' +
        "ОБЯЗАТЕЛЬНО приложи дословную цитату из одной записи (до 15 слов), на которой основано " +
        "наблюдение. Если ничего определённого не видно, верни {\"observation\": null}. " +
        'Формат JSON: {"observation": string|null, "quote": string}.',
      prompt: entries.map((e, i) => `Запись ${i + 1}:\n${e}`).join("\n\n"),
    });
    const verified = verifyObservation(raw, entries);
    res.json(verified ?? { observation: null, reason: NO_RESULT });
  } catch (err) {
    console.error("[home] observation failed:", err);
    res.json({ observation: null, reason: FAILED });
  }
});

// POST /home/week-summary — итоги последних 7 дней по записям дневника. Показываются только те
// пункты, у которых цитата дословно найдена в записях; без хотя бы одного такого пункта — не показываются.
homeRouter.post("/week-summary", async (req, res) => {
  if (!isAnyAiConfigured()) return res.json({ summary: null, ...NO_AI });

  // period: "week" (по умолчанию) или "month": окно 30 дней и больше записей.
  const month = (req.body as { period?: string } | undefined)?.period === "month";
  const entries = await loadUsableEntries(req.userId!, month ? 30 : 7, month ? 40 : MAX_ENTRIES);
  if (entries.length < MIN_ENTRIES) return res.json({ summary: null, reason: notEnough(entries.length, month ? "последний месяц" : "последнюю неделю") });

  try {
    const raw = await generateRouterOrSpecialistJson<unknown>({
      system:
        `Ты помогаешь человеку подвести итоги ${month ? "месяца" : "недели"} по его дневнику. Опирайся ТОЛЬКО на то, что он написал. ` +
        "Не ставь диагнозов, не используй клинические термины, не оценивай личность и не называй причин. " +
        "Верни краткий итог в 1–2 предложениях (поле summary) и от 1 до 4 пунктов highlights: что повторялось, " +
        "что получилось, что осталось незавершённым. У КАЖДОГО пункта должна быть дословная цитата из записи " +
        '(до 15 слов). Пиши по-русски, мягко. Формат JSON: {"summary": string, "highlights": [{"text": string, "quote": string}]}.',
      prompt: entries.map((e, i) => `Запись ${i + 1}:\n${e}`).join("\n\n"),
    });
    const verified = verifyWeekSummary(raw, entries);
    res.json(verified ?? { summary: null, reason: NO_RESULT });
  } catch (err) {
    console.error("[home] week-summary failed:", err);
    res.json({ summary: null, reason: FAILED });
  }
});

// POST /home/goal-suggestions — до трёх целей, которые человек сам не раз упоминал в записях.
// Цель создаётся только по нажатию «Сделать целью» (обычный POST /goals), ничего не создаётся само.
homeRouter.post("/goal-suggestions", async (req, res) => {
  if (!isAnyAiConfigured()) return res.json({ suggestions: [], ...NO_AI });

  const userId = req.userId!;
  const entries = await loadUsableEntries(userId, 30);
  if (entries.length < MIN_ENTRIES) return res.json({ suggestions: [], reason: notEnough(entries.length, "последний месяц") });

  const goals = await prisma.goal.findMany({ where: { userId }, select: { title: true }, take: 50 });

  try {
    const raw = await generateRouterOrSpecialistJson<unknown>({
      system:
        "Ты читаешь записи личного дневника и предлагаешь до трёх возможных ЦЕЛЕЙ, о которых человек сам " +
        "писал не один раз или явно назвал важными. Не придумывай целей, которых в записях нет. " +
        "Не ставь диагнозов, не используй клинические термины. title — короткое название цели (до 8 слов, по-русски), " +
        "why — одно предложение, почему это видно из записей. quote — дословная цитата из записи (до 15 слов). " +
        `Уже существующие цели не предлагай: ${JSON.stringify(goals.map((g) => g.title))}. ` +
        'Формат JSON: {"suggestions": [{"title": string, "why": string, "quote": string}]}. Если ничего не видно, верни {"suggestions": []}.',
      prompt: entries.map((e, i) => `Запись ${i + 1}:\n${e}`).join("\n\n"),
    });
    const suggestions = verifyGoalSuggestions(raw, entries, goals.map((g) => g.title));
    res.json(suggestions.length > 0 ? { suggestions } : { suggestions: [], reason: NO_RESULT });
  } catch (err) {
    console.error("[home] goal-suggestions failed:", err);
    res.json({ suggestions: [], reason: FAILED });
  }
});

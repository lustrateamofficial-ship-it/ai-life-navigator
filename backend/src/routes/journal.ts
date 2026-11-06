import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { proposeFromJournal } from "../services/ai/orchestrator.js";
import { isAnyAiConfigured } from "../config/env.js";
import { detectCrisis } from "../services/distressDetection.js";
import { EMPTY_PROPOSALS } from "../services/journalExtraction.js";
import { createJournalEntry, applyProposals, applySchema, getUserTimezone } from "../services/journalService.js";

export const journalRouter = Router();

const PAGE_DEFAULT = 30;
const PAGE_MAX = 100;

// GET /journal?q=слово&before=<ISO>&limit=30 — записи дневника, новые первыми.
//  q      — поиск по тексту (без учёта регистра), не короче двух символов;
//  before — вернуть только записи старше этой даты (для «Показать ещё»);
//  after  — только записи не старше этой даты (фильтр «30 дней», «Год»);
//  principles — личные принципы приходят отдельным списком и не зависят от страницы.
journalRouter.get("/", async (req, res) => {
  const parsed = z
    .object({
      q: z.string().trim().min(2).max(100).optional(),
      before: z.string().datetime().optional(),
      after: z.string().datetime().optional(),
      limit: z.coerce.number().int().min(1).max(PAGE_MAX).default(PAGE_DEFAULT),
    })
    .safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { q, before, after, limit } = parsed.data;
  const userId = req.userId!;

  const rows = await prisma.journalEntry.findMany({
    where: {
      userId,
      ...(q ? { content: { contains: q, mode: "insensitive" as const } } : {}),
      ...(before || after ? { createdAt: { ...(before ? { lt: new Date(before) } : {}), ...(after ? { gte: new Date(after) } : {}) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    include: { extractedPrinciples: { select: { id: true, content: true } } },
  });
  const hasMore = rows.length > limit;

  const principles = before || q
    ? []
    : await prisma.memoryItem.findMany({
        where: { userId, type: "principle" },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { id: true, content: true },
      });

  res.json({ entries: rows.slice(0, limit), hasMore, principles });
});

// POST /journal — новая запись. Если AI настроен, из текста извлекаются устойчивые
// принципы ("категоричность — признак слабого ума") и сохраняются отдельно как
// MemoryItem(type=principle) — они дальше ВСЕГДА попадают в контекст AI (см. contextBuilder).
// private: true — личная запись, которую нельзя отправлять во внешние AI-сервисы.
journalRouter.post("/", async (req, res) => {
  const parsed = z.object({ content: z.string().trim().min(1).max(20000), private: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { entry, principles, support } = await createJournalEntry(req.userId!, parsed.data.content, {
    private: parsed.data.private,
  });
  res.status(201).json({ ...entry, extractedPrinciples: principles, support });
});

// PUT /journal/:id — исправить текст записи. Осознанно НЕ перезапускаем извлечение принципов:
// это означало бы удалить уже сохранённые MemoryItem(type=principle), которые могли попасть в
// контекст AI-разговоров и Портрет. Правка опечатки не должна тихо стирать то, что AI уже
// "запомнил". Изменить сами принципы можно через /memory/:id.
journalRouter.put("/:id", async (req, res) => {
  const existing = await prisma.journalEntry.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const parsed = z.object({ content: z.string().trim().min(1).max(20000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const updated = await prisma.journalEntry.update({
    where: { id: req.params.id },
    data: { content: parsed.data.content },
    include: { extractedPrinciples: { select: { id: true, content: true } } },
  });
  res.json(updated);
});

journalRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.journalEntry.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  // Принципы, извлечённые из этой записи, тоже удаляются (onDelete: SetNull в схеме
  // отвязал бы их, но раз запись стирается целиком — стираем и связанные принципы явно).
  await prisma.memoryItem.deleteMany({ where: { sourceJournalEntryId: req.params.id } });
  await prisma.journalEntry.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// POST /journal/:id/analyze — предложить, что из записи можно превратить в задачи, напоминания,
// траты и т.д. НИЧЕГО не создаёт. Текст берётся из сохранённой записи, а не от клиента.
journalRouter.post("/:id/analyze", async (req, res) => {
  const entry = await prisma.journalEntry.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!entry) return res.status(404).json({ error: "Not found" });

  // Условия «не отправлять в AI» проверяются здесь, на сервере, а не только в интерфейсе.
  if (entry.isPrivate || detectCrisis(entry.content)) {
    return res.json({ aiAvailable: isAnyAiConfigured(), proposals: { ...EMPTY_PROPOSALS } });
  }

  const proposals = await proposeFromJournal(entry.content, await getUserTimezone(req.userId!));
  res.json({ aiAvailable: isAnyAiConfigured(), proposals });
});

// POST /journal/:id/apply — создать подтверждённое (см. services/journalService.ts).
journalRouter.post("/:id/apply", async (req, res) => {
  const entry = await prisma.journalEntry.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!entry) return res.status(404).json({ error: "Not found" });

  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const created = await applyProposals(req.userId!, await getUserTimezone(req.userId!), parsed.data);
  res.status(201).json({ created });
});

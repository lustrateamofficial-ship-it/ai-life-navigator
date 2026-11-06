import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { embedMemoryItem, semanticSearchMemory } from "../services/ai/semanticMemory.js";

export const memoryRouter = Router();

// GET /memory — «Что ты знаешь обо мне?» (раздел 21)
memoryRouter.get("/", async (req, res) => {
  const type = req.query.type as string | undefined;
  res.json(
    await prisma.memoryItem.findMany({
      where: { userId: req.userId!, ...(type ? { type: type as any } : {}) },
      orderBy: { createdAt: "desc" },
    })
  );
});

// GET /memory/search?q=... — раздел 37: Semantic Memory, top-K релевантных фактов.
// Регистрируем ДО /:id-подобных роутов не требуется (их тут нет), но ставим выше
// на случай будущих /memory/:id — чтобы "search" не воспринимался как id.
memoryRouter.get("/search", async (req, res) => {
  const q = (req.query.q as string) ?? "";
  if (!q.trim()) return res.json([]);

  const results = await semanticSearchMemory(req.userId!, q, 10);
  res.json(results);
});

// POST /memory — «Запомни, что...»
memoryRouter.post("/", async (req, res) => {
  // БАГ (найден при аудите): при добавлении дневника в MemoryType появился тип "principle"
  // (см. schema.prisma), но этот zod-enum не обновили — напрямую через общий /memory
  // создать принцип было невозможно (только косвенно, через извлечение из дневника).
  const parsed = z
    .object({
      type: z.enum(["fact", "goal_context", "history", "observation", "principle"]),
      content: z.string().trim().min(1).max(5000),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const item = await prisma.memoryItem.create({ data: { userId: req.userId!, ...parsed.data } });

  // Раздел 37: генерируем embedding для Semantic Memory. Не блокируем ответ пользователю
  // на этом шаге дольше, чем нужно, но и не отправляем ответ до завершения — величина
  // задержки здесь пренебрежимо мала по сравнению с полноценным AI-вызовом.
  await embedMemoryItem(item.id, item.content);

  res.status(201).json(item);
});

memoryRouter.put("/:id", async (req, res) => {
  const existing = await prisma.memoryItem.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const parsed = z.object({ content: z.string().trim().min(1).max(5000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const updated = await prisma.memoryItem.update({ where: { id: req.params.id }, data: parsed.data });

  // Контент изменился — переиндексируем embedding, иначе semantic search будет искать
  // по устаревшему тексту.
  await embedMemoryItem(updated.id, updated.content);

  res.json(updated);
});

memoryRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.memoryItem.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  await prisma.memoryItem.delete({ where: { id: req.params.id } }); // embedding удалится каскадно (onDelete: Cascade в схеме)
  res.status(204).send();
});

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";

export const ideasRouter = Router();

// БАГ (найден при независимом аудите, IDOR-класс): linkedGoalId — обычная строка в схеме
// (нет настоящей FK-связи), и раньше проверялся только на формат UUID, но не на
// принадлежность текущему пользователю и даже не на существование. Можно было привязать
// идею к чужому goalId.
async function assertOwnedGoal(userId: string, goalId?: string | null) {
  if (!goalId) return;
  const goal = await prisma.goal.findFirst({ where: { id: goalId, userId } });
  if (!goal) throw Object.assign(new Error("Goal not found"), { status: 400 });
}

ideasRouter.get("/", async (req, res) => {
  const search = req.query.q as string | undefined;
  res.json(
    await prisma.idea.findMany({
      where: {
        userId: req.userId!,
        ...(search ? { content: { contains: search, mode: "insensitive" } } : {}),
      },
      orderBy: { createdAt: "desc" },
    })
  );
});

ideasRouter.post("/", async (req, res) => {
  const parsed = z.object({ content: z.string().trim().min(1).max(5000), linkedGoalId: z.string().uuid().optional() }).safeParse(
    req.body
  );
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    await assertOwnedGoal(req.userId!, parsed.data.linkedGoalId);
  } catch {
    return res.status(400).json({ error: "Указанная цель не найдена" });
  }

  const idea = await prisma.idea.create({ data: { userId: req.userId!, ...parsed.data } });
  res.status(201).json(idea);
});

ideasRouter.put("/:id", async (req, res) => {
  const existing = await prisma.idea.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const parsed = z.object({ content: z.string().trim().min(1).max(5000).optional(), linkedGoalId: z.string().uuid().optional() }).safeParse(
    req.body
  );
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    await assertOwnedGoal(req.userId!, parsed.data.linkedGoalId);
  } catch {
    return res.status(400).json({ error: "Указанная цель не найдена" });
  }

  res.json(await prisma.idea.update({ where: { id: req.params.id }, data: parsed.data }));
});

ideasRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.idea.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  await prisma.idea.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

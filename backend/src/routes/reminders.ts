import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";

export const remindersRouter = Router();

const reminderSchema = z.object({
  title: z.string().trim().min(1).max(500),
  triggerAt: z.string().datetime(),
  recurrence: z.enum(["once", "daily", "weekdays", "weekends", "weekly", "monthly"]).optional(),
});

remindersRouter.get("/", async (req, res) => {
  res.json(
    await prisma.reminder.findMany({
      where: { userId: req.userId!, active: true },
      orderBy: { triggerAt: "asc" },
    })
  );
});

remindersRouter.post("/", async (req, res) => {
  const parsed = reminderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const reminder = await prisma.reminder.create({
    data: {
      userId: req.userId!,
      title: parsed.data.title,
      triggerAt: new Date(parsed.data.triggerAt),
      recurrence: parsed.data.recurrence,
    },
  });
  res.status(201).json(reminder);
});

remindersRouter.put("/:id", async (req, res) => {
  const existing = await prisma.reminder.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const parsed = reminderSchema.partial().extend({ active: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const data: any = { ...parsed.data };
  if (parsed.data.triggerAt) data.triggerAt = new Date(parsed.data.triggerAt);

  res.json(await prisma.reminder.update({ where: { id: req.params.id }, data }));
});

remindersRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.reminder.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  await prisma.reminder.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";

export const missionRouter = Router();

const missionSchema = z.object({
  desiredLife: z.string().optional(),
  whatToAchieve: z.string().optional(),
  whyImportant: z.string().optional(),
  whatToAvoid: z.string().optional(),
  whoToBecome: z.string().optional(),
  successDefinition: z.string().optional(),
});

// GET /mission — текущая миссия пользователя
missionRouter.get("/", async (req, res) => {
  const mission = await prisma.mission.findUnique({ where: { userId: req.userId! } });
  res.json(mission);
});

// PUT /mission — создать или обновить (раздел 9 ТЗ)
missionRouter.put("/", async (req, res) => {
  const parsed = missionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const mission = await prisma.mission.upsert({
    where: { userId: req.userId! },
    update: parsed.data,
    create: { userId: req.userId!, ...parsed.data },
  });

  res.json(mission);
});

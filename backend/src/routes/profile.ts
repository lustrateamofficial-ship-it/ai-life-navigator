import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";

export const profileRouter = Router();

const profileSchema = z.object({
  weightGoalKg: z.number().positive().optional(),
  dailyCalorieTarget: z.number().int().positive().optional(),
  proteinTargetG: z.number().int().positive().optional(),
  fatTargetG: z.number().int().positive().optional(),
  carbTargetG: z.number().int().positive().optional(),
  city: z.string().optional(),
  onboardingDone: z.boolean().optional(),
});

profileRouter.get("/", async (req, res) => {
  const profile = await prisma.profile.findUnique({ where: { userId: req.userId! } });
  res.json(profile);
});

profileRouter.put("/", async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const profile = await prisma.profile.upsert({
    where: { userId: req.userId! },
    update: parsed.data,
    create: { userId: req.userId!, ...parsed.data },
  });
  res.json(profile);
});

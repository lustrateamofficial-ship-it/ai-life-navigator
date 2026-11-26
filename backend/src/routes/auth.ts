import { Router } from "express";
import { prisma } from "../db/prisma.js";

export const authRouter = Router();

// GET /auth/me — вызывается приложением сразу после запуска: профиль и признак пройденного знакомства.
authRouter.get("/me", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    include: { profile: true },
  });
  res.json(user);
});

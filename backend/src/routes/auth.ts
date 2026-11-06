import { Router } from "express";
import { prisma } from "../db/prisma.js";

export const authRouter = Router();

// GET /auth/me — вызывается фронтендом сразу после запуска Mini App,
// чтобы получить/создать пользователя (upsert уже произошёл в middleware telegramAuth).
authRouter.get("/me", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId! },
    include: { profile: true },
  });
  res.json(user);
});

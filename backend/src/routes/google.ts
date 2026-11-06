import { Router } from "express";
import crypto from "node:crypto";
import { prisma } from "../db/prisma.js";
import { buildGoogleAuthUrl, exchangeCodeForTokens } from "../services/googleDrive.js";
import { isGoogleDriveConfigured } from "../config/env.js";

// state -> userId, недолговечно (10 минут). Связывает обратный редирект от Google
// с конкретным пользователем — initData здесь недоступна: это обычный переход браузера,
// а не запрос изнутри Mini App, заголовков Telegram в нём нет.
const pendingStates = new Map<string, { userId: string; expires: number }>();

function cleanupExpiredStates() {
  const now = Date.now();
  for (const [key, value] of pendingStates) {
    if (value.expires < now) pendingStates.delete(key);
  }
}

// Часть 1: эндпоинты, которые требуют авторизации Telegram (вызываются из Mini App).
export const googleAuthenticatedRouter = Router();

googleAuthenticatedRouter.get("/auth-url", (req, res) => {
  if (!isGoogleDriveConfigured()) {
    return res.status(503).json({ error: "Google Drive не настроен на сервере" });
  }
  cleanupExpiredStates();
  const state = crypto.randomBytes(24).toString("hex");
  pendingStates.set(state, { userId: req.userId!, expires: Date.now() + 10 * 60 * 1000 });
  res.json({ url: buildGoogleAuthUrl(state) });
});

googleAuthenticatedRouter.get("/status", async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.userId! },
    select: { googleDriveRefreshToken: true },
  });
  res.json({ connected: Boolean(user.googleDriveRefreshToken) });
});

googleAuthenticatedRouter.delete("/disconnect", async (req, res) => {
  await prisma.user.update({
    where: { id: req.userId! },
    data: { googleDriveRefreshToken: null, googleDriveFolderId: null },
  });
  res.status(204).send();
});

// Часть 2: публичный callback — Google открывает его напрямую в системном браузере
// пользователя, никаких Telegram-заголовков здесь нет и быть не может. Регистрируется
// в index.ts ДО telegramAuth-мидлвара, как и GET /health.
export const googleCallbackRouter = Router();

function htmlPage(title: string, message: string) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:-apple-system,sans-serif;background:#0e0f12;color:#f2f2f4;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:24px}
div{max-width:360px}h2{margin-bottom:8px}p{color:#9a9ca3}</style>
</head><body><div><h2>${title}</h2><p>${message}</p></div></body></html>`;
}

googleCallbackRouter.get("/callback", async (req, res) => {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  if (error) {
    return res.send(
      htmlPage("Не получилось подключить Google Drive", "Доступ не был предоставлен. Закрой это окно и попробуй снова из приложения.")
    );
  }
  if (!code || !state) {
    return res.send(htmlPage("Ошибка", "Не хватает данных для подключения. Вернись в приложение и попробуй ещё раз."));
  }

  cleanupExpiredStates();
  const pending = pendingStates.get(state);
  if (!pending) {
    return res.send(htmlPage("Ссылка устарела", "Эта ссылка для подключения уже не действует. Вернись в приложение и попробуй ещё раз."));
  }
  pendingStates.delete(state);

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return res.send(
        htmlPage(
          "Не удалось получить постоянный доступ",
          "Это бывает при повторном подключении. Зайди в настройки своего Google-аккаунта, отключи доступ для этого приложения и попробуй подключить заново."
        )
      );
    }
    await prisma.user.update({ where: { id: pending.userId }, data: { googleDriveRefreshToken: tokens.refresh_token } });
    return res.send(htmlPage("Готово!", "Google Drive подключён. Можешь закрыть это окно и вернуться в приложение."));
  } catch (err) {
    console.error("[google] callback failed:", err);
    return res.send(htmlPage("Ошибка", "Что-то пошло не так при подключении. Попробуй ещё раз из приложения."));
  }
});

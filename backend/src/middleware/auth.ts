import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";

/**
 * Раздел 39 ТЗ (Privacy):
 * - Telegram authentication
 * - user_id isolation
 * - server-side authorization
 *
 * Проверяем подпись Telegram WebApp initData (см. https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
 * Каждый authenticated-запрос получает req.userId, который проставляется ТОЛЬКО
 * из проверенных данных Telegram — никогда из тела запроса или query-параметров.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      userTimezone?: string; // IANA tz, напр. "Europe/Moscow" — см. utils/userTime.ts
      telegramUser?: {
        id: number;
        username?: string;
        first_name?: string;
        last_name?: string;
        language_code?: string;
      };
    }
  }
}

function verifyTelegramInitData(initData: string, botToken: string): URLSearchParams | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (computedHash !== hash) return null;

  // Защита от replay: initData считается действительной ограниченное время.
  const authDate = Number(params.get("auth_date") ?? 0);
  const MAX_AGE_SECONDS = 24 * 60 * 60;
  if (Date.now() / 1000 - authDate > MAX_AGE_SECONDS) return null;

  return params;
}

export async function telegramAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const initData = req.header("x-telegram-init-data");

    if (!initData) {
      return res.status(401).json({ error: "Missing Telegram init data" });
    }

    if (!env.telegramBotToken) {
      // Dev-режим без токена: явно сообщаем, а не притворяемся, что авторизация прошла.
      return res.status(503).json({ error: "Telegram bot token not configured on server" });
    }

    const params = verifyTelegramInitData(initData, env.telegramBotToken);
    if (!params) {
      return res.status(401).json({ error: "Invalid Telegram init data" });
    }

    const userJson = params.get("user");
    if (!userJson) {
      return res.status(401).json({ error: "No user in init data" });
    }

    const tgUser = JSON.parse(userJson) as {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
      language_code?: string;
    };

    req.telegramUser = tgUser;

    // Upsert пользователя — но никогда не доверяем user_id, пришедшему в теле запроса.
    const user = await prisma.user.upsert({
      where: { telegramId: BigInt(tgUser.id) },
      update: {
        username: tgUser.username,
        firstName: tgUser.first_name,
        lastName: tgUser.last_name,
        languageCode: tgUser.language_code,
      },
      create: {
        telegramId: BigInt(tgUser.id),
        username: tgUser.username,
        firstName: tgUser.first_name,
        lastName: tgUser.last_name,
        languageCode: tgUser.language_code,
      },
    });

    req.userId = user.id;
    req.userTimezone = user.timezone; // см. utils/userTime.ts — фикс часового пояса
    next();
  } catch (err) {
    console.error("[auth] error:", err);
    res.status(401).json({ error: "Authentication failed" });
  }
}

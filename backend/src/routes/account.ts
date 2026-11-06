import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { buildUserExport, exportToJsonBuffer } from "../services/accountExport.js";
import { restoreUserExport } from "../services/accountRestore.js";
import {
  isAiConfigured,
  isGeminiConfigured,
  isGroqConfigured,
  isEmbeddingsConfigured,
  isTranscriptionConfigured,
  isSentryConfigured,
} from "../config/env.js";
import { isWeatherConfigured } from "../services/weather.js";

export const accountRouter = Router();

// GET /account — текущие настройки аккаунта
accountRouter.get("/", async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.userId! },
    select: { id: true, username: true, timezone: true, createdAt: true },
  });
  res.json(user);
});

// PUT /account — изменить часовой пояс. Раньше нигде в интерфейсе не было способа
// задать свой часовой пояс, хотя от него зависит, что считается "сегодня" для веса,
// еды и задач (см. utils/userTime.ts) — поле тихо стояло в UTC для всех.
const updateSchema = z.object({ timezone: z.string().min(1) });

accountRouter.put("/", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // Проверяем, что это реальный IANA timezone, а не произвольная строка —
  // иначе localDateOnly() в utils/userTime.ts будет молча откатываться на UTC.
  try {
    Intl.DateTimeFormat(undefined, { timeZone: parsed.data.timezone });
  } catch {
    return res.status(400).json({ error: "Неизвестный часовой пояс" });
  }

  const user = await prisma.user.update({
    where: { id: req.userId! },
    data: { timezone: parsed.data.timezone },
    select: { id: true, timezone: true },
  });
  res.json(user);
});

// GET /account/export — раздел 39 (Privacy): "экспорт данных". Выгружаем всё,
// что принадлежит пользователю, одним JSON-файлом. Та же логика используется для
// автоматического еженедельного бэкапа через бота — см. services/accountExport.ts.
accountRouter.get("/export", async (req, res) => {
  const exportData = await buildUserExport(req.userId!);

  res.setHeader("Content-Disposition", `attachment; filename="my-data-${Date.now()}.json"`);
  res.setHeader("Content-Type", "application/json");
  res.send(exportToJsonBuffer(exportData));
});

// POST /account/restore — загрузить обратно файл, полученный от GET /account/export
// (пункт из внешнего аудита: раньше можно было только выгрузить бэкап, но не
// загрузить его обратно). Восстановление ДОБАВЛЯЕТ данные, а не затирает всё
// существующее — подробности и список исключений (embeddings) см. в
// services/accountRestore.ts.
accountRouter.post("/restore", async (req, res) => {
  if (!req.body || typeof req.body !== "object") {
    return res.status(400).json({ error: "Пустой или некорректный файл" });
  }
  try {
    const summary = await restoreUserExport(req.userId!, req.body);
    res.status(200).json({ summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Не удалось восстановить данные";
    console.error("[account/restore] failed:", err);
    res.status(400).json({ error: message });
  }
});

// DELETE /account — полное удаление аккаунта и всех данных (раздел 39: "удаление данных").
// Требуем явное подтверждение в теле запроса — это необратимое действие, а не просто
// DELETE по кнопке одним кликом/повторным запросом сети.
const deleteSchema = z.object({ confirm: z.literal("УДАЛИТЬ") });

accountRouter.delete("/", async (req, res) => {
  const parsed = deleteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Для подтверждения передай { "confirm": "УДАЛИТЬ" }' });
  }

  // Все связанные таблицы помечены onDelete: Cascade в схеме — удаление User
  // каскадно стирает цели, задачи, память, дневник и всё остальное.
  await prisma.user.delete({ where: { id: req.userId! } });
  res.status(204).send();
});

// GET /account/privacy — какие внешние сервисы подключены на этом сервере. Экран «Кто что видит»
// строит из этого честный список, куда уходят данные; сами записи здесь не читаются и не отдаются.
accountRouter.get("/privacy", async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.userId! },
    select: { googleDriveRefreshToken: true },
  });
  res.json({
    ai: { gemini: isGeminiConfigured(), groq: isGroqConfigured(), anthropic: isAiConfigured() },
    embeddings: isEmbeddingsConfigured(),
    transcription: isTranscriptionConfigured(),
    weather: isWeatherConfigured(),
    googleDriveBackup: Boolean(user.googleDriveRefreshToken),
    monitoring: isSentryConfigured(),
  });
});

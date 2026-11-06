import { prisma } from "../db/prisma.js";
import { computeDirectionScore } from "../services/directionScore.js";
import { detectDrift } from "../services/driftDetection.js";
import { env } from "../config/env.js";
import { localDateOnly } from "../utils/userTime.js";
import { fetchWeather, isWeatherConfigured } from "../services/weather.js";

// Раздел 32: короткий, структурированный дайджест — "не отправлять огромный текст".

// БАГ (найден при повторном аудите): "сегодня" здесь считалось по часовому поясу сервера —
// для утреннего дайджеста это особенно чувствительно, он и так привязан к конкретному
// времени суток. timezone передаётся вызывающей стороной (см. scheduler.ts), чтобы не
// делать лишний запрос к пользователю внутри каждого вызова.
//
// city — тоже передаётся вызывающей стороной (profile.city пользователя, если задан) —
// см. scheduler.ts. Если не задан нигде, используется WEATHER_DEFAULT_CITY из .env; если
// не настроен и ключ погоды — строка с погодой просто не появляется в дайджесте
// (graceful degradation, раздел 48), без ошибок и английских заглушек.
export async function buildMorningDigest(
  userId: string,
  timezone: string = "UTC",
  city?: string | null
): Promise<string> {
  const now = new Date();
  const startOfToday = localDateOnly(now, timezone);
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const [tasks, latestWeight, score, drift, events, weather] = await Promise.all([
    prisma.task.findMany({
      where: { userId, status: { not: "done" }, scheduledTime: { gte: startOfToday, lt: endOfToday } },
      orderBy: { priority: "desc" },
      take: 3,
    }),
    prisma.weightLog.findFirst({ where: { userId }, orderBy: { date: "desc" } }),
    computeDirectionScore(userId),
    detectDrift(userId),
    prisma.calendarEvent.findMany({
      where: { userId, startTime: { gte: startOfToday, lt: endOfToday } },
      orderBy: { startTime: "asc" },
      take: 3,
    }),
    isWeatherConfigured() ? fetchWeather(city?.trim() || env.weatherDefaultCity) : Promise.resolve(null),
  ]);

  const lines = ["🌅 Доброе утро"];

  if (weather) {
    const feelsNote = weather.feelsLikeC !== weather.tempC ? ` (ощущается как ${weather.feelsLikeC}°)` : "";
    lines.push(`☁️ ${weather.city}: ${weather.tempC}°${feelsNote}, ${weather.description}`);
  }

  if (events.length) {
    lines.push("📅 Сегодня");
    for (const e of events) {
      const start = e.startTime.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      lines.push(`${start} ${e.title}`);
    }
  }

  if (tasks.length) {
    lines.push("🎯 Главное");
    tasks.forEach((t, i) => lines.push(`${i + 1}. ${t.title}`));
  }

  if (latestWeight) {
    lines.push(`❤️ Вес: ${latestWeight.weightKg} кг`);
  }

  lines.push(`🧭 Направление: ${score.overall}/100`);

  if (drift.driftDetected) {
    lines.push(`⚠️ ${drift.message}`);
  }

  return lines.join("\n");
}

export async function buildWeeklyDigest(userId: string): Promise<string> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [tasksDone, tasksTotal, score] = await Promise.all([
    prisma.task.count({ where: { userId, status: "done", completedAt: { gte: since } } }),
    prisma.task.count({ where: { userId, createdAt: { gte: since } } }),
    computeDirectionScore(userId),
  ]);

  return [
    "🧭 Твоя неделя",
    `✅ Задачи: ${tasksDone} / ${tasksTotal}`,
    `🧭 Direction Score: ${score.overall}`,
    "Полный отчёт — в разделе «Аналитика» в приложении.",
  ].join("\n");
}

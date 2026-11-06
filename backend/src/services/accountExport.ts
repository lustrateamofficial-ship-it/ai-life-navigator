import { gzipSync } from "node:zlib";
import { prisma } from "../db/prisma.js";

// Вынесено из routes/account.ts, чтобы одной и той же логикой пользовались и ручной
// экспорт по кнопке (GET /account/export), и еженедельный автоматический бэкап через
// бота (см. jobs/scheduler.ts) — раньше это не существовало вообще, см. README.
export async function buildUserExport(userId: string) {
  // БАГ (найден при повторном аудите): комментарий ниже и в routes/account.ts обещает
  // "выгружаем всё, что принадлежит пользователю" — но на деле не хватало восьми таблиц:
  // selfPortraits (Портрет по дневнику, добавлен позже и не довнесён сюда), weeklyReviews,
  // monthlyReviews, directionScores, detectedTrends, correlations, aiInsights, aiAlerts.
  // Для пользователя, который явно просил "Портрет по дневнику" как значимую фичу, терять
  // его историю при восстановлении из бэкапа было бы особенно обидно. Теперь действительно всё.
  // БАГ (найден при подготовке восстановления из бэкапа): dailySummaries — тоже
  // данные пользователя (кэш дневной сводки: выполненные задачи, калории,
  // Direction Score), но их не было ни в одном из предыдущих проходов по экспорту.
  // Это не критично (значения пересчитываемы), но раз обещаем "выгружаем всё" —
  // добавляем и их, иначе restore молча потеряет дневную историю сводок.
  const [
    user,
    profile,
    mission,
    goals,
    tasks,
    habits,
    weightLogs,
    foodLogs,
    financialAccounts,
    transactions,
    debts,
    savingsGoals,
    calendarEvents,
    reminders,
    ideas,
    memoryItems,
    journalEntries,
    dailyCheckins,
    dailySummaries,
    selfPortraits,
    weeklyReviews,
    monthlyReviews,
    directionScores,
    detectedTrends,
    correlations,
    aiInsights,
    aiAlerts,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
    prisma.profile.findUnique({ where: { userId } }),
    prisma.mission.findUnique({ where: { userId } }),
    prisma.goal.findMany({ where: { userId }, include: { stages: true } }),
    prisma.task.findMany({ where: { userId } }),
    prisma.habit.findMany({ where: { userId }, include: { logs: true } }),
    prisma.weightLog.findMany({ where: { userId } }),
    prisma.foodLog.findMany({ where: { userId }, include: { entries: true } }),
    prisma.financialAccount.findMany({ where: { userId } }),
    prisma.financialTransaction.findMany({ where: { userId } }),
    prisma.debt.findMany({ where: { userId } }),
    prisma.savingsGoal.findMany({ where: { userId } }),
    prisma.calendarEvent.findMany({ where: { userId } }),
    prisma.reminder.findMany({ where: { userId } }),
    prisma.idea.findMany({ where: { userId } }),
    prisma.memoryItem.findMany({ where: { userId } }),
    prisma.journalEntry.findMany({ where: { userId } }),
    prisma.dailyCheckin.findMany({ where: { userId } }),
    prisma.dailySummary.findMany({ where: { userId } }),
    prisma.selfPortrait.findMany({ where: { userId } }),
    prisma.weeklyReview.findMany({ where: { userId } }),
    prisma.monthlyReview.findMany({ where: { userId } }),
    prisma.directionScore.findMany({ where: { userId } }),
    prisma.detectedTrend.findMany({ where: { userId } }),
    prisma.correlation.findMany({ where: { userId } }),
    prisma.aiInsight.findMany({ where: { userId } }),
    prisma.aiAlert.findMany({ where: { userId } }),
  ]);

  return {
    // exportVersion — на будущее: если формат экспорта когда-нибудь поменяется
    // несовместимо, restore сможет отличить старый файл от нового и дать понятную
    // ошибку вместо попытки слепо что-то намапить.
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    timezone: user?.timezone ?? "UTC",
    profile,
    mission,
    goals,
    tasks,
    habits,
    weightLogs,
    foodLogs,
    financialAccounts,
    transactions,
    debts,
    savingsGoals,
    calendarEvents,
    reminders,
    ideas,
    memoryItems,
    journalEntries,
    dailyCheckins,
    dailySummaries,
    selfPortraits,
    weeklyReviews,
    monthlyReviews,
    directionScores,
    detectedTrends,
    correlations,
    aiInsights,
    aiAlerts,
  };
}

// pretty=true (с отступами) — для ручного скачивания кнопкой, чтобы файл можно было
// открыть и почитать глазами. pretty=false (компактный, без пробелов) — для бэкапа в
// Google Drive: не на что смотреть глазами, а compact-JSON сам по себе уже заметно
// меньше (отступы — это чистый лишний вес, который gzip потом всё равно досожмёт, но
// зачем давать ему больше работы, чем нужно).
export function exportToJsonBuffer(exportData: unknown, pretty = true): Buffer {
  // JSON.stringify не справляется с BigInt без replacer — на будущее, если в экспорт
  // когда-нибудь попадёт сырое поле вроде telegramId.
  const replacer = (_key: string, value: unknown) => (typeof value === "bigint" ? value.toString() : value);
  const json = JSON.stringify(exportData, replacer, pretty ? 2 : undefined);
  return Buffer.from(json, "utf-8");
}

// Полный бэкап без потери ни единого поля, просто упакованный плотнее — это не "обрезать
// подробности", а архивация: gzip на типичном JSON-дампе даёт сокращение в 5–15 раз,
// особенно на дневнике и памяти, где много повторяющегося текста и ключей.
export function gzipBuffer(buffer: Buffer): Buffer {
  return gzipSync(buffer, { level: 9 }); // level 9 — максимальное сжатие; для раз-в-неделю job'а время не критично
}

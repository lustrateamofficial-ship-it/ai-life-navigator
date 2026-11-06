import cron from "node-cron";
import { prisma } from "../db/prisma.js";
import { isBotConfigured } from "../config/env.js";
import { sendMessageToUser } from "../bot/bot.js";
import { buildMorningDigest, buildWeeklyDigest } from "../bot/digest.js";
import { saveDirectionScore } from "../services/directionScore.js";
import { maybeCreateDriftAlert } from "../services/driftDetection.js";
import { saveDetectedTrends } from "../services/trendDetection.js";
import { saveCorrelations } from "../services/correlationEngine.js";
import { localDateOnly } from "../utils/userTime.js";
import { computeNextTrigger } from "../utils/reminderRecurrence.js";
import { buildUserExport, exportToJsonBuffer, gzipBuffer } from "../services/accountExport.js";
import { getAccessToken, ensureBackupFolder, uploadBackupFile, pruneOldBackups } from "../services/googleDrive.js";

// Сколько последних еженедельных бэкапов хранить в Google Drive на пользователя.
// 12 недель ≈ 3 месяца истории — достаточно, чтобы заметить и откатить даже
// не сразу обнаруженную проблему, но не бесконечный рост занятого места.
const BACKUP_RETENTION_WEEKS = 12;

// Раздел 47: Scheduled Jobs. Каждый job проходит по всем пользователям,
// но НЕ запускает тяжёлый AI-анализ без необходимости (раздел 47: "не запускать
// тяжёлые AI-анализы без необходимости") — здесь используются дешёвые,
// чисто вычислительные шаги; полноценный AI-анализ вызывается пользователем вручную
// через /ai/analyze или по факту обнаружения дрейфа.

// БАГ (найден при аудите): раньше ни одна итерация по пользователям не была обёрнута
// в try/catch. Если обработка ОДНОГО пользователя падала с ошибкой (например, Prisma
// timeout или edge-case в данных), весь cron-джоб прерывался — остальные пользователи
// в этом прогоне просто не получали дайджест/анализ, без какого-либо лога о причине.
// Хуже того: необработанное исключение в async cron-callback — это unhandled promise
// rejection, который в Node 15+ по умолчанию завершает весь процесс (см. также fix
// в index.ts) — то есть один "плохой" пользователь раз в день мог уронить сервер
// для абсолютно всех. Этот помощник логирует ошибку конкретного пользователя и
// продолжает цикл для остальных.
async function forEachUserSafely<T>(
  users: T[],
  label: string,
  handler: (user: T) => Promise<void>
): Promise<void> {
  for (const user of users) {
    try {
      await handler(user);
    } catch (err) {
      console.error(`[scheduler:${label}] failed for user`, (user as any).id, err);
    }
  }
}

export function startScheduler() {
  // Каждое утро в 08:00 — дайджест (раздел 32)
  cron.schedule("0 8 * * *", async () => {
    console.log("[scheduler] morning digest job");
    // БАГ (найден при повторном аудите): buildMorningDigest считал "сегодняшние" задачи
    // и события по часовому поясу сервера — добавляем timezone в выборку, чтобы передать
    // его honestly, а не лишний раз запрашивать пользователя внутри digest.ts на каждого.
    // profile.city — если пользователь указал город в профиле, погода (см. services/weather.ts)
    // берётся для него, а не для WEATHER_DEFAULT_CITY из .env.
    const users = await prisma.user.findMany({
      select: { id: true, telegramId: true, timezone: true, profile: { select: { city: true } } },
    });
    await forEachUserSafely(users, "morning-digest", async (user) => {
      await saveDirectionScore(user.id);
      if (isBotConfigured()) {
        const text = await buildMorningDigest(user.id, user.timezone, user.profile?.city);
        await sendMessageToUser(user.telegramId, text);
      }
    });
  });

  // Проверка напоминаний — раз в минуту (раздел 19). Раньше напоминание можно было
  // создать в приложении, но его никто и никогда не отправлял — ни одного job'а,
  // который сверял бы triggerAt с текущим временем, не существовало.
  cron.schedule("* * * * *", async () => {
    if (!isBotConfigured()) return;
    const due = await prisma.reminder.findMany({
      where: { active: true, triggerAt: { lte: new Date() } },
      include: { user: { select: { telegramId: true } } },
    });
    if (due.length === 0) return;

    await forEachUserSafely(due, "reminder-delivery", async (reminder) => {
      const delivered = await sendMessageToUser(reminder.user.telegramId, `⏰ ${reminder.title}`);
      // Если отправка не удалась (сетевой сбой и т.п.) — НЕ меняем состояние напоминания.
      // Оно останется active с тем же triggerAt в прошлом, так что следующий же прогон
      // (через минуту) попробует снова, пока либо не доставится, либо пользователь сам
      // его не уберёт. Раньше "once"-напоминание помечалось отправленным независимо
      // от результата — при сбое оно пропадало навсегда, ни разу не дойдя до человека.
      if (!delivered) return;

      if (reminder.recurrence === "once") {
        await prisma.reminder.update({ where: { id: reminder.id }, data: { active: false } });
      } else {
        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { triggerAt: computeNextTrigger(reminder.triggerAt, reminder.recurrence) },
        });
      }
    });
  });

  // Каждый вечер в 21:30 — check-in (раздел 33). Раньше бот просто писал один и тот же
  // текст каждый день, даже если человек неделю не отвечал, а сам ответ ("Хорошо"/"Плохо")
  // нигде не сохранялся — таблица DailyCheckin существовала, но ничего её не заполняло.
  // Теперь: ответ записывается через inline-кнопки (см. bot.ts, callback_query), а если
  // вчерашний check-in остался без ответа — вопрос звучит мягче и предлагает не беспокоить.
  cron.schedule("30 21 * * *", async () => {
    console.log("[scheduler] evening check-in job");
    if (!isBotConfigured()) return;
    const users = await prisma.user.findMany({
      select: { id: true, telegramId: true, timezone: true, checkinSnoozedUntil: true },
    });

    await forEachUserSafely(users, "evening-checkin", async (user) => {
      if (user.checkinSnoozedUntil && user.checkinSnoozedUntil > new Date()) return; // попросил не беспокоить

      const todayKey = localDateOnly(new Date(), user.timezone ?? "UTC");
      const yesterdayKey = new Date(todayKey.getTime() - 24 * 60 * 60 * 1000);

      const yesterdayCheckin = await prisma.dailyCheckin.findUnique({
        where: { userId_date: { userId: user.id, date: yesterdayKey } },
      });
      const wasUnanswered = yesterdayCheckin && !yesterdayCheckin.rating && !yesterdayCheckin.freeText;

      // Создаём сегодняшнюю запись заранее (rating ещё null) — так завтрашний прогон
      // сможет узнать, ответили ли сегодня, не дублируя вопрос бесконечно.
      await prisma.dailyCheckin.upsert({
        where: { userId_date: { userId: user.id, date: todayKey } },
        update: {},
        create: { userId: user.id, date: todayKey },
      });

      if (wasUnanswered) {
        await sendMessageToUser(
          user.telegramId,
          "Заметил, что ты не отвечал пару дней — всё в порядке? Можешь ответить, когда будет время, или попросить не спрашивать какое-то время.",
          [
            [{ text: "Всё хорошо, отвечу", callback_data: "checkin:ask_again" }],
            [{ text: "Не спрашивать неделю", callback_data: "checkin:snooze" }],
          ]
        );
      } else {
        await sendMessageToUser(user.telegramId, "Как прошёл день? Нажми кнопку или просто напиши пару строк (можно голосом): я сохраню их в дневник.", [
          [
            { text: "Хорошо", callback_data: "checkin:good" },
            { text: "Нормально", callback_data: "checkin:normal" },
          ],
          [
            { text: "Плохо", callback_data: "checkin:bad" },
            { text: "Пропустил", callback_data: "checkin:skipped" },
          ],
        ]);
      }
    });
  });

  // Раз в день — drift detection (не спамить, см. maybeCreateDriftAlert)
  cron.schedule("0 12 * * *", async () => {
    console.log("[scheduler] drift detection job");
    const users = await prisma.user.findMany({ select: { id: true, telegramId: true } });
    await forEachUserSafely(users, "drift-detection", async (user) => {
      const alert = await maybeCreateDriftAlert(user.id);
      if (alert && isBotConfigured()) {
        await sendMessageToUser(user.telegramId, alert.message);
      }
    });
  });

  // Раз в неделю (понедельник 09:00) — weekly review (раздел 34) + тренды + корреляции
  cron.schedule("0 9 * * 1", async () => {
    console.log("[scheduler] weekly review job");
    const users = await prisma.user.findMany({ select: { id: true, telegramId: true } });
    await forEachUserSafely(users, "weekly-review", async (user) => {
      await saveDetectedTrends(user.id);
      await saveCorrelations(user.id);
      if (isBotConfigured()) {
        const text = await buildWeeklyDigest(user.id);
        await sendMessageToUser(user.telegramId, text);
      }
    });
  });

  // Раз в неделю (суббота, 04:00) — резервная копия всех данных пользователя в его
  // собственный Google Drive (папка "Навигатор Жизни — бэкапы"). Раньше бэкапов не было
  // вообще: все данные жили только в одном Docker-томе на одной VM — сломайся диск или
  // снеси кто-то том случайно, данные (включая дневник) исчезли бы безвозвратно.
  // Время выбрано отдельно от понедельничного weekly-review, чтобы не нагружать сервер
  // двумя тяжёлыми job'ами разом. Пользователи, не подключившие Google Drive (раздел
  // "Настройки"), тихо пропускаются — без попытки написать им об этом каждую неделю.
  cron.schedule("0 4 * * 6", async () => {
    console.log("[scheduler] google drive backup job");
    const users = await prisma.user.findMany({
      where: { googleDriveRefreshToken: { not: null } },
      select: { id: true, telegramId: true, googleDriveRefreshToken: true, googleDriveFolderId: true },
    });
    if (users.length === 0) return;

    await forEachUserSafely(users, "google-drive-backup", async (user) => {
      // БАГ (найден при повторном аудите): если пользователь отзовёт доступ приложению
      // в настройках своего Google-аккаунта (или Google сам инвалидирует токен), раньше
      // это просто падало бы в forEachUserSafely с логом в консоль сервера, который
      // никто не смотрит — и человек молча переставал бы получать бэкапы НАВСЕГДА, узнав
      // об этом только в день, когда они реально понадобятся. Теперь: отличаем именно
      // "токен отозван" (Google возвращает invalid_grant) от обычного сетевого сбоя,
      // в этом случае явно уведомляем пользователя и чистим мёртвый токен — чтобы и
      // экран Настроек корректно показывал "не подключено", и чтобы это не пыталось
      // повторяться (и не слать то же сообщение) каждую неделю.
      let accessToken: string;
      try {
        accessToken = await getAccessToken(user.googleDriveRefreshToken!);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("invalid_grant")) {
          await prisma.user.update({
            where: { id: user.id },
            data: { googleDriveRefreshToken: null, googleDriveFolderId: null },
          });
          if (isBotConfigured()) {
            await sendMessageToUser(
              user.telegramId,
              "⚠️ Доступ к твоему Google Drive для резервных копий перестал работать (скорее всего, был отозван вручную). Бэкапы на эту неделю не сохранились. Переподключи в Настройках, когда будет удобно."
            );
          }
          return; // не пробрасываем дальше в forEachUserSafely — это не "ошибка", а уже обработанный случай
        }
        throw err; // прочие ошибки (сеть, таймаут и т.д.) — как раньше, тихо в лог, не нагнетаем каждую неделю
      }

      const folderId = await ensureBackupFolder(accessToken, user.googleDriveFolderId);
      if (folderId !== user.googleDriveFolderId) {
        await prisma.user.update({ where: { id: user.id }, data: { googleDriveFolderId: folderId } });
      }

      // Максимум подробностей, минимум места: полный экспорт без единого урезанного
      // поля (buildUserExport), упакованный компактным JSON без отступов и затем gzip —
      // типично даёт сокращение в 5–15 раз относительно "читаемого" файла из Настроек.
      const exportData = await buildUserExport(user.id);
      const compactJson = exportToJsonBuffer(exportData, /* pretty */ false);
      const compressed = gzipBuffer(compactJson);

      await uploadBackupFile(
        accessToken,
        folderId,
        `backup-${new Date().toISOString().slice(0, 10)}.json.gz`,
        compressed,
        "application/gzip"
      );

      // Ротация: без неё папка с бэкапами росла бы бесконечно каждую неделю, годами.
      // BACKUP_RETENTION_WEEKS ниже — единственное место, где меняется глубина истории.
      const deleted = await pruneOldBackups(accessToken, folderId, BACKUP_RETENTION_WEEKS);
      if (deleted > 0) console.log(`[scheduler] pruned ${deleted} old backup(s) for user ${user.id}`);
    });
  });

  console.log(
    "⏰ Scheduler started (morning digest, reminders, evening check-in, drift detection, weekly review, Google Drive backup)"
  );
}

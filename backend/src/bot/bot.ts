import TelegramBot from "node-telegram-bot-api";
import { env, isBotConfigured, isTranscriptionConfigured } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { transcribeAudio } from "../services/ai/providers/transcription.js";
import { routeNaturalLanguageMessage } from "./naturalLanguageRouter.js";
import { computeDirectionScore } from "../services/directionScore.js";
import { localDateOnly } from "../utils/userTime.js";
import { applyProposals } from "../services/journalService.js";
import { takePending } from "../services/pendingProposals.js";

// Раздел 3: "Бот является точкой входа. Mini App является основным интерфейсом.
// Не превращать бота в основной интерфейс." — команды входа, дайджесты, уведомления,
// плюс быстрый natural-language / голосовой ввод, который сразу конвертируется
// в структурированные данные — тяжёлый UI остаётся в Mini App.

let bot: TelegramBot | null = null;

// БАГ (найден при повторном аудите): раньше возвращался только userId, из-за чего
// natural-language путь через бота (вес/еда) считал "сегодня" по часовому поясу сервера,
// а обработчик callback_query отдельным запросом ДОВЫТАСКИВАЛ timezone сразу после этого
// вызова — лишний запрос к БД на каждое нажатие кнопки ровно за тем, что upsert уже вернул.
async function getOrCreateUser(telegramId: number): Promise<{ id: string; timezone: string }> {
  const user = await prisma.user.upsert({
    where: { telegramId: BigInt(telegramId) },
    update: {},
    create: { telegramId: BigInt(telegramId) },
  });
  return { id: user.id, timezone: user.timezone };
}

const DAY_RATING_LABELS: Record<string, string> = {
  good: "Хорошо",
  normal: "Нормально",
  bad: "Плохо",
  skipped: "Пропущено",
};

export function startBot() {
  if (!isBotConfigured()) return;

  bot = new TelegramBot(env.telegramBotToken, { polling: true });

  // Меню команд рядом с полем ввода в Telegram — делает команды видимыми сразу,
  // не только тем, кто дочитал приветственное сообщение.
  bot.setMyCommands([
    { command: "today", description: "Сегодняшний план" },
    { command: "score", description: "Показатель направления" },
  ]).catch((err) => console.error("[bot] setMyCommands failed:", err));

  bot.onText(/\/start/, async (msg) => {
    await bot!.sendMessage(
      msg.chat.id,
      "🧭 Добро пожаловать в Навигатор Жизни!\n\n" +
        "Пиши мне как в дневник, текстом или голосом: мысли, планы, траты, как прошёл день. " +
        "Я сохраню запись и предложу, что из неё добавить в задачи и учёт. " +
        "Короткие записи тоже понимаю: «Вес 90.4», «Съел 250 г курицы». " +
        "Если запись личная и AI её видеть не должен, начни с «Личное:».\n\n" +
        "Команды:\n" +
        "/today — сегодняшний план\n" +
        "/score — показатель направления",
      {
        reply_markup: {
          inline_keyboard: [[{ text: "Открыть приложение", web_app: { url: env.telegramWebAppUrl } }]],
        },
      }
    );
  });

  bot.onText(/\/today/, async (msg) => {
    await bot!.sendMessage(msg.chat.id, "Открой приложение, чтобы увидеть сегодняшний план 👇", {
      reply_markup: {
        inline_keyboard: [[{ text: "Сегодня", web_app: { url: env.telegramWebAppUrl } }]],
      },
    });
  });

  // Предложенная доработка: спросить Direction Score прямо в чате, не открывая приложение.
  bot.onText(/\/score/, async (msg) => {
    try {
      const { id: userId } = await getOrCreateUser(msg.from!.id);
      const score = await computeDirectionScore(userId);
      await bot!.sendMessage(
        msg.chat.id,
        `🧭 Направление: ${score.overall} / 100\n` +
          `🎯 Цели: ${score.goalsScore} · ❤️ Здоровье: ${score.healthScore} · 💰 Финансы: ${score.financeScore}\n` +
          `🔥 Привычки: ${score.habitsScore} · ⏱ Время: ${score.timeScore}`
      );
    } catch (err) {
      console.error("[bot] /score failed:", err);
      await bot!.sendMessage(msg.chat.id, "Не получилось посчитать показатель. Попробуй ещё раз.").catch(() => {});
    }
  });

  // Обычный текст (не команда) — natural language input прямо из чата с ботом.
  // Раздел 2: «Вес 90.4», «Съел 250 г курицы», «Поставь завтра задачу...» и т.д.
  bot.on("message", async (msg) => {
    if (!msg.text || msg.text.startsWith("/")) return; // команды уже обработаны выше

    try {
      const { id: userId, timezone } = await getOrCreateUser(msg.from!.id);
      const { reply, buttons } = await routeNaturalLanguageMessage(userId, msg.text, timezone);
      await bot!.sendMessage(msg.chat.id, reply, buttons ? { reply_markup: { inline_keyboard: buttons } } : undefined);
    } catch (err) {
      console.error("[bot] natural language routing failed:", err);
      await bot!.sendMessage(msg.chat.id, "Не получилось обработать сообщение. Попробуй ещё раз или через приложение.").catch(() => {});
    }
  });

  // Голосовые сообщения.
  bot.on("voice", async (msg) => {
    if (!isTranscriptionConfigured()) {
      await bot!.sendMessage(msg.chat.id, "🎙 Голосовой ввод пока не настроен на сервере. Напиши текстом.");
      return;
    }

    try {
      const fileLink = await bot!.getFileLink(msg.voice!.file_id);
      const audioRes = await fetch(fileLink);
      const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

      const text = await transcribeAudio(audioBuffer, "voice.ogg");
      if (!text) {
        await bot!.sendMessage(msg.chat.id, "Не удалось распознать голосовое сообщение. Попробуй ещё раз или напиши текстом.");
        return;
      }

      await bot!.sendMessage(msg.chat.id, `🎙 Услышал: «${text}»`);

      const { id: userId, timezone } = await getOrCreateUser(msg.from!.id);
      const { reply, buttons } = await routeNaturalLanguageMessage(userId, text, timezone);
      await bot!.sendMessage(msg.chat.id, reply, buttons ? { reply_markup: { inline_keyboard: buttons } } : undefined);
    } catch (err) {
      console.error("[bot] voice handling failed:", err);
      await bot!.sendMessage(msg.chat.id, "Не получилось обработать голосовое сообщение.");
    }
  });

  // Нажатия на inline-кнопки — раздел 33 (вечерний check-in) и snooze-логика в scheduler.ts.
  // Раньше кнопок "Хорошо/Нормально/Плохо/Пропустил" не существовало вообще: бот писал
  // текст, а ответ пользователя никуда не сохранялся — таблица DailyCheckin была мертва.
  bot.on("callback_query", async (query) => {
    if (!query.data || !query.message) return;
    const chatId = query.message.chat.id;

    try {
      // Раньше здесь был отдельный findUniqueOrThrow ровно за timezone — теперь
      // getOrCreateUser отдаёт его сразу, без лишнего запроса к БД на каждое нажатие.
      const { id: userId, timezone } = await getOrCreateUser(query.from.id);
      const today = localDateOnly(new Date(), timezone ?? "UTC");

      if (query.data.startsWith("jr:")) {
        // Подтверждение предложений из записи дневника (кнопки из naturalLanguageRouter).
        const [, action, entryId] = query.data.split(":");
        const proposals = await takePending(entryId, userId);
        // Убираем кнопки сразу, чтобы повторное нажатие не создало дубликаты.
        await bot!
          .editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: query.message.message_id })
          .catch(() => {});

        if (action === "no") {
          await bot!.answerCallbackQuery(query.id, { text: "Хорошо" });
        } else if (!proposals) {
          await bot!.answerCallbackQuery(query.id, { text: "Предложение устарело" });
          await bot!.sendMessage(
            chatId,
            "Это предложение уже не актуально (прошло много времени или бот перезапускался). Запись в дневнике сохранена. Добавить задачи можно в приложении."
          );
        } else {
          const done = await applyProposals(userId, timezone ?? "UTC", {
            tasks: proposals.tasks,
            reminders: proposals.reminders,
            ideas: proposals.ideas,
            transactions: proposals.transactions,
            weight: proposals.weight,
            food: proposals.food,
          });
          const total = Object.values(done).reduce((a, b) => a + b, 0);
          await bot!.answerCallbackQuery(query.id, { text: "Добавлено" });
          await bot!.sendMessage(chatId, `Добавил: ${total}. Всё можно поправить в приложении.`);
        }
      } else if (query.data.startsWith("checkin:") && query.data !== "checkin:snooze" && query.data !== "checkin:ask_again") {
        const rating = query.data.replace("checkin:", "");
        await prisma.dailyCheckin.upsert({
          where: { userId_date: { userId, date: today } },
          update: { rating: rating as any },
          create: { userId, date: today, rating: rating as any },
        });
        await bot!.answerCallbackQuery(query.id, { text: "Записал" });
        await bot!.sendMessage(
          chatId,
          `Отметил: ${DAY_RATING_LABELS[rating] ?? rating}. Если хочешь, напиши пару строк о дне (можно голосом): они попадут в дневник.`
        );
      } else if (query.data === "checkin:snooze") {
        const snoozeUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await prisma.user.update({ where: { id: userId }, data: { checkinSnoozedUntil: snoozeUntil } });
        await bot!.answerCallbackQuery(query.id, { text: "Хорошо, не буду спрашивать неделю" });
        await bot!.sendMessage(chatId, "Понял, не буду спрашивать про день неделю. Если захочешь — просто напиши сам.");
      } else if (query.data === "checkin:ask_again") {
        await bot!.answerCallbackQuery(query.id, { text: "Хорошо" });
        await bot!.sendMessage(chatId, "Как прошёл день?", {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "Хорошо", callback_data: "checkin:good" },
                { text: "Нормально", callback_data: "checkin:normal" },
              ],
              [
                { text: "Плохо", callback_data: "checkin:bad" },
                { text: "Пропустил", callback_data: "checkin:skipped" },
              ],
            ],
          },
        });
      }
    } catch (err) {
      console.error("[bot] callback_query handling failed:", err);
      await bot!.answerCallbackQuery(query.id, { text: "Что-то пошло не так" }).catch(() => {});
    }
  });

  bot.on("polling_error", (err) => {
    console.error("[bot] polling error:", err.message);
  });

  console.log("🤖 Telegram bot started (polling)");
}

// buttons — опциональная inline-клавиатура: массив рядов, в ряду — кнопки {text, callback_data}.
// БАГ (найден при независимом аудите): раньше функция ничего не возвращала — вызывающий
// код не мог отличить "сообщение реально доставлено" от "отправка молча упала". Для
// большинства уведомлений (дайджест, check-in) это не критично, но для одноразовых
// напоминаний (см. jobs/scheduler.ts) это означало: сетевой сбой — и напоминание
// помечается отправленным навсегда, хотя пользователь его не увидел.
export async function sendMessageToUser(
  telegramId: bigint,
  text: string,
  buttons?: Array<Array<{ text: string; callback_data: string }>>
): Promise<boolean> {
  if (!bot) return false;
  try {
    await bot.sendMessage(Number(telegramId), text, buttons ? { reply_markup: { inline_keyboard: buttons } } : undefined);
    return true;
  } catch (err) {
    console.error(`[bot] Failed to message user ${telegramId}:`, err);
    return false;
  }
}



export async function broadcastDigest(userId: string, text: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  await sendMessageToUser(user.telegramId, text);
}

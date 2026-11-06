import { prisma } from "../db/prisma.js";
import { isAnyAiConfigured } from "../config/env.js";
import { generateRouterOrSpecialistJson } from "../services/ai/textGeneration.js";
import { parseFoodText } from "../services/ai/orchestrator.js";
import { localDateOnly } from "../utils/userTime.js";
import { createJournalEntry } from "../services/journalService.js";
import { proposeFromJournal } from "../services/ai/orchestrator.js";
import { countProposals, describeProposals, parsePrivatePrefix } from "../services/journalExtraction.js";
import { savePending } from "../services/pendingProposals.js";
import { supportMessageText, detectCrisis } from "../services/distressDetection.js";

// Дневник как единый вход. Всё, что человек пишет боту, делится на три случая:
//   вес («Вес 90.4») и еда («Съел 250 г курицы») — короткие команды, пишутся сразу;
//   всё остальное — запись в дневник. Из неё AI предлагает задачи, напоминания, траты и т.д.,
//   а бот присылает кнопки «Добавить всё» / «Не нужно». Без кнопки ничего не создаётся.
// Это слой [1] — РОУТЕР трёхслойной системы (см. services/ai/textGeneration.ts): самый частый и
// дешёвый вызов, поэтому уходит на Gemini/Groq, а не на Anthropic.
//
// Изменение поведения: раньше любой другой текст сразу превращался в задачу. Теперь он попадает
// в дневник, а задачу создаёт подтверждение кнопкой (одно нажатие вместо мгновенного создания).

type Intent = "weight" | "food" | "journal";

export interface BotButton {
  text: string;
  callback_data: string;
}
export interface BotReply {
  reply: string;
  buttons?: BotButton[][];
}

const WEIGHT_REGEX = /^вес\s*[:=]?\s*([\d]+[.,]?\d*)/i;

async function classifyIntent(text: string): Promise<Intent> {
  // Дешёвая эвристика без AI — покрывает самый частый случай из раздела 2.
  if (WEIGHT_REGEX.test(text)) return "weight";

  // Текст о тяжёлом состоянии нельзя отправлять во внешний классификатор: сразу в дневник.
  if (detectCrisis(text)) return "journal";

  // classifyIntent — слой [1] (роутер), он должен работать через Gemini/Groq без Anthropic
  // вообще, поэтому гейт — isAnyAiConfigured(), а не только ключ Anthropic.
  if (!isAnyAiConfigured()) return "journal";

  try {
    const result = await generateRouterOrSpecialistJson<{ intent: Intent }>({
      system:
        'Классифицируй сообщение пользователя ровно в одну категорию: "weight" (внёс свой вес), ' +
        '"food" (коротко описал, что съел или выпил), или "journal" (всё остальное: мысли, планы, ' +
        'задачи, напоминания, траты, рассказ о дне). При сомнении выбирай "journal". ' +
        'Отвечай JSON {"intent": "..."}',
      prompt: text,
    });
    return result.intent === "weight" || result.intent === "food" ? result.intent : "journal";
  } catch {
    return "journal";
  }
}

// БАГ (найден при повторном аудите): "сегодня" для веса/еды, записанных через бота,
// считалось по часовому поясу сервера — тот же класс бага, что уже чинил для HTTP-роутов
// (health.ts) и привычек (habits.ts), но этот путь (natural language через бота) тогда
// пропустил. timezone передаётся вызывающей стороной (bot.ts), которая и так уже получает
// его при апсерте пользователя — без лишнего запроса к БД.
export async function routeNaturalLanguageMessage(userId: string, rawText: string, timezone: string = "UTC"): Promise<BotReply> {
  // «Личное: ...» — запись, которую нельзя отправлять во внешние AI: сохраняем как есть,
  // без классификатора, разбора и извлечения принципов.
  const { text, isPrivate } = parsePrivatePrefix(rawText);
  if (isPrivate) {
    await createJournalEntry(userId, text, { timezone, private: true });
    return { reply: "🔒 Записал в дневник как личную. AI её не видит и ничего из неё не предлагает." };
  }

  const intent = await classifyIntent(text);

  switch (intent) {
    case "weight": {
      const match = WEIGHT_REGEX.exec(text);
      const value = match ? parseFloat(match[1].replace(",", ".")) : NaN;
      if (isNaN(value)) return { reply: "Не смог распознать вес. Напиши, например: «Вес 90.4»." };

      const dateOnly = localDateOnly(new Date(), timezone);
      await prisma.weightLog.upsert({
        where: { userId_date: { userId, date: dateOnly } },
        update: { weightKg: value },
        create: { userId, date: dateOnly, weightKg: value },
      });
      return { reply: `⚖️ Записал вес: ${value} кг.` };
    }

    case "food": {
      const items = await parseFoodText(text);
      const dateOnly = localDateOnly(new Date(), timezone);
      await prisma.foodLog.create({
        data: {
          userId,
          date: dateOnly,
          rawInput: text,
          entries: { create: items.map((i) => ({ nameOverride: i.name, grams: i.grams, calories: i.calories, proteinG: i.proteinG, fatG: i.fatG, carbsG: i.carbsG })) },
        },
      });
      const totalCalories = items.reduce((s, i) => s + i.calories, 0);
      return {
        reply: `🍽 Записал приём пищи${totalCalories ? ` (~${Math.round(totalCalories)} ккал)` : ""}. Проверь и поправь в приложении, если что-то не так.`,
      };
    }

    case "journal":
    default: {
      const { entry, support } = await createJournalEntry(userId, text, { timezone });
      if (support) return { reply: supportMessageText(support.resources) };

      const proposals = await proposeFromJournal(entry.content, timezone);
      if (countProposals(proposals) === 0) return { reply: "📓 Записал в дневник." };

      await savePending(entry.id, userId, proposals);
      const lines = describeProposals(proposals, timezone).map((l) => `• ${l}`);
      return {
        reply: `📓 Записал в дневник. Из записи можно добавить:\n${lines.join("\n")}`,
        buttons: [
          [
            { text: "Добавить всё", callback_data: `jr:ok:${entry.id}` },
            { text: "Не нужно", callback_data: `jr:no:${entry.id}` },
          ],
        ],
      };
    }
  }
}

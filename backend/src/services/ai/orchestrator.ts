import {
  generateRouterOrSpecialistText,
  generateRouterOrSpecialistJson,
  generateVerifierText,
  verifyAgainstData,
} from "./textGeneration.js";
import { buildDailyContext, summarizeForPrompt } from "./contextBuilder.js";
import { isAiConfigured, isAnyAiConfigured } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { normalizeProposals, EMPTY_PROPOSALS, type JournalProposals } from "../journalExtraction.js";

// Раздел 36: единый AI Orchestrator, а не набор независимых чатов.
// Ниже — под-модули как отдельные функции. AI НЕ считает баланс/проценты/калории/
// количество задач сам — эти цифры вычисляются кодом и передаются AI как готовый контекст.
//
// Трёхслойная система (см. services/ai/textGeneration.ts):
//   [1]/[2] роутер и специалисты — generateRouterOrSpecialistText/Json (Gemini → Groq → Anthropic)
//   [3] verifier — generateVerifierText/Json + verifyAgainstData (всегда Anthropic),
//       применяется там, где AI формулирует вывод о реальных данных пользователя.

const ORCHESTRATOR_SYSTEM = `Ты — AI-модуль внутри приложения "AI Life Navigator".
Отвечай кратко, по делу, на русском языке, без воды и без психологических диагнозов.
Никогда не выдавай корреляцию за доказанную причинность.
Если данных недостаточно — так и скажи.

В контексте пользователя может быть поле personalPrinciples — это правила и качества,
которые сам пользователь сформулировал для себя в дневнике (например, "категоричность —
признак слабого ума"). Учитывай их не как факт для упоминания, а как рамку для СВОЕГО
собственного тона и формулировок: если там написано избегать категоричности — не будь
категоричным в ответе; если написано про какое-то качество, к которому он стремится —
пусть твой совет ему в этом помогает, а не противоречит.

Может также быть поле advisorVoice — это выжимка из "Портрета по дневнику" о том, в каком
тоне лучше разговаривать именно с этим человеком. Следуй ей, если она есть.`;

// Для слоя [3] (verifier) — функции, которые вызывают ИСКЛЮЧИТЕЛЬНО Anthropic
// (generateVerifierText/Json), им нужен именно этот ключ, а не любой из трёх.
function requireAnthropic() {
  if (!isAiConfigured()) {
    throw Object.assign(new Error("AI temporarily unavailable"), { code: "AI_NOT_CONFIGURED" });
  }
}

// Для слоёв [1]/[2] (роутер/специалист) — им достаточно ЛЮБОГО из трёх провайдеров,
// textGeneration.ts сам разберётся, через который именно идти (Gemini → Groq → Anthropic).
function requireAnyAi() {
  if (!isAnyAiConfigured()) {
    throw Object.assign(new Error("AI temporarily unavailable"), { code: "AI_NOT_CONFIGURED" });
  }
}

// ── [2] Специалист: распознавание еды из текста (раздел 15) ──
export async function parseFoodText(
  text: string
): Promise<Array<{ name: string; grams: number; calories: number; proteinG: number; fatG: number; carbsG: number }>> {
  const fallback = [{ name: text, grams: 0, calories: 0, proteinG: 0, fatG: 0, carbsG: 0 }];

  if (!isAnyAiConfigured()) {
    // Без AI-ключа — не блокируем пользователя, возвращаем одну позицию как есть,
    // с нулевым БЖУ, чтобы он мог поправить вручную (раздел 41: пользователь всегда может исправить).
    return fallback;
  }

  try {
    return await generateRouterOrSpecialistJson({
      system:
        "Ты распознаёшь продукты питания из свободного текста и оцениваешь их пищевую ценность. " +
        'Отвечай JSON-массивом объектов: [{"name": string, "grams": number, "calories": number, "proteinG": number, "fatG": number, "carbsG": number}]',
      prompt: text,
    });
  } catch (err) {
    console.error("[orchestrator] parseFoodText failed, falling back to raw entry:", err);
    return fallback;
  }
}

// ── [1] Роутер: разбор natural language в задачу/напоминание (раздел 2, 12) ──
export async function parseNaturalLanguageTask(text: string, nowIso: string) {
  requireAnyAi();
  return generateRouterOrSpecialistJson<{
    title: string;
    scheduledTime?: string;
    estimatedDurationMin?: number;
    priority?: "low" | "medium" | "high";
  }>({
    system: `Ты извлекаешь структурированную задачу из сообщения пользователя.
Текущее время: ${nowIso}. Возвращай ISO-даты. Если время не указано — не выдумывай его.`,
    prompt: text,
  });
}

// ── [2] Специалист: Decision Engine, Next Best Action (раздел 8, 29) ──
export async function nextBestAction(userId: string, availableMinutes?: number) {
  const context = await buildDailyContext(userId);

  if (!isAnyAiConfigured()) {
    // Fallback без AI: простое правило — ближайшая по времени задача с высоким приоритетом,
    // связанная с целью. Хуже, чем AI-версия, но не оставляет пользователя без ответа.
    const best = context.pendingTasks.find((t) => t.goalLinked) ?? context.pendingTasks[0];
    return {
      actions: best ? [best.title] : [],
      reasoning: "AI недоступен — показана ближайшая приоритетная задача без глубокого анализа.",
    };
  }

  const prompt = `Контекст пользователя:\n${summarizeForPrompt(context)}\n\nСвободное время сейчас: ${
    availableMinutes ?? "неизвестно"
  } минут.\n\nПредложи максимум 1–3 действия (раздел 8 ТЗ). Формат JSON: {"actions": string[], "reasoning": string}`;

  return generateRouterOrSpecialistJson<{ actions: string[]; reasoning: string }>({
    system: ORCHESTRATOR_SYSTEM,
    prompt,
  });
}

// ── [3] Daily Coach + verifier: «Почему я остановился?» (раздел 26) ──
export async function whyDidIStop(userId: string) {
  requireAnthropic(); // verifier-слой — всегда Anthropic, не любой провайдер
  const context = await buildDailyContext(userId);
  const prompt = `Контекст пользователя:\n${summarizeForPrompt(
    context
  )}\n\nПользователь спрашивает: "Почему я остановился?". Дай 2-3 вероятных фактора и одно конкретное предложение. Не ставь психологический диагноз.`;

  const draft = await generateVerifierText(ORCHESTRATOR_SYSTEM, prompt);
  // Шаг [3]: сверяем, что названные факторы (просроченные задачи, падение показателей
  // и т.д.) действительно подтверждаются контекстом, а не придуманы моделью.
  return verifyAgainstData(draft, context);
}

// ── [2] Специалист: свободный чат с использованием памяти пользователя ──
export async function chat(userId: string, message: string) {
  requireAnyAi();
  const context = await buildDailyContext(userId, message); // раздел 37: semantic search по сообщению
  const prompt = `Контекст пользователя:\n${summarizeForPrompt(context)}\n\nСообщение пользователя: ${message}`;
  const reply = await generateRouterOrSpecialistText({ system: ORCHESTRATOR_SYSTEM, prompt });

  // Персистентность диалога не хранится отдельной таблицей в MVP —
  // важные факты сохраняются через /memory endpoint по явному запросу пользователя.
  return reply;
}

// ── [2] Специалист: Дневник, извлечение устойчивых принципов из свободной записи ──
// Пример: пользователь пишет "категоричность — признак слабого ума", AI извлекает
// это как отдельное правило, которое дальше всегда попадает в контекст (не только
// по семантическому поиску, как обычные факты) — раздел "Дневник".
export async function extractPrinciplesFromJournal(text: string): Promise<string[]> {
  if (!isAnyAiConfigured()) return []; // без AI-ключа запись сохраняется как есть, без извлечения

  try {
    const result = await generateRouterOrSpecialistJson<{ principles: string[] }>({
      system:
        "Из записи дневника выдели только устойчивые личные принципы, ценности или качества, " +
        "к которым человек хочет стремиться или которых хочет избегать — то, на что он явно " +
        "указал как на правило для себя (например: «категоричность — признак слабого ума»). " +
        "Не включай разовые события, факты о дне или эмоции без обобщения. " +
        'Если таких принципов нет — верни пустой список. Формат: {"principles": string[]}. ' +
        "Каждый принцип формулируй кратко, от первого лица или как правило, на русском языке.",
      prompt: text,
    });
    return result.principles ?? [];
  } catch {
    return [];
  }
}

// ── [3] Специалист + verifier: Weekly/Monthly analysis (разделы 34-35) ──
export async function analyzePeriod(userId: string, period: "week" | "month") {
  requireAnthropic(); // verifier-слой — всегда Anthropic, не любой провайдер
  const days = period === "week" ? 7 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // БАГ (найден при аудите): раньше tasksTotal считал задачи, СОЗДАННЫЕ за период, а
  // tasksDone — ЗАВЕРШЁННЫЕ за период. Это разные множества задач: закрытие сегодня
  // задачи, заведённой месяц назад, легко давало отчёт вида "5 из 3 выполнено".
  // Теперь знаменатель — это "всё, с чем пользователь имел дело в этот период":
  // то, что он завершил, плюс то, что до сих пор открыто. done <= total гарантированно.
  const [tasksDone, tasksStillOpen, weightLogs, transactions] = await Promise.all([
    prisma.task.count({ where: { userId, status: "done", completedAt: { gte: since } } }),
    prisma.task.count({ where: { userId, status: { not: "done" } } }),
    prisma.weightLog.findMany({ where: { userId, date: { gte: since } }, orderBy: { date: "asc" } }),
    prisma.financialTransaction.findMany({ where: { userId, date: { gte: since } } }),
  ]);
  const tasksTotal = tasksDone + tasksStillOpen;

  const balance = transactions.reduce(
    (sum, t) => sum + (t.type === "income" ? t.amount : -t.amount),
    0
  );

  const rawStats = {
    tasksDone,
    tasksTotal,
    weightStart: weightLogs[0]?.weightKg ?? null,
    weightEnd: weightLogs[weightLogs.length - 1]?.weightKg ?? null,
    balance,
  };

  const prompt = `Статистика за период (посчитана кодом, не выдумывай числа): ${JSON.stringify(
    rawStats
  )}.\n\nСформируй краткий отчёт: что улучшилось, что ухудшилось, где прогресс, где застой, что мешает, что изменить.`;

  const draftSummary = await generateVerifierText(ORCHESTRATOR_SYSTEM, prompt);
  // Шаг [3]: отчёт с цифрами — ровно тот случай, где важно не поверить модели на слово.
  const aiSummary = await verifyAgainstData(draftSummary, rawStats);

  return { stats: rawStats, aiSummary };
}

// ── [1] Роутер: дневник как единый вход. Из свободной записи предлагаются задачи,
// напоминания, идеи, траты, вес и еда. AI только предлагает — сохраняет код после
// подтверждения пользователя (routes/journal.ts). Любой сбой AI = пустой список, а не ошибка:
// сама запись дневника уже сохранена и от разбора не зависит.
export async function proposeFromJournal(text: string, timezone: string): Promise<JournalProposals> {
  if (!isAnyAiConfigured()) return { ...EMPTY_PROPOSALS };

  let localNow: string;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "long",
    }).formatToParts(new Date());
    const g = (t: string) => parts.find((p) => p.type === t)!.value;
    localNow = `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")} (${g("weekday")})`;
  } catch {
    localNow = new Date().toISOString().slice(0, 16);
  }

  try {
    const raw = await generateRouterOrSpecialistJson<unknown>({
      system:
        "Ты помогаешь превратить запись личного дневника в конкретные записи приложения. " +
        "Предлагай ТОЛЬКО то, что человек явно написал; ничего не выдумывай и не додумывай. " +
        "Если сомневаешься — не предлагай. Рефлексия, чувства и рассуждения без конкретного действия — не задачи.\n" +
        `Текущее местное время пользователя: ${localNow}. ` +
        'Время указывай как МЕСТНОЕ, формат "YYYY-MM-DDTHH:mm", без часового пояса и без "Z".\n' +
        "Формат ответа (JSON, любое поле может быть пустым):\n" +
        '{"tasks":[{"title":string,"deadline":string|null}],' +
        '"reminders":[{"title":string,"triggerAt":string}],' +
        '"ideas":[{"content":string}],' +
        '"transactions":[{"type":"income"|"expense","amount":number,"category":string,"comment":string|null}],' +
        '"weight":{"weightKg":number}|null,' +
        '"food":[{"rawInput":string}]}\n' +
        "tasks — дела, которые человек собирается сделать. reminders — только если названо конкретное время " +
        "(«напомни завтра в 19:00»), иначе это задача. ideas — идеи, которые стоит сохранить. " +
        "transactions — суммы, которые человек потратил или получил; category одним-двумя словами по-русски. " +
        "weight — только если человек назвал свой вес сегодня. food — что человек съел сегодня, " +
        "переписанное как есть. Все тексты на русском.",
      prompt: text,
    });
    return normalizeProposals(raw, timezone);
  } catch (err) {
    console.error("[orchestrator] proposeFromJournal failed, returning no proposals:", err);
    return { ...EMPTY_PROPOSALS };
  }
}

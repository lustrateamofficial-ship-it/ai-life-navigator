import { prisma } from "../../db/prisma.js";
import { generateVerifierJson, verifyAgainstData } from "./textGeneration.js";
import { isAiConfigured } from "../../config/env.js";
import { detectCrisis } from "../distressDetection.js";

// "Портрет по дневнику" — то, что было сформулировано как запрос на "идеального клона
// советника". Сознательно называется иначе: это не клон и не диагноз, а отражение
// паттернов, которые видны в том, что человек сам написал — с опорой на конкретный
// текст, без клинических терминов, без утверждений о том, чего записи не подтверждают.
//
// Слой [3] (verifier/синтез) — вызывается редко (по кнопке или раз в месяц),
// поэтому остаётся на Anthropic, как и остальные дорогие синтез-функции.

const MIN_JOURNAL_ENTRIES = 3;

export interface PortraitContent {
  patterns: string[];
  statedPrinciples: string[];
  goalAlignment: string;
  advisorVoice: string;
}

const PORTRAIT_SYSTEM = `Ты анализируешь записи личного дневника человека, чтобы помочь ему
увидеть паттерны в собственных мыслях. Это НЕ психологическая диагностика и не клиническая
оценка — ты не ставишь диагнозов, не используешь клинические термины (тревожность,
депрессия и т.п.), не утверждаешь того, что записи явно не показывают.

Каждое наблюдение должно опираться на то, что человек реально написал — формулируй как
осторожное наблюдение ("судя по записям, ты часто...", "в нескольких записях видно..."),
а не как категоричный факт о личности. Если данных недостаточно для вывода — так и скажи,
не выдумывай.`;

export async function generateSelfPortrait(userId: string): Promise<
  { possible: true; content: PortraitContent } | { possible: false; reason: string }
> {
  if (!isAiConfigured()) {
    return { possible: false, reason: "AI не настроен на сервере." };
  }

  const [allJournalEntries, mission, goals, principles, memoryFacts] = await Promise.all([
    prisma.journalEntry.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.mission.findUnique({ where: { userId } }),
    prisma.goal.findMany({
      where: { userId },
      select: { title: true, reason: true, progress: true, status: true },
    }),
    prisma.memoryItem.findMany({ where: { userId, type: "principle" }, select: { content: true } }),
    prisma.memoryItem.findMany({
      where: { userId, type: { not: "principle" } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { content: true },
    }),
  ]);

  // Личные записи и записи о тяжёлом состоянии в портрет (то есть во внешнюю модель) не идут.
  const journalEntries = allJournalEntries.filter((e) => !e.isPrivate && !detectCrisis(e.content));

  if (journalEntries.length < MIN_JOURNAL_ENTRIES) {
    return {
      possible: false,
      reason: `Нужно хотя бы ${MIN_JOURNAL_ENTRIES} записи в дневнике, чтобы увидеть закономерности (подходящих для анализа сейчас: ${journalEntries.length}; личные записи не учитываются).`,
    };
  }

  const prompt = `Записи дневника (от новых к старым):
${journalEntries.map((e) => `- ${e.content}`).join("\n")}

Миссия: ${mission ? JSON.stringify({ whatToAchieve: mission.whatToAchieve, whyImportant: mission.whyImportant }) : "не указана"}
Цели: ${JSON.stringify(goals)}
Заявленные принципы: ${principles.map((p) => p.content).join("; ") || "нет"}
Другие факты о пользователе: ${memoryFacts.map((m) => m.content).join("; ") || "нет"}

Составь отражение в формате JSON:
{
  "patterns": string[] — 3-5 наблюдаемых паттернов в мышлении или поведении, КАЖДЫЙ с опорой на то, что конкретно в записях это показывает,
  "statedPrinciples": string[] — принципы и ценности, которые человек сам явно сформулировал,
  "goalAlignment": string — честный комментарий, совпадают ли реальные цели/прогресс с тем, что человек сам написал как важное для себя. Если данных мало — так и скажи,
  "advisorVoice": string — 2-3 предложения о том, в каком тоне и ключе AI должен давать советы именно этому человеку, исходя из того, как он сам о себе пишет
}`;

  const draft = await generateVerifierJson<PortraitContent>({ system: PORTRAIT_SYSTEM, prompt });

  // Шаг [3] — verifier: единственное поле с проверяемыми фактами здесь — goalAlignment
  // (оно ссылается на реальный прогресс целей). Остальные поля — интерпретация текста,
  // для них нет "объективных данных", с которыми можно сверить, кроме самого текста.
  const verifiedGoalAlignment = await verifyAgainstData(draft.goalAlignment, goals);

  const content: PortraitContent = { ...draft, goalAlignment: verifiedGoalAlignment };

  await prisma.selfPortrait.create({ data: { userId, content: content as any } });

  return { possible: true, content };
}

export async function getLatestPortrait(userId: string) {
  return prisma.selfPortrait.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
}

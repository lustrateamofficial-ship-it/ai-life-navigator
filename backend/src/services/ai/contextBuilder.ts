import { prisma } from "../../db/prisma.js";
import { semanticSearchMemory } from "./semanticMemory.js";
import { getLatestPortrait } from "./selfPortrait.js";

// Раздел 38 (AI Cost Control): "Не отправлять всю историю пользователя в каждый AI-запрос".
// Этот модуль собирает только то, что реально нужно для конкретного типа запроса.

export async function buildDailyContext(userId: string, relevantQuery?: string) {
  const [mission, activeGoals, todayTasks, latestWeight, memoryFacts, principles, latestPortrait] = await Promise.all([
    prisma.mission.findUnique({ where: { userId } }),
    prisma.goal.findMany({
      where: { userId, status: "active" },
      include: { stages: { where: { status: { in: ["active", "planned"] } }, take: 3 } },
      take: 5,
    }),
    prisma.task.findMany({
      where: { userId, status: { not: "done" } },
      orderBy: { scheduledTime: "asc" },
      take: 10,
    }),
    prisma.weightLog.findFirst({ where: { userId }, orderBy: { date: "desc" } }),
    // Раздел 37: если запрос известен (например, сообщение в чате) — берём top-K
    // релевантных фактов через Semantic Memory, а не просто "последние N".
    // Без relevantQuery (например, для утреннего дайджеста) — просто последние 15.
    relevantQuery
      ? semanticSearchMemory(userId, relevantQuery, 8)
      : prisma.memoryItem
          .findMany({ where: { userId, type: { not: "principle" } }, orderBy: { createdAt: "desc" }, take: 15 })
          .then((items) => items.map((m) => ({ content: m.content }))),
    // Дневник: принципы — это не "факт из истории", а устойчивое личное правило.
    // Попадают в КАЖДЫЙ AI-запрос целиком (не через поиск), но их обычно немного —
    // ограничиваем 40 штук на случай, если человек пишет дневник годами.
    prisma.memoryItem.findMany({
      where: { userId, type: "principle" },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { content: true },
    }),
    // Портрет по дневнику — берём только "advisorVoice" (как разговаривать), а не весь
    // портрет целиком: остальные поля (паттерны, goalAlignment) предназначены для экрана,
    // где человек сам их читает и может поправить, а не для накачки промпта на каждый чих.
    getLatestPortrait(userId),
  ]);

  return {
    mission: mission
      ? { whatToAchieve: mission.whatToAchieve, whyImportant: mission.whyImportant }
      : null,
    activeGoals: activeGoals.map((g) => ({
      title: g.title,
      progress: g.progress,
      nextStage: g.stages[0]?.title ?? null,
    })),
    pendingTasks: todayTasks.map((t) => ({
      title: t.title,
      priority: t.priority,
      estimatedDurationMin: t.estimatedDurationMin,
      scheduledTime: t.scheduledTime,
      goalLinked: Boolean(t.goalId),
    })),
    currentWeightKg: latestWeight?.weightKg ?? null,
    memoryFacts: memoryFacts.map((m) => m.content),
    // Личные принципы из дневника — AI должен учитывать их в тоне и содержании советов,
    // не просто знать о них как о факте.
    personalPrinciples: principles.map((p) => p.content),
    advisorVoice: (latestPortrait?.content as { advisorVoice?: string } | null)?.advisorVoice ?? null,
  };
}

// Summarization-заглушка для длинной истории (раздел 38: summarization + memory retrieval).
// В проде: суммаризировать старые daily summaries перед отправкой в промпт вместо сырых данных.
export function summarizeForPrompt(context: unknown): string {
  return JSON.stringify(context, null, 2);
}

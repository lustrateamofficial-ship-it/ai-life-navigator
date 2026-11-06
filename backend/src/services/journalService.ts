import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { extractPrinciplesFromJournal, parseFoodText } from "./ai/orchestrator.js";
import { embedMemoryItem } from "./ai/semanticMemory.js";
import { detectCrisis, supportResourcesForTimezone, type SupportResource } from "./distressDetection.js";
import { localDateOnly } from "../utils/userTime.js";

// Логика дневника, общая для приложения (routes/journal.ts) и бота (bot/naturalLanguageRouter.ts).
// Чтобы запись из чата вела себя так же, как запись из приложения: личные и тяжёлые записи
// не уходят во внешние AI, а подтверждённое создаётся одной и той же функцией.

export async function getUserTimezone(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  return user?.timezone ?? "UTC";
}

export interface CreatedEntry {
  entry: { id: string; content: string; isPrivate: boolean; createdAt: Date };
  principles: Array<{ id: string; content: string }>;
  support: { resources: SupportResource[] } | null;
}

export async function createJournalEntry(
  userId: string,
  content: string,
  opts: { private?: boolean; timezone?: string } = {}
): Promise<CreatedEntry> {
  const entry = await prisma.journalEntry.create({
    data: { userId, content, isPrivate: opts.private ?? false },
  });

  // Запись о тяжёлом состоянии не превращается в «принципы» и «задачи»: человеку в такой момент
  // нужна не обработка текста, а поддержка. Запись при этом сохраняется как любая другая.
  const crisis = detectCrisis(content);
  const support = crisis
    ? { resources: supportResourcesForTimezone(opts.timezone ?? (await getUserTimezone(userId))) }
    : null;

  const principleTexts = opts.private || crisis ? [] : await extractPrinciplesFromJournal(content);
  const principles: Array<{ id: string; content: string }> = [];
  for (const p of principleTexts) {
    const item = await prisma.memoryItem.create({
      data: { userId, type: "principle", content: p, sourceJournalEntryId: entry.id },
    });
    await embedMemoryItem(item.id, item.content); // чтобы принцип находился и через /memory/search
    principles.push({ id: item.id, content: item.content });
  }

  return { entry, principles, support };
}

// Клиент присылает обратно только то, что пользователь подтвердил. Данные проверяются заново:
// сервер не должен доверять телу запроса только потому, что раньше его сформировал он сам.
export const applySchema = z.object({
  tasks: z.array(z.object({ title: z.string().min(1).max(200), deadline: z.string().datetime().optional() })).max(10).default([]),
  reminders: z.array(z.object({ title: z.string().min(1).max(200), triggerAt: z.string().datetime() })).max(10).default([]),
  ideas: z.array(z.object({ content: z.string().min(1).max(500) })).max(10).default([]),
  transactions: z
    .array(
      z.object({
        type: z.enum(["income", "expense"]),
        amount: z.number().positive().max(1e9),
        category: z.string().min(1).max(60),
        comment: z.string().max(200).optional(),
      })
    )
    .max(10)
    .default([]),
  weight: z.object({ weightKg: z.number().min(20).max(400) }).nullable().optional(),
  food: z.array(z.object({ rawInput: z.string().min(1).max(200) })).max(10).default([]),
});

export type ApplyInput = z.infer<typeof applySchema>;

// Создаёт подтверждённое. Всё, кроме еды, пишется одной транзакцией БД: либо всё, либо ничего.
// Еда разбирается через AI заранее (медленный вызов нельзя держать внутри транзакции).
export async function applyProposals(userId: string, timezone: string, p: ApplyInput) {
  const today = localDateOnly(new Date(), timezone);

  const foodParsed: Array<{ raw: string; items: Awaited<ReturnType<typeof parseFoodText>> }> = [];
  for (const f of p.food) foodParsed.push({ raw: f.rawInput, items: await parseFoodText(f.rawInput) });

  await prisma.$transaction(async (tx) => {
    for (const t of p.tasks) {
      await tx.task.create({ data: { userId, title: t.title, deadline: t.deadline ? new Date(t.deadline) : undefined } });
    }
    for (const r of p.reminders) {
      await tx.reminder.create({ data: { userId, title: r.title, triggerAt: new Date(r.triggerAt) } });
    }
    for (const i of p.ideas) {
      await tx.idea.create({ data: { userId, content: i.content } });
    }
    for (const t of p.transactions) {
      await tx.financialTransaction.create({
        data: { userId, type: t.type, amount: t.amount, category: t.category, comment: t.comment, date: today },
      });
    }
    if (p.weight) {
      await tx.weightLog.upsert({
        where: { userId_date: { userId, date: today } },
        update: { weightKg: p.weight.weightKg },
        create: { userId, date: today, weightKg: p.weight.weightKg },
      });
    }
    for (const f of foodParsed) {
      await tx.foodLog.create({
        data: {
          userId,
          date: today,
          rawInput: f.raw,
          entries: {
            create: f.items.map((i) => ({
              nameOverride: i.name,
              grams: i.grams,
              calories: i.calories,
              proteinG: i.proteinG,
              fatG: i.fatG,
              carbsG: i.carbsG,
            })),
          },
        },
      });
    }
  });

  return {
    tasks: p.tasks.length,
    reminders: p.reminders.length,
    ideas: p.ideas.length,
    transactions: p.transactions.length,
    weight: p.weight ? 1 : 0,
    food: p.food.length,
  };
}

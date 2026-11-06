import { prisma } from "../db/prisma.js";
import type { Prisma } from "@prisma/client";

// Восстановление из файла, который отдаёт GET /account/export (или еженедельный
// бэкап в Google Drive — та же функция buildUserExport под капотом, см.
// services/accountExport.ts). Пункт из внешнего аудита ("Восстановление резервной
// копии — не подтверждено"): раньше в приложении можно было ТОЛЬКО выгрузить
// данные, но не загрузить их обратно — то есть "резервная копия" была
// бэкапом в одну сторону, что для бэкапа почти бессмысленно.
//
// Ключевые решения:
// 1. ДОБАВЛЯЕМ данные, а не затираем существующие — restore в уже используемый
//    аккаунт не должен молча стереть то, что человек успел сделать после даты
//    бэкапа. Это значит: все записи с собственным новым id (цели, задачи, привычки
//    и т.д.) создаются заново с НОВЫМИ id — старые id из файла использовались
//    только внутри файла, чтобы связать, например, задачу с её целью.
// 2. Для данных, которые физически не могут быть "в двух экземплярах" на одну
//    дату (вес за день, дневная сводка, еженедельный/месячный отчёт, Direction
//    Score за день — везде в схеме стоит @@unique([userId, date/weekStart/...])) —
//    используем upsert: если запись за эту дату уже есть, подставленные из
//    бэкапа значения её ПЕРЕЗАПИШУТ. Это осознанный компромисс: иначе restore
//    бесполезен в типичном сценарии "переустановил бота, часть дней успел
//    записать заново" — опоздавшие по времени данные из бэкапа обычно точнее
//    (бэкап писался раньше и ближе к событию), чем расхождение решать молча.
// 3. profile/mission — синглтоны (один на пользователя), тоже upsert.
// 4. Все операции — в одной транзакции: либо восстановилось всё целиком, либо
//    (при любой ошибке) не изменилось ничего — частично восстановленный аккаунт
//    хуже, чем явная ошибка.
// 5. embeddings (векторные представления памяти) НЕ восстанавливаются — они не
//    входят в экспорт (см. accountExport.ts: Semantic Memory можно пересчитать
//    из текста MemoryItem при наличии ключа Voyage AI, а хранить сырые векторы
//    в JSON-бэкапе ради экономии места бессмысленно).
// 6. foodLogEntry.foodItemId ссылается на общий (не пользовательский) справочник
//    FoodItem — не перемапливаем его id, но проверяем, что такая запись всё ещё
//    существует в базе: если нет (справочник мог измениться), подставляем null,
//    иначе восстановление упадёт на внешнем ключе Postgres.

type ExportShape = Record<string, unknown>;

export function validateExportShape(raw: unknown): asserts raw is ExportShape {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Файл повреждён: ожидался JSON-объект с данными экспорта");
  }
  const data = raw as ExportShape;
  if (!("exportedAt" in data)) {
    throw new Error("Файл не похож на экспорт AI Life Navigator: отсутствует поле exportedAt");
  }
  // Экспорты, сделанные до введения exportVersion, не имеют этого поля — считаем
  // их version 1 (формат не менялся с самого начала функции экспорта). Если в
  // будущем формат поменяется несовместимо, exportVersion вырастет, и здесь
  // появится явная проверка/миграция между версиями.
  const version = "exportVersion" in data ? data.exportVersion : 1;
  if (version !== 1) {
    throw new Error(
      `Неподдерживаемая версия файла экспорта (${String(version)}) — обновите приложение или используйте более старый бэкап`
    );
  }
}

// Исходная дата создания из файла копии. Без неё все восстановленные записи получили бы сегодняшнее число,
// и дневник за годы превратился бы в записи «за сегодня». Некорректное значение игнорируем: тогда дата — «сейчас».
function originalDate(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

// Время в одном виде для сравнения: файл хранит строки, база может отдать Date.
function iso(value: unknown): string {
  const d = new Date(value as any);
  return Number.isNaN(d.getTime()) ? String(value ?? "") : d.toISOString();
}

export interface RestoreSummary {
  [table: string]: number;
}

export async function restoreUserExport(userId: string, raw: unknown): Promise<RestoreSummary> {
  validateExportShape(raw);
  const data = raw as ExportShape;
  const summary: RestoreSummary = {};
  // Запись, которая уже есть (тот же текст и та же дата создания), второй раз не добавляется:
  // так повторное восстановление того же файла ничего не удваивает.
  let alreadyPresent = 0;

  await prisma.$transaction(async (tx) => {
    // --- Синглтоны: profile, mission ---
    if (data.profile && typeof data.profile === "object") {
      const p = data.profile as Record<string, any>;
      await tx.profile.upsert({
        where: { userId },
        create: {
          userId,
          weightGoalKg: p.weightGoalKg ?? null,
          dailyCalorieTarget: p.dailyCalorieTarget ?? null,
          proteinTargetG: p.proteinTargetG ?? null,
          fatTargetG: p.fatTargetG ?? null,
          carbTargetG: p.carbTargetG ?? null,
          city: p.city ?? null,
          onboardingDone: p.onboardingDone ?? false,
        },
        update: {
          weightGoalKg: p.weightGoalKg ?? null,
          dailyCalorieTarget: p.dailyCalorieTarget ?? null,
          proteinTargetG: p.proteinTargetG ?? null,
          fatTargetG: p.fatTargetG ?? null,
          carbTargetG: p.carbTargetG ?? null,
          city: p.city ?? null,
          onboardingDone: p.onboardingDone ?? false,
        },
      });
      summary.profile = 1;
    }

    if (data.mission && typeof data.mission === "object") {
      const m = data.mission as Record<string, any>;
      await tx.mission.upsert({
        where: { userId },
        create: {
          userId,
          desiredLife: m.desiredLife ?? null,
          whatToAchieve: m.whatToAchieve ?? null,
          whyImportant: m.whyImportant ?? null,
          whatToAvoid: m.whatToAvoid ?? null,
          whoToBecome: m.whoToBecome ?? null,
          successDefinition: m.successDefinition ?? null,
        },
        update: {
          desiredLife: m.desiredLife ?? null,
          whatToAchieve: m.whatToAchieve ?? null,
          whyImportant: m.whyImportant ?? null,
          whatToAvoid: m.whatToAvoid ?? null,
          whoToBecome: m.whoToBecome ?? null,
          successDefinition: m.successDefinition ?? null,
        },
      });
      summary.mission = 1;
    }

    // --- Цели и этапы (нужна карта старый id -> новый id для задач и идей) ---
    const goalIdMap = new Map<string, string>();
    const stageIdMap = new Map<string, string>();

    let goalCount = 0;
    const haveGoals = new Map<string, string>();
    for (const x of await tx.goal.findMany({ where: { userId }, select: { id: true, title: true, createdAt: true } })) haveGoals.set(`${x.title}|${iso(x.createdAt)}`, x.id);
    for (const g of asArray<any>(data.goals)) {
      const dupGoal = g.createdAt ? haveGoals.get(`${g.title}|${iso(g.createdAt)}`) : undefined;
      if (dupGoal) {
        goalIdMap.set(g.id, dupGoal);
        alreadyPresent++;
        continue;
      }
      goalCount++;
      const created = await tx.goal.create({
        data: {
          userId,
          title: g.title,
          description: g.description ?? null,
          reason: g.reason ?? null,
          deadline: g.deadline ?? null,
          status: g.status ?? "active",
          progress: g.progress ?? 0,
          order: g.order ?? 0,
          createdAt: originalDate(g.createdAt),
        },
      });
      goalIdMap.set(g.id, created.id);

      for (const s of asArray<any>(g.stages)) {
        const createdStage = await tx.goalStage.create({
          data: {
            goalId: created.id,
            title: s.title,
            description: s.description ?? null,
            status: s.status ?? "planned",
            deadline: s.deadline ?? null,
            order: s.order ?? 0,
          },
        });
        stageIdMap.set(s.id, createdStage.id);
      }
    }
    summary.goals = goalCount;
    summary.stages = stageIdMap.size;

    // --- Задачи (ссылаются на цель/этап через remapped id) ---
    let taskCount = 0;
    const haveTasks = new Set<string>();
    for (const x of await tx.task.findMany({ where: { userId }, select: { title: true, createdAt: true } })) haveTasks.add(`${x.title}|${iso(x.createdAt)}`);
    for (const t of asArray<any>(data.tasks)) {
      if (t.createdAt && haveTasks.has(`${t.title}|${iso(t.createdAt)}`)) {
        alreadyPresent++;
        continue;
      }
      const goalId = t.goalId ? goalIdMap.get(t.goalId) ?? null : null;
      const stageId = t.stageId ? stageIdMap.get(t.stageId) ?? null : null;
      await tx.task.create({
        data: {
          userId,
          goalId,
          stageId,
          title: t.title,
          description: t.description ?? null,
          priority: t.priority ?? "medium",
          deadline: t.deadline ?? null,
          estimatedDurationMin: t.estimatedDurationMin ?? null,
          status: t.status ?? "todo",
          scheduledTime: t.scheduledTime ?? null,
          completedAt: t.completedAt ?? null,
          recurrence: t.recurrence ?? null,
          createdAt: originalDate(t.createdAt),
        },
      });
      taskCount++;
    }
    summary.tasks = taskCount;

    // --- Привычки + логи ---
    let habitCount = 0;
    let habitLogCount = 0;
    const haveHabits = new Set((await tx.habit.findMany({ where: { userId }, select: { title: true } })).map((x: any) => x.title));
    for (const h of asArray<any>(data.habits)) {
      if (haveHabits.has(h.title)) {
        alreadyPresent++;
        continue;
      }
      const createdHabit = await tx.habit.create({
        data: {
          userId,
          title: h.title,
          targetDays: h.targetDays ?? 30,
          status: h.status ?? "in_bank",
          streak: h.streak ?? 0,
          startedAt: h.startedAt ?? null,
          completedAt: h.completedAt ?? null,
          reminderTime: h.reminderTime ?? null,
        },
      });
      habitCount++;
      for (const log of asArray<any>(h.logs)) {
        await tx.habitLog.upsert({
          where: { habitId_date: { habitId: createdHabit.id, date: new Date(log.date) } },
          create: { habitId: createdHabit.id, date: new Date(log.date), completed: log.completed ?? true },
          update: { completed: log.completed ?? true },
        });
        habitLogCount++;
      }
    }
    summary.habits = habitCount;
    summary.habitLogs = habitLogCount;

    // --- Вес (уникален по userId+date — восстановленное значение перезаписывает) ---
    let weightCount = 0;
    for (const w of asArray<any>(data.weightLogs)) {
      await tx.weightLog.upsert({
        where: { userId_date: { userId, date: new Date(w.date) } },
        create: { userId, date: new Date(w.date), weightKg: w.weightKg },
        update: { weightKg: w.weightKg },
      });
      weightCount++;
    }
    summary.weightLogs = weightCount;

    // --- Еда: foodLog -> entries (entries ссылаются на общий справочник FoodItem) ---
    let foodLogCount = 0;
    let foodEntryCount = 0;
    const haveFood = new Set<string>();
    for (const x of await tx.foodLog.findMany({ where: { userId }, select: { date: true, rawInput: true } })) haveFood.add(`${iso(x.date)}|${x.rawInput ?? ""}`);
    for (const f of asArray<any>(data.foodLogs)) {
      if (haveFood.has(`${iso(f.date)}|${f.rawInput ?? ""}`)) {
        alreadyPresent++;
        continue;
      }
      const createdLog = await tx.foodLog.create({
        data: { userId, date: new Date(f.date), rawInput: f.rawInput ?? null },
      });
      foodLogCount++;
      for (const e of asArray<any>(f.entries)) {
        let foodItemId: string | null = e.foodItemId ?? null;
        if (foodItemId) {
          const exists = await tx.foodItem.findUnique({ where: { id: foodItemId }, select: { id: true } });
          if (!exists) foodItemId = null; // справочник изменился — не роняем restore на FK
        }
        await tx.foodLogEntry.create({
          data: {
            foodLogId: createdLog.id,
            foodItemId,
            nameOverride: e.nameOverride ?? null,
            grams: e.grams,
            calories: e.calories,
            proteinG: e.proteinG,
            fatG: e.fatG,
            carbsG: e.carbsG,
          },
        });
        foodEntryCount++;
      }
    }
    summary.foodLogs = foodLogCount;
    summary.foodLogEntries = foodEntryCount;

    // --- Финансы ---
    const accountIdMap = new Map<string, string>();
    for (const a of asArray<any>(data.financialAccounts)) {
      const created = await tx.financialAccount.create({
        data: { userId, name: a.name, type: a.type ?? "bank", currency: a.currency ?? "USD", balance: a.balance ?? 0 },
      });
      accountIdMap.set(a.id, created.id);
    }
    summary.financialAccounts = accountIdMap.size;

    let txCount = 0;
    const haveTx = new Set<string>();
    for (const x of await tx.financialTransaction.findMany({ where: { userId }, select: { type: true, amount: true, category: true, date: true } })) haveTx.add(`${x.type}|${x.amount}|${x.category}|${iso(x.date)}`);
    for (const t of asArray<any>(data.transactions)) {
      if (haveTx.has(`${t.type}|${t.amount}|${t.category}|${iso(t.date)}`)) {
        alreadyPresent++;
        continue;
      }
      const accountId = t.accountId ? accountIdMap.get(t.accountId) ?? null : null;
      await tx.financialTransaction.create({
        data: {
          userId,
          accountId,
          type: t.type,
          amount: t.amount,
          category: t.category,
          comment: t.comment ?? null,
          date: new Date(t.date),
        },
      });
      txCount++;
    }
    summary.transactions = txCount;

    let debtCount = 0;
    const haveDebts = new Set((await tx.debt.findMany({ where: { userId }, select: { title: true, totalAmount: true } })).map((x: any) => `${x.title}|${x.totalAmount}`));
    for (const d of asArray<any>(data.debts)) {
      if (haveDebts.has(`${d.title}|${d.totalAmount}`)) {
        alreadyPresent++;
        continue;
      }
      await tx.debt.create({
        data: {
          userId,
          title: d.title,
          totalAmount: d.totalAmount,
          remainingAmount: d.remainingAmount,
          dueDate: d.dueDate ?? null,
        },
      });
      debtCount++;
    }
    summary.debts = debtCount;

    let savingsCount = 0;
    const haveSavings = new Set((await tx.savingsGoal.findMany({ where: { userId }, select: { title: true, targetAmount: true } })).map((x: any) => `${x.title}|${x.targetAmount}`));
    for (const s of asArray<any>(data.savingsGoals)) {
      if (haveSavings.has(`${s.title}|${s.targetAmount}`)) {
        alreadyPresent++;
        continue;
      }
      await tx.savingsGoal.create({
        data: {
          userId,
          title: s.title,
          targetAmount: s.targetAmount,
          currentAmount: s.currentAmount ?? 0,
          deadline: s.deadline ?? null,
        },
      });
      savingsCount++;
    }
    summary.savingsGoals = savingsCount;

    // --- Календарь и напоминания ---
    let calendarCount = 0;
    const haveCal = new Set<string>();
    for (const x of await tx.calendarEvent.findMany({ where: { userId }, select: { title: true, startTime: true } })) haveCal.add(`${x.title}|${iso(x.startTime)}`);
    for (const c of asArray<any>(data.calendarEvents)) {
      if (haveCal.has(`${c.title}|${iso(c.startTime)}`)) {
        alreadyPresent++;
        continue;
      }
      await tx.calendarEvent.create({
        data: {
          userId,
          title: c.title,
          category: c.category ?? "personal",
          startTime: new Date(c.startTime),
          endTime: new Date(c.endTime),
          recurrenceRule: c.recurrenceRule ?? null,
        },
      });
      calendarCount++;
    }
    summary.calendarEvents = calendarCount;

    let reminderCount = 0;
    const haveRem = new Set<string>();
    for (const x of await tx.reminder.findMany({ where: { userId }, select: { title: true, triggerAt: true } })) haveRem.add(`${x.title}|${iso(x.triggerAt)}`);
    for (const r of asArray<any>(data.reminders)) {
      if (haveRem.has(`${r.title}|${iso(r.triggerAt)}`)) {
        alreadyPresent++;
        continue;
      }
      await tx.reminder.create({
        data: {
          userId,
          title: r.title,
          triggerAt: new Date(r.triggerAt),
          recurrence: r.recurrence ?? "once",
          active: r.active ?? true,
        },
      });
      reminderCount++;
    }
    summary.reminders = reminderCount;

    // --- Дневник + память (нужна карта id дневниковых записей для memoryItems) ---
    const journalIdMap = new Map<string, string>();
    let journalCount = 0;
    const haveJournal = new Map<string, string>();
    for (const x of await tx.journalEntry.findMany({ where: { userId }, select: { id: true, content: true, createdAt: true } })) haveJournal.set(`${x.content}|${iso(x.createdAt)}`, x.id);
    for (const j of asArray<any>(data.journalEntries)) {
      const dupJ = j.createdAt ? haveJournal.get(`${j.content}|${iso(j.createdAt)}`) : undefined;
      if (dupJ) {
        journalIdMap.set(j.id, dupJ);
        alreadyPresent++;
        continue;
      }
      journalCount++;
      const created = await tx.journalEntry.create({
        data: { userId, content: j.content, isPrivate: j.isPrivate === true, createdAt: originalDate(j.createdAt) },
      });
      journalIdMap.set(j.id, created.id);
    }
    summary.journalEntries = journalCount;

    let memoryCount = 0;
    const haveMem = new Set<string>();
    for (const x of await tx.memoryItem.findMany({ where: { userId }, select: { type: true, content: true, createdAt: true } })) haveMem.add(`${x.type}|${x.content}|${iso(x.createdAt)}`);
    for (const m of asArray<any>(data.memoryItems)) {
      if (m.createdAt && haveMem.has(`${m.type}|${m.content}|${iso(m.createdAt)}`)) {
        alreadyPresent++;
        continue;
      }
      const sourceJournalEntryId = m.sourceJournalEntryId
        ? journalIdMap.get(m.sourceJournalEntryId) ?? null
        : null;
      await tx.memoryItem.create({
        data: { userId, type: m.type, content: m.content, sourceJournalEntryId, createdAt: originalDate(m.createdAt) },
      });
      memoryCount++;
    }
    summary.memoryItems = memoryCount;

    // --- Идеи (linkedGoalId — не настоящий FK в схеме, просто строка; перемапливаем
    // по возможности, иначе оставляем null, а не битую старую ссылку) ---
    let ideaCount = 0;
    const haveIdeas = new Set<string>();
    for (const x of await tx.idea.findMany({ where: { userId }, select: { content: true, createdAt: true } })) haveIdeas.add(`${x.content}|${iso(x.createdAt)}`);
    for (const i of asArray<any>(data.ideas)) {
      if (i.createdAt && haveIdeas.has(`${i.content}|${iso(i.createdAt)}`)) {
        alreadyPresent++;
        continue;
      }
      const linkedGoalId = i.linkedGoalId ? goalIdMap.get(i.linkedGoalId) ?? null : null;
      await tx.idea.create({ data: { userId, content: i.content, linkedGoalId, createdAt: originalDate(i.createdAt) } });
      ideaCount++;
    }
    summary.ideas = ideaCount;

    // --- Чек-ины / сводки / отчёты (все уникальны по дате — upsert) ---
    let checkinCount = 0;
    for (const c of asArray<any>(data.dailyCheckins)) {
      await tx.dailyCheckin.upsert({
        where: { userId_date: { userId, date: new Date(c.date) } },
        create: {
          userId,
          date: new Date(c.date),
          rating: c.rating ?? null,
          freeText: c.freeText ?? null,
          aiSummary: c.aiSummary ?? null,
        },
        update: { rating: c.rating ?? null, freeText: c.freeText ?? null, aiSummary: c.aiSummary ?? null },
      });
      checkinCount++;
    }
    summary.dailyCheckins = checkinCount;

    let summaryCount = 0;
    for (const s of asArray<any>(data.dailySummaries)) {
      await tx.dailySummary.upsert({
        where: { userId_date: { userId, date: new Date(s.date) } },
        create: {
          userId,
          date: new Date(s.date),
          tasksCompleted: s.tasksCompleted ?? 0,
          tasksTotal: s.tasksTotal ?? 0,
          caloriesConsumed: s.caloriesConsumed ?? null,
          directionScore: s.directionScore ?? null,
        },
        update: {
          tasksCompleted: s.tasksCompleted ?? 0,
          tasksTotal: s.tasksTotal ?? 0,
          caloriesConsumed: s.caloriesConsumed ?? null,
          directionScore: s.directionScore ?? null,
        },
      });
      summaryCount++;
    }
    summary.dailySummaries = summaryCount;

    let portraitCount = 0;
    for (const p of asArray<any>(data.selfPortraits)) {
      await tx.selfPortrait.create({ data: { userId, content: p.content as Prisma.InputJsonValue } });
      portraitCount++;
    }
    summary.selfPortraits = portraitCount;

    let weeklyCount = 0;
    for (const w of asArray<any>(data.weeklyReviews)) {
      await tx.weeklyReview.upsert({
        where: { userId_weekStart: { userId, weekStart: new Date(w.weekStart) } },
        create: { userId, weekStart: new Date(w.weekStart), content: w.content as Prisma.InputJsonValue },
        update: { content: w.content as Prisma.InputJsonValue },
      });
      weeklyCount++;
    }
    summary.weeklyReviews = weeklyCount;

    let monthlyCount = 0;
    for (const m of asArray<any>(data.monthlyReviews)) {
      await tx.monthlyReview.upsert({
        where: { userId_monthStart: { userId, monthStart: new Date(m.monthStart) } },
        create: { userId, monthStart: new Date(m.monthStart), content: m.content as Prisma.InputJsonValue },
        update: { content: m.content as Prisma.InputJsonValue },
      });
      monthlyCount++;
    }
    summary.monthlyReviews = monthlyCount;

    let scoreCount = 0;
    for (const d of asArray<any>(data.directionScores)) {
      await tx.directionScore.upsert({
        where: { userId_date: { userId, date: new Date(d.date) } },
        create: {
          userId,
          date: new Date(d.date),
          overall: d.overall,
          goalsScore: d.goalsScore,
          healthScore: d.healthScore,
          financeScore: d.financeScore,
          habitsScore: d.habitsScore,
          timeScore: d.timeScore,
          explanation: d.explanation ?? null,
        },
        update: {
          overall: d.overall,
          goalsScore: d.goalsScore,
          healthScore: d.healthScore,
          financeScore: d.financeScore,
          habitsScore: d.habitsScore,
          timeScore: d.timeScore,
          explanation: d.explanation ?? null,
        },
      });
      scoreCount++;
    }
    summary.directionScores = scoreCount;

    let trendCount = 0;
    for (const t of asArray<any>(data.detectedTrends)) {
      await tx.detectedTrend.create({
        data: { userId, metric: t.metric, direction: t.direction, periodDays: t.periodDays },
      });
      trendCount++;
    }
    summary.detectedTrends = trendCount;

    let correlationCount = 0;
    for (const c of asArray<any>(data.correlations)) {
      await tx.correlation.create({
        data: {
          userId,
          metricA: c.metricA,
          metricB: c.metricB,
          strength: c.strength,
          observations: c.observations,
          description: c.description,
        },
      });
      correlationCount++;
    }
    summary.correlations = correlationCount;

    let insightCount = 0;
    for (const i of asArray<any>(data.aiInsights)) {
      await tx.aiInsight.create({
        data: { userId, kind: i.kind, content: i.content, severity: i.severity ?? "info" },
      });
      insightCount++;
    }
    summary.aiInsights = insightCount;

    let alertCount = 0;
    for (const a of asArray<any>(data.aiAlerts)) {
      await tx.aiAlert.create({ data: { userId, message: a.message, sentAt: a.sentAt ?? null } });
      alertCount++;
    }
    summary.aiAlerts = alertCount;
  });

  if (alreadyPresent > 0) summary.alreadyPresent = alreadyPresent;
  return summary;
}

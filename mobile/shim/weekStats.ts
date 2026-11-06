// «Неделя в цифрах»: считается обычным кодом по данным на телефоне, без ИИ, ключей и интернета.
// Отдельный маршрут только для телефона; серверная версия приложения его не использует.
import { Router } from "express";
import { prisma } from "./prisma";
import { localDateOnly } from "../../backend/src/utils/userTime";
import { getTimezone } from "./server";
import { detectCrisis } from "../../backend/src/services/distressDetection";

export const weekRouter = Router();

const DAY = 86_400_000;

function dayKey(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export async function computeWeek(userId: string, now: Date, tz: string) {
  const from = new Date(now.getTime() - 7 * DAY);
  const prevFrom = new Date(now.getTime() - 14 * DAY);
  const fromDay = localDateOnly(new Date(now.getTime() - 6 * DAY), tz);
  const prevFromDay = localDateOnly(new Date(now.getTime() - 13 * DAY), tz);

  const entries = await prisma.journalEntry.findMany({ where: { userId, createdAt: { gte: prevFrom } }, select: { createdAt: true } });
  const thisEntries = entries.filter((e: any) => e.createdAt >= from);
  const prevEntries = entries.filter((e: any) => e.createdAt < from);
  const days = new Set(thisEntries.map((e: any) => dayKey(e.createdAt, tz)));

  const doneNow = await prisma.task.count({ where: { userId, status: "done", completedAt: { gte: from } } });
  const donePrev = await prisma.task.count({ where: { userId, status: "done", completedAt: { gte: prevFrom, lt: from } } });
  const created = await prisma.task.count({ where: { userId, createdAt: { gte: from } } });
  const open = await prisma.task.count({ where: { userId, status: { not: "done" } } });

  const checkins = await prisma.dailyCheckin.findMany({ where: { userId, date: { gte: fromDay }, rating: { not: null } }, select: { rating: true } });
  const mood = { good: 0, normal: 0, bad: 0 };
  for (const c of checkins as any[]) if (c.rating in mood) (mood as any)[c.rating]++;

  const weights = await prisma.weightLog.findMany({ where: { userId, date: { gte: fromDay } }, orderBy: { date: "asc" } });
  const weight =
    weights.length > 0
      ? { first: (weights[0] as any).weightKg as number, last: (weights[weights.length - 1] as any).weightKg as number, count: weights.length }
      : null;

  const tx = await prisma.financialTransaction.findMany({ where: { userId, date: { gte: fromDay } }, select: { type: true, amount: true } });
  let income = 0;
  let expenses = 0;
  for (const t of tx as any[]) {
    if (t.type === "income") income += t.amount;
    else if (t.type === "expense") expenses += t.amount;
  }

  const habitMarks = await prisma.habitLog.count({ where: { habit: { userId }, completed: true, date: { gte: fromDay } } });

  return {
    entries: { count: thisEntries.length, days: days.size, previousCount: prevEntries.length },
    tasks: { done: doneNow, donePrevious: donePrev, created, open },
    mood,
    weight,
    money: { income, expenses },
    habitMarks,
    previousFrom: prevFromDay.toISOString(),
  };
}

weekRouter.get("/", async (req: any, res: any) => {
  res.json(await computeWeek(req.userId!, new Date(), await getTimezone()));
});

// «Раньше»: запись из прошлого, чтобы человек увидел свой путь. Берём самый далёкий из подходящих сроков.
// Личные записи и тяжёлые по смыслу не показываем: главный экран могут увидеть посторонние,
// а неожиданное возвращение к тяжёлому дню не помогает.
const LOOKBACKS: Array<{ days: number; label: string }> = [
  { days: 365, label: "Год назад" },
  { days: 180, label: "Полгода назад" },
  { days: 90, label: "Три месяца назад" },
  { days: 30, label: "Месяц назад" },
  { days: 7, label: "Неделю назад" },
];

export async function findEarlier(userId: string, now: Date, tz: string) {
  const entries = await prisma.journalEntry.findMany({
    where: { userId, isPrivate: false, createdAt: { lt: new Date(now.getTime() - 6 * DAY) } },
    orderBy: { createdAt: "desc" },
    select: { id: true, content: true, createdAt: true },
  });
  for (const l of LOOKBACKS) {
    // Сначала ровно этот день, затем соседние (±1, ±2 дня): записи есть не каждый день, а возвращение к прошлому ценно.
    let hit: any = null;
    let exact = false;
    for (const shift of [0, -1, 1, -2, 2]) {
      const key = dayKey(new Date(now.getTime() - (l.days + shift) * DAY), tz);
      hit = (entries as any[]).find((e) => dayKey(e.createdAt, tz) === key && !detectCrisis(e.content));
      if (hit) {
        exact = shift === 0;
        break;
      }
    }
    if (hit) return { label: l.days === 365 && exact ? "Год назад, в этот день" : l.days === 365 ? "Около года назад" : l.label, id: hit.id, content: hit.content as string, createdAt: (hit.createdAt as Date).toISOString() };
  }
  return null;
}

weekRouter.get("/earlier", async (req: any, res: any) => {
  res.json({ entry: await findEarlier(req.userId!, new Date(), await getTimezone()) });
});

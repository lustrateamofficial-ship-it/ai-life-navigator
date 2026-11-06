// Бюджет по категориям: месячный лимит и сколько уже потрачено. Только для телефона.
import { Router } from "express";
import { prisma } from "./prisma";
import { monthBoundsInTimezone } from "../../backend/src/utils/userTime";
import { getTimezone } from "./server";
import { readBudget, writeBudget } from "./phoneExtras";

export const budgetRouter = Router();

const norm = (s: string) => s.trim().replace(/\s+/g, " ");
const key = (s: string) => norm(s).toLocaleLowerCase("ru-RU");

export async function budgetState(userId: string, now: Date, tz: string) {
  const { start, end } = monthBoundsInTimezone(now, tz);
  const tx = await prisma.financialTransaction.findMany({ where: { userId, type: "expense", date: { gte: start, lt: end } }, select: { amount: true, category: true } });
  const spentBy = new Map<string, { label: string; spent: number }>();
  for (const t of tx as any[]) {
    const k = key(t.category);
    const cur = spentBy.get(k) ?? { label: norm(t.category), spent: 0 };
    cur.spent += t.amount;
    spentBy.set(k, cur);
  }
  const limits = readBudget();
  const rows = Object.entries(limits).map(([category, limit]) => {
    const spent = spentBy.get(key(category))?.spent ?? 0;
    return { category, limit, spent, percent: Math.round((spent / limit) * 100) };
  });
  const limited = new Set(Object.keys(limits).map(key));
  const others = [...spentBy.entries()].filter(([k]) => !limited.has(k)).map(([, v]) => ({ category: v.label, spent: v.spent }));
  rows.sort((a, b) => b.percent - a.percent);
  others.sort((a, b) => b.spent - a.spent);
  return { limits: rows, others };
}

budgetRouter.get("/", async (req: any, res: any) => {
  res.json(await budgetState(req.userId!, new Date(), await getTimezone()));
});

// PUT /budget { category, limit }: limit пустой или 0 убирает лимит.
budgetRouter.put("/", async (req: any, res: any) => {
  const category = typeof req.body?.category === "string" ? norm(req.body.category) : "";
  const limit = Number(req.body?.limit);
  if (!category || category.length > 60) return res.status(400).json({ error: "Укажи категорию" });
  const limits = readBudget();
  for (const k of Object.keys(limits)) if (key(k) === key(category)) delete limits[k];
  if (isFinite(limit) && limit > 0) limits[category] = limit;
  else if (req.body?.limit !== null && req.body?.limit !== "" && req.body?.limit !== 0) return res.status(400).json({ error: "Лимит должен быть числом" });
  writeBudget(limits);
  res.json(await budgetState(req.userId!, new Date(), await getTimezone()));
});

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { monthBoundsInTimezone } from "../utils/userTime.js";

export const financeRouter = Router();

const txSchema = z.object({
  type: z.enum(["income", "expense"]),
  amount: z.number().positive().max(1_000_000_000),
  category: z.string().min(1),
  comment: z.string().optional(),
  date: z.string().datetime().optional(),
  accountId: z.string().uuid().optional(),
});

// БАГ (найден при аудите, IDOR): accountId раньше принимался от клиента без проверки
// принадлежности пользователю — можно было привязать свою транзакцию к чужому счёту.
async function assertOwnedAccount(userId: string, accountId?: string) {
  if (!accountId) return;
  const account = await prisma.financialAccount.findFirst({ where: { id: accountId, userId } });
  if (!account) throw Object.assign(new Error("Account not found"), { status: 400 });
}

async function userTimezone(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  return user?.timezone ?? "UTC";
}

// GET /finance/income + /finance/expenses share this handler via query.
// Границы месяца считаются по часовому поясу пользователя, а не сервера.
async function listTransactions(userId: string, type: "income" | "expense") {
  const { start, end } = monthBoundsInTimezone(new Date(), await userTimezone(userId));
  return prisma.financialTransaction.findMany({
    where: { userId, type, date: { gte: start, lt: end } },
    orderBy: { date: "desc" },
  });
}

financeRouter.get("/income", async (req, res) => {
  res.json(await listTransactions(req.userId!, "income"));
});

financeRouter.post("/income", async (req, res) => {
  const parsed = txSchema.omit({ type: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    await assertOwnedAccount(req.userId!, parsed.data.accountId);
  } catch {
    return res.status(400).json({ error: "Указанный счёт не найден" });
  }

  const tx = await prisma.financialTransaction.create({
    data: {
      userId: req.userId!,
      type: "income",
      ...parsed.data,
      date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
    },
  });
  res.status(201).json(tx);
});

financeRouter.get("/expenses", async (req, res) => {
  res.json(await listTransactions(req.userId!, "expense"));
});

financeRouter.post("/expenses", async (req, res) => {
  const parsed = txSchema.omit({ type: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    await assertOwnedAccount(req.userId!, parsed.data.accountId);
  } catch {
    return res.status(400).json({ error: "Указанный счёт не найден" });
  }

  const tx = await prisma.financialTransaction.create({
    data: {
      userId: req.userId!,
      type: "expense",
      ...parsed.data,
      date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
    },
  });
  res.status(201).json(tx);
});

// БАГ (найден при аудите): не было способа удалить ошибочно внесённую транзакцию.
financeRouter.delete("/transactions/:id", async (req, res) => {
  const existing = await prisma.financialTransaction.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  await prisma.financialTransaction.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// GET /finance/debts
financeRouter.get("/debts", async (req, res) => {
  res.json(await prisma.debt.findMany({ where: { userId: req.userId! } }));
});

financeRouter.post("/debts", async (req, res) => {
  const schema = z.object({
    title: z.string().min(1),
    totalAmount: z.number().positive().max(1_000_000_000),
    remainingAmount: z.number().nonnegative().max(1_000_000_000),
    dueDate: z.string().datetime().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const debt = await prisma.debt.create({
    data: {
      userId: req.userId!,
      ...parsed.data,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
    },
  });
  res.status(201).json(debt);
});

// PUT /finance/debts/:id — чаще всего нужно для обновления remainingAmount по мере выплаты
financeRouter.put("/debts/:id", async (req, res) => {
  const existing = await prisma.debt.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const schema = z.object({
    title: z.string().min(1).optional(),
    totalAmount: z.number().positive().optional(),
    remainingAmount: z.number().nonnegative().optional(),
    dueDate: z.string().datetime().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const data: any = { ...parsed.data };
  if (parsed.data.dueDate) data.dueDate = new Date(parsed.data.dueDate);

  res.json(await prisma.debt.update({ where: { id: req.params.id }, data }));
});

financeRouter.delete("/debts/:id", async (req, res) => {
  const existing = await prisma.debt.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  await prisma.debt.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// GET /finance/savings
financeRouter.get("/savings", async (req, res) => {
  res.json(await prisma.savingsGoal.findMany({ where: { userId: req.userId! } }));
});

financeRouter.post("/savings", async (req, res) => {
  const schema = z.object({
    title: z.string().min(1),
    targetAmount: z.number().positive().max(1_000_000_000),
    currentAmount: z.number().nonnegative().max(1_000_000_000).optional(),
    deadline: z.string().datetime().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const goal = await prisma.savingsGoal.create({
    data: {
      userId: req.userId!,
      ...parsed.data,
      deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : undefined,
    },
  });
  res.status(201).json(goal);
});

// PUT /finance/savings/:id — чаще всего нужно для пополнения currentAmount
financeRouter.put("/savings/:id", async (req, res) => {
  const existing = await prisma.savingsGoal.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const schema = z.object({
    title: z.string().min(1).optional(),
    targetAmount: z.number().positive().optional(),
    currentAmount: z.number().nonnegative().max(1_000_000_000).optional(),
    deadline: z.string().datetime().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const data: any = { ...parsed.data };
  if (parsed.data.deadline) data.deadline = new Date(parsed.data.deadline);

  res.json(await prisma.savingsGoal.update({ where: { id: req.params.id }, data }));
});

financeRouter.delete("/savings/:id", async (req, res) => {
  const existing = await prisma.savingsGoal.findFirst({ where: { id: req.params.id, userId: req.userId! } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  await prisma.savingsGoal.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// GET /finance/dashboard — сводка (раздел 17)
financeRouter.get("/dashboard", async (req, res) => {
  const { start } = monthBoundsInTimezone(new Date(), await userTimezone(req.userId!));

  const [income, expenses, savings, debts] = await Promise.all([
    prisma.financialTransaction.aggregate({
      where: { userId: req.userId!, type: "income", date: { gte: start } },
      _sum: { amount: true },
    }),
    prisma.financialTransaction.aggregate({
      where: { userId: req.userId!, type: "expense", date: { gte: start } },
      _sum: { amount: true },
    }),
    prisma.savingsGoal.aggregate({ where: { userId: req.userId! }, _sum: { currentAmount: true } }),
    prisma.debt.aggregate({ where: { userId: req.userId! }, _sum: { remainingAmount: true } }),
  ]);

  const incomeSum = income._sum.amount ?? 0;
  const expenseSum = expenses._sum.amount ?? 0;

  res.json({
    income: incomeSum,
    expenses: expenseSum,
    balance: incomeSum - expenseSum,
    saved: savings._sum.currentAmount ?? 0,
    debts: debts._sum.remainingAmount ?? 0,
  });
});

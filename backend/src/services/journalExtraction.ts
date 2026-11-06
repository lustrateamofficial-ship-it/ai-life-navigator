import { localDateTimeToUtc } from "../utils/userTime.js";

// Разбор записи дневника на конкретные сущности (задачи, напоминания, идеи, траты, вес, еда).
// AI только ПРЕДЛАГАЕТ — в базу ничего не попадает, пока пользователь не подтвердит
// (см. routes/journal.ts: /analyze ничего не создаёт, /apply создаёт только выбранное).
//
// Этот файл — чистые функции без обращений к БД и AI, чтобы их можно было покрыть тестами:
// ответ языковой модели нельзя считать надёжным, поэтому всё, что она вернула, проходит
// через normalizeProposals — невалидное отбрасывается, а не чинится догадками.

export interface JournalProposals {
  tasks: Array<{ title: string; deadline?: string }>;
  reminders: Array<{ title: string; triggerAt: string }>;
  ideas: Array<{ content: string }>;
  transactions: Array<{ type: "income" | "expense"; amount: number; category: string; comment?: string }>;
  weight: { weightKg: number } | null;
  food: Array<{ rawInput: string }>;
}

export const EMPTY_PROPOSALS: JournalProposals = {
  tasks: [],
  reminders: [],
  ideas: [],
  transactions: [],
  weight: null,
  food: [],
};

const MAX_PER_KIND = 10;
const MAX_TEXT = 200;
const MIN_WEIGHT_KG = 20;
const MAX_WEIGHT_KG = 400;

function cleanText(v: unknown, max = MAX_TEXT): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  if (!t) return null;
  return t.slice(0, max);
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v.slice(0, MAX_PER_KIND) : [];
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function dedupeBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const k = key(i).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// raw — то, что вернула модель. Местное время AI возвращает как "YYYY-MM-DDTHH:mm"
// (без смещения), здесь оно переводится в UTC по часовому поясу пользователя.
export function normalizeProposals(raw: unknown, timezone: string, now: Date = new Date()): JournalProposals {
  const root = asRecord(raw);
  if (!root) return { ...EMPTY_PROPOSALS };

  const tasks: JournalProposals["tasks"] = [];
  for (const item of asArray(root.tasks)) {
    const r = asRecord(item);
    const title = cleanText(r?.title);
    if (!title) continue;
    const task: { title: string; deadline?: string } = { title };
    if (typeof r?.deadline === "string") {
      const d = localDateTimeToUtc(r.deadline, timezone);
      if (d) task.deadline = d.toISOString(); // прошедший дедлайн не отбрасываем: человек мог написать «вчера забыл»
    }
    tasks.push(task);
  }

  const reminders: JournalProposals["reminders"] = [];
  for (const item of asArray(root.reminders)) {
    const r = asRecord(item);
    const title = cleanText(r?.title);
    const when = typeof r?.triggerAt === "string" ? localDateTimeToUtc(r.triggerAt, timezone) : null;
    // Напоминание без внятного времени или в прошлом бесполезно — такое не предлагаем
    // (человек увидит это как обычную задачу, если модель вернула её в tasks).
    if (!title || !when || when.getTime() <= now.getTime()) continue;
    reminders.push({ title, triggerAt: when.toISOString() });
  }

  const ideas: JournalProposals["ideas"] = [];
  for (const item of asArray(root.ideas)) {
    const r = asRecord(item);
    const content = cleanText(r?.content, 500);
    if (content) ideas.push({ content });
  }

  const transactions: JournalProposals["transactions"] = [];
  for (const item of asArray(root.transactions)) {
    const r = asRecord(item);
    const amount = typeof r?.amount === "number" ? r.amount : NaN;
    const type = r?.type === "income" || r?.type === "expense" ? r.type : null;
    const category = cleanText(r?.category, 60);
    if (!type || !category || !Number.isFinite(amount) || amount <= 0 || amount > 1e9) continue;
    const comment = cleanText(r?.comment);
    transactions.push({ type, amount, category, ...(comment ? { comment } : {}) });
  }

  let weight: JournalProposals["weight"] = null;
  const w = asRecord(root.weight);
  if (w && typeof w.weightKg === "number" && w.weightKg >= MIN_WEIGHT_KG && w.weightKg <= MAX_WEIGHT_KG) {
    weight = { weightKg: Math.round(w.weightKg * 10) / 10 };
  }

  const food: JournalProposals["food"] = [];
  for (const item of asArray(root.food)) {
    const r = asRecord(item);
    const rawInput = cleanText(r?.rawInput);
    if (rawInput) food.push({ rawInput });
  }

  return {
    tasks: dedupeBy(tasks, (t) => t.title),
    reminders: dedupeBy(reminders, (t) => `${t.title}|${t.triggerAt}`),
    ideas: dedupeBy(ideas, (t) => t.content),
    transactions,
    weight,
    food: dedupeBy(food, (t) => t.rawInput),
  };
}

export function countProposals(p: JournalProposals): number {
  return p.tasks.length + p.reminders.length + p.ideas.length + p.transactions.length + (p.weight ? 1 : 0) + p.food.length;
}

function fmtWhen(iso: string, timezone: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", { timeZone: timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

// Человекочитаемый список предложений на русском (для бота: там нет галочек, только текст и кнопки).
export function describeProposals(p: JournalProposals, timezone: string): string[] {
  const lines: string[] = [];
  for (const t of p.tasks) lines.push(`Задача: ${t.title}${t.deadline ? ` (до ${fmtWhen(t.deadline, timezone)})` : ""}`);
  for (const r of p.reminders) lines.push(`Напоминание: ${r.title}, ${fmtWhen(r.triggerAt, timezone)}`);
  for (const i of p.ideas) lines.push(`Идея: ${i.content}`);
  for (const t of p.transactions) lines.push(`${t.type === "income" ? "Доход" : "Расход"}: ${t.amount}, ${t.category}`);
  if (p.weight) lines.push(`Вес сегодня: ${p.weight.weightKg} кг`);
  for (const f of p.food) lines.push(`Приём пищи: ${f.rawInput}`);
  return lines;
}

// В чате с ботом нет переключателя «Личная запись», поэтому личной запись становится по префиксу:
// «Личное: ...» или «Личная запись - ...». Префикс убирается из сохраняемого текста.
export function parsePrivatePrefix(text: string): { text: string; isPrivate: boolean } {
  const m = /^\s*(личное|личная запись|личная)\s*[:\-—–]\s*/i.exec(text);
  if (!m) return { text, isPrivate: false };
  const rest = text.slice(m[0].length).trim();
  // «Личное:» без текста не считаем префиксом, иначе запись окажется пустой.
  return rest ? { text: rest, isPrivate: true } : { text, isPrivate: false };
}

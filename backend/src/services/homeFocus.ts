// Главный экран: «что мне сейчас полезно». Всё здесь считается кодом по реальным данным,
// без AI: подсказка не может оказаться выдумкой, и экран работает без ключей и лимитов.
// Чистые функции без обращений к БД — чтобы покрыть тестами.

export interface HomeTaskInput {
  id: string;
  title: string;
  priority: "low" | "medium" | "high";
  status: string;
  deadline: Date | null;
  scheduledTime: Date | null;
}

export interface HomeReminderInput {
  title: string;
  triggerAt: Date;
}

export interface HomeFocus {
  focusTasks: Array<{ id: string; title: string; reason: "overdue" | "today" | "priority" | "open" }>;
  overdueCount: number;
  openCount: number;
  nextReminder: { title: string; triggerAt: string } | null;
  // today_empty — сегодня записей ещё нет; first — дневник ещё пуст.
  journalNudge: "none" | "today_empty" | "first";
  journalDaysSince: number | null;
}

export function localDayKey(date: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const g = (t: string) => parts.find((p) => p.type === t)!.value;
    return `${g("year")}-${g("month")}-${g("day")}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const MAX_FOCUS = 3;
const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

export function buildHomeFocus(params: {
  tasks: HomeTaskInput[];
  reminders: HomeReminderInput[];
  lastJournalAt: Date | null;
  now: Date;
  timezone: string;
}): HomeFocus {
  const { now, timezone } = params;
  const todayKey = localDayKey(now, timezone);

  const open = params.tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");

  const classified = open.map((t) => {
    const overdue = t.deadline !== null && t.deadline.getTime() < now.getTime();
    const dueToday =
      (t.deadline !== null && localDayKey(t.deadline, timezone) === todayKey) ||
      (t.scheduledTime !== null && localDayKey(t.scheduledTime, timezone) === todayKey);
    const reason: HomeFocus["focusTasks"][number]["reason"] = overdue
      ? "overdue"
      : dueToday
        ? "today"
        : t.priority === "high"
          ? "priority"
          : "open";
    return { task: t, reason };
  });

  const REASON_RANK = { overdue: 0, today: 1, priority: 2, open: 3 } as const;
  classified.sort((a, b) => {
    if (REASON_RANK[a.reason] !== REASON_RANK[b.reason]) return REASON_RANK[a.reason] - REASON_RANK[b.reason];
    if (PRIORITY_RANK[a.task.priority] !== PRIORITY_RANK[b.task.priority]) {
      return PRIORITY_RANK[a.task.priority] - PRIORITY_RANK[b.task.priority];
    }
    const da = (a.task.deadline ?? a.task.scheduledTime)?.getTime() ?? Infinity;
    const db = (b.task.deadline ?? b.task.scheduledTime)?.getTime() ?? Infinity;
    return da - db;
  });

  const upcoming = params.reminders
    .filter((r) => r.triggerAt.getTime() > now.getTime() && r.triggerAt.getTime() - now.getTime() <= REMINDER_WINDOW_MS)
    .sort((a, b) => a.triggerAt.getTime() - b.triggerAt.getTime())[0];

  let journalNudge: HomeFocus["journalNudge"] = "none";
  let journalDaysSince: number | null = null;
  if (!params.lastJournalAt) {
    journalNudge = "first";
  } else {
    journalDaysSince = Math.max(0, dayDiff(todayKey, localDayKey(params.lastJournalAt, timezone)));
    if (journalDaysSince > 0) journalNudge = "today_empty";
  }

  return {
    focusTasks: classified.slice(0, MAX_FOCUS).map((c) => ({ id: c.task.id, title: c.task.title, reason: c.reason })),
    overdueCount: classified.filter((c) => c.reason === "overdue").length,
    openCount: open.length,
    nextReminder: upcoming ? { title: upcoming.title, triggerAt: upcoming.triggerAt.toISOString() } : null,
    journalNudge,
    journalDaysSince,
  };
}

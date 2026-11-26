// Серия дней. День засчитывается, когда все задачи дня закрыты (задач было не ноль): запланированные на сегодня,
// по сроку, по времени и выбранные в плане. Засчитанные дни запоминаются, поэтому серия не пропадает,
// если позже в тот же день добавить ещё задачу. Серия идёт подряд до сегодня (или до вчера, пока сегодняшний день ещё не закрыт).
import { dayProgress } from "./charts";
import { dayKey } from "./dayKey";
import * as core from "./streakCore";
export { MAX_SKIPS_PER_WEEK } from "./streakCore";
import { prisma } from "../shim/prisma";

const KEY = "navigator:streak-days";
const SKIPS = "navigator:streak-skips";
const BACKFILLED = "navigator:streak-backfilled";
export const streakEvent = "navigator:streak";

export function readStreakDays(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x)) : [];
  } catch {
    return [];
  }
}

const isKey = (x: unknown): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);

/** Дни, которые человек пропустил осознанно: серию они не прерывают, но и не прибавляют. */
export function readSkips(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SKIPS) ?? "[]");
    return Array.isArray(v) ? v.filter(isKey) : [];
  } catch {
    return [];
  }
}

function writeSkips(list: string[]) {
  try {
    localStorage.setItem(SKIPS, JSON.stringify([...new Set(list)].sort().slice(-120)));
  } catch {
    /* хранилище недоступно */
  }
  try {
    window.dispatchEvent(new Event(streakEvent));
  } catch {
    /* нет окна */
  }
}

export const streakFrom = (days: string[], now = new Date(), skips: string[] = readSkips()) => core.streakFrom(days, now, skips);
export const bestStreakFrom = (days: string[], skips: string[] = readSkips()) => core.bestStreakFrom(days, skips);
/** Сколько пропусков ещё доступно: не больше двух за последние семь дней (включая сегодня). */
export const skipsLeft = (now = new Date(), skips: string[] = readSkips()) => core.skipsLeft(now, skips);

export const readStreak = (now = new Date()) => streakFrom(readStreakDays(), now);

export const isSkipped = (now = new Date()) => readSkips().includes(dayKey(now));

/** Пропустить сегодняшний день без потери серии. Возвращает false, если лимит исчерпан. */
export function skipToday(now = new Date()): boolean {
  const skips = readSkips();
  const k = dayKey(now);
  if (skips.includes(k)) return true;
  if (skipsLeft(now, skips) <= 0) return false;
  writeSkips([...skips, k]);
  return true;
}

export function unskipToday(now = new Date()) {
  const k = dayKey(now);
  writeSkips(readSkips().filter((x) => x !== k));
}

/** Восстановление из копии: пропуски объединяются с имеющимися. */
export function mergeSkips(incoming: unknown[]) {
  writeSkips([...readSkips(), ...incoming.filter(isKey)]);
}

/**
 * Один раз заполняет прошлое серии по выполненным задачам. День засчитывается, если в него была закрыта хотя бы одна
 * задача и ни одна задача с этим сроком или временем так и не закрыта. Сегодняшний день не трогаем: он считается как обычно.
 */
export async function backfillStreak(now = new Date()): Promise<number> {
  try {
    if (localStorage.getItem(BACKFILLED) === "1") return 0;
    const all = await prisma.task.findMany({});
    const today = dayKey(now);
    const doneDays = new Set<string>();
    const blocked = new Set<string>();
    for (const t of all) {
      if (t.status === "cancelled") continue;
      if (t.status === "done") {
        if (t.completedAt) doneDays.add(dayKey(new Date(t.completedAt)));
        continue;
      }
      if (t.scheduledTime) blocked.add(dayKey(new Date(t.scheduledTime)));
      if (t.deadline) blocked.add(dayKey(new Date(t.deadline)));
    }
    const add = [...doneDays].filter((k) => k < today && !blocked.has(k));
    try {
      localStorage.setItem(BACKFILLED, "1");
    } catch {
      /* хранилище недоступно: заполним при следующем запуске */
    }
    if (add.length) mergeStreakDays(add);
    return add.length;
  } catch {
    return 0;
  }
}

/** Проверяет сегодняшний день и, если все задачи закрыты, запоминает его. Возвращает текущую серию. */
export async function recordDayDone(now = new Date()): Promise<number> {
  try {
    const p = await dayProgress(now);
    if (p.total > 0 && p.done === p.total) {
      const days = readStreakDays();
      const k = dayKey(now);
      if (!days.includes(k)) {
        const next = [...days, k].sort().slice(-400);
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
        } catch {
          /* хранилище недоступно: серия не сохранится */
        }
        try {
          window.dispatchEvent(new Event(streakEvent));
        } catch {
          /* нет окна */
        }
      }
    }
  } catch {
    /* задачи недоступны: серию не трогаем */
  }
  return readStreak(now);
}

/** Восстановление из копии: добавляет дни, не стирая то, что уже есть. */
export function mergeStreakDays(incoming: unknown[]) {
  const ok = incoming.filter((x): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x));
  const next = [...new Set([...readStreakDays(), ...ok])].sort().slice(-400);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* хранилище недоступно */
  }
}


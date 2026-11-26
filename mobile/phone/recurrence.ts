// Повторы напоминаний. Следующий срабатывает по исходному числу месяца: 31 января → 28 февраля → 31 марта,
// а не «съезжает» на 28-е навсегда. Исходное число запоминается на телефоне.
import { computeNextTrigger } from "../../backend/src/utils/reminderRecurrence";

const KEY = "navigator:reminder-anchors";

function read(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

const daysIn = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

/** Исходное число месяца для напоминания. Если срок вручную перенесли на другую дату, запомненное число сбрасывается. */
export function anchorFor(id: string, current: Date): number {
  const stored = read()[id];
  if (stored && current.getDate() === Math.min(stored, daysIn(current))) return stored;
  return current.getDate();
}

function remember(id: string, day: number) {
  try {
    const m = read();
    if (m[id] === day) return;
    m[id] = day;
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* число не запомнится: повтор будет считаться от текущей даты */
  }
}

export function nextTrigger(id: string, current: Date, recurrence: string): Date {
  if (recurrence !== "monthly") return computeNextTrigger(current, recurrence);
  const anchor = anchorFor(id, current);
  remember(id, anchor);
  return computeNextTrigger(current, recurrence, anchor);
}

/** Все срабатывания напоминания внутри [from, to). Для повторяющихся считаются вперёд от ближайшего срока. */
export function occurrencesIn(r: { id: string; triggerAt: Date | string; recurrence?: string | null }, from: Date, to: Date): Date[] {
  const out: Date[] = [];
  let at = new Date(r.triggerAt);
  const rec = r.recurrence ?? "once";
  for (let guard = 0; guard < 400 && at < to; guard++) {
    if (at >= from) out.push(at);
    if (rec === "once") break;
    at = nextTrigger(r.id, at, rec);
  }
  return out;
}

import { localDateOnly } from "./userTime.js";

// Первый срок повторяющейся задачи: полдень (UTC) сегодняшнего дня по часовому поясу пользователя, как у срока,
// выбранного в списке дат. Для «по будням» и «по выходным» сдвигается на ближайший подходящий день.
export function firstOccurrence(now: Date, recurrence: string, timezone: string): Date {
  const d = new Date(localDateOnly(now, timezone).getTime() + 12 * 3600_000);
  const bad = (x: Date) => (recurrence === "weekdays" ? [0, 6].includes(x.getUTCDay()) : recurrence === "weekends" ? ![0, 6].includes(x.getUTCDay()) : false);
  let guard = 0;
  while (bad(d) && guard++ < 7) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

// Чистые правила серии дней (без хранилища и экрана): их проверяют модульные тесты.
import { dayKey } from "./dayKey";

/** Сколько дней можно пропустить за любые семь дней подряд. */
export const MAX_SKIPS_PER_WEEK = 2;

export function streakFrom(days: string[], now: Date, skips: string[]): number {
  const set = new Set(days);
  const skip = new Set(skips);
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  if (!set.has(dayKey(d)) && !skip.has(dayKey(d))) d.setDate(d.getDate() - 1); // сегодня ещё не закрыт: серия держится со вчера
  let n = 0;
  for (let guard = 0; guard < 2000; guard++) {
    const k = dayKey(d);
    if (set.has(k)) n++;
    else if (!skip.has(k)) break;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** Сколько пропусков ещё доступно: не больше двух за последние семь дней (включая сегодня). */
export function skipsLeft(now: Date, skips: string[]): number {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 12);
  const used = skips.filter((k) => k >= dayKey(from) && k <= dayKey(now)).length;
  return Math.max(0, MAX_SKIPS_PER_WEEK - used);
}

/** Самая длинная серия подряд за всё время. */
export function bestStreakFrom(days: string[], skips: string[]): number {
  const sorted = [...new Set(days)].sort();
  const skip = new Set(skips);
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const k of sorted) {
    const [y, m, d] = k.split("-").map(Number);
    const cur = new Date(y!, m! - 1, d!, 12);
    // пропущенные дни между двумя закрытыми не рвут серию
    let gapOk = false;
    if (prev) {
      const gap = Math.round((cur.getTime() - prev.getTime()) / 86400000);
      gapOk = gap === 1;
      if (!gapOk && gap > 1) {
        gapOk = true;
        for (let i = 1; i < gap; i++) {
          const x = new Date(prev);
          x.setDate(x.getDate() + i);
          if (!skip.has(dayKey(x))) gapOk = false;
        }
      }
    }
    run = prev && gapOk ? run + 1 : 1;
    best = Math.max(best, run);
    prev = cur;
  }
  return best;
}

// Правила плитки «Неделя»: понедельник недели и уровень каждого дня. Без экрана и запросов: их проверяют модульные тесты.
export const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Понедельник текущей недели (по местному времени).
export function weekStart(now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

// Дата без времени ("2026-11-23…") из записей веса и привычек хранится как день, поэтому берём её как есть, без сдвига часовым поясом.
export const dateOnly = (s: string) => s.slice(0, 10);

// Уровень дня: сколько видов дел было (запись в дневнике, закрытая задача, вес, отметка привычки):
// 0 — пусто, 1 — один вид, 2 — два и больше (день полный).
export function dayLevels(
  start: Date,
  entries: string[],
  doneAt: string[],
  weights: string[] = [],
  habitMarks: string[] = []
): { levels: number[]; done: number } {
  const e = new Set(entries.map((s) => key(new Date(s))));
  const w = new Set(weights.map(dateOnly));
  const h = new Set(habitMarks.map(dateOnly));
  const t = new Map<string, number>();
  for (const s of doneAt) t.set(key(new Date(s)), (t.get(key(new Date(s))) ?? 0) + 1);
  let done = 0;
  const levels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const k = key(d);
    const c = t.get(k) ?? 0;
    done += c;
    const kinds = (e.has(k) ? 1 : 0) + (c > 0 ? 1 : 0) + (w.has(k) ? 1 : 0) + (h.has(k) ? 1 : 0);
    return Math.min(2, kinds);
  });
  return { levels, done };
}

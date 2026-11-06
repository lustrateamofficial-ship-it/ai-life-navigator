// БАГ (найден при аудите): весь код, определяющий "сегодня" (вес, еда, задачи),
// использовал часовой пояс СЕРВЕРА через `new Date(d.getFullYear(), d.getMonth(), d.getDate())`,
// хотя в схеме есть User.timezone специально для этого — поле просто никогда не читалось.
// Для пользователя в Москве при сервере в UTC запись веса в 00:30 по Москве
// (21:30 UTC предыдущего дня) могла улетать не в тот календарный день.
//
// Это исправление покрывает самые чувствительные к этому места (вес, еда, "сегодня"/
// "завтра"/"неделя" в задачах). Cron-расписание (утренний дайджест и т.д.) по-прежнему
// триггерится в фиксированное серверное время — это отдельная, более крупная переделка
// (нужен per-user cron вместо одного общего), оставлена как известное ограничение.

export function localDateOnly(date: Date, timezone: string): Date {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

    const y = parts.find((p) => p.type === "year")!.value;
    const m = parts.find((p) => p.type === "month")!.value;
    const d = parts.find((p) => p.type === "day")!.value;
    return new Date(`${y}-${m}-${d}T00:00:00.000Z`);
  } catch {
    // Невалидный/незнакомый timezone (например, опечатка) — не роняем запрос,
    // откатываемся на UTC-день вместо падения.
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }
}

// Перевод «местного» времени пользователя ("YYYY-MM-DDTHH:mm", без смещения) в момент UTC.
// Зачем: модели плохо считают смещения часовых поясов, поэтому AI просят вернуть именно
// местное время ("завтра в 19:00" → "2026-10-28T19:00"), а перевод в UTC делает код.
// Возвращает null, если строка не похожа на дату или часовой пояс неизвестен.
export function localDateTimeToUtc(local: string, timezone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  if (Number.isNaN(asUtc)) return null;

  // Смещение пояса в конкретный момент: форматируем момент в нужном поясе и сравниваем
  // с тем же моментом, прочитанным как UTC.
  function offsetAt(ms: number): number | null {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).formatToParts(new Date(ms));
      const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
      const shown = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
      return shown - ms;
    } catch {
      return null;
    }
  }

  const off1 = offsetAt(asUtc);
  if (off1 === null) return null;
  // Второй проход нужен, когда между догадкой и результатом лежит переход на летнее время.
  const guess = asUtc - off1;
  const off2 = offsetAt(guess);
  const result = off2 === null ? guess : asUtc - off2;
  return new Date(result);
}

// Границы календарного месяца и недели в часовом поясе пользователя. Возвращают дни как
// «UTC-полночь» (так же, как localDateOnly), потому что поля date в базе хранят именно календарный день.
// Раньше такие границы считались по часовому поясу СЕРВЕРА (new Date().getMonth()), и в первые часы
// нового месяца или недели пользователь видел данные не того периода.
export function monthBoundsInTimezone(now: Date, timezone: string): { start: Date; end: Date } {
  const day = localDateOnly(now, timezone);
  const y = day.getUTCFullYear();
  const m = day.getUTCMonth();
  return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 1)) };
}

// Понедельник текущей недели пользователя (неделя начинается с понедельника).
export function weekStartInTimezone(now: Date, timezone: string): Date {
  const day = localDateOnly(now, timezone);
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - sinceMonday * 24 * 60 * 60 * 1000);
}

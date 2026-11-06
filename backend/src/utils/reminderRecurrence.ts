// Вынесено из jobs/scheduler.ts, чтобы чистую логику пересчёта следующего срабатывания
// напоминания можно было покрыть юнит-тестом без поднятия cron/Prisma/бота (см.
// src/__tests__/reminderRecurrence.test.ts). Раздел 19 ТЗ: повторяющиеся напоминания
// (daily/weekly/monthly) должны сами сдвигать triggerAt на следующий момент после
// срабатывания; "once" — не повторяется (обрабатывается отдельно в scheduler.ts:
// одноразовое напоминание деактивируется, а не пересчитывается).
export function computeNextTrigger(current: Date, recurrence: string): Date {
  const next = new Date(current);
  if (recurrence === "daily") next.setDate(next.getDate() + 1);
  else if (recurrence === "weekly") next.setDate(next.getDate() + 7);
  else if (recurrence === "weekdays") {
    // по будням: следующий день с понедельника по пятницу (суббота и воскресенье пропускаются)
    do next.setDate(next.getDate() + 1);
    while (next.getDay() === 0 || next.getDay() === 6);
  } else if (recurrence === "weekends") {
    // по выходным: следующая суббота или воскресенье
    do next.setDate(next.getDate() + 1);
    while (next.getDay() !== 0 && next.getDay() !== 6);
  }
  else if (recurrence === "monthly") {
    // 31 января + месяц раньше давало 3 марта (февраль пропускался). Теперь день не выходит за конец месяца.
    // Ограничение: после короткого месяца день остаётся меньшим (28 февраля → 28 марта), потому что исходное число здесь неизвестно.
    const day = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day, lastDay));
  }
  return next;
}

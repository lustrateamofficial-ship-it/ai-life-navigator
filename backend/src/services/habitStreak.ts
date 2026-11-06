// Вынесено из routes/habits.ts, чтобы чистую арифметику стрика можно было
// протестировать юнит-тестом без поднятия базы данных — тот же приём, что уже
// применён для evaluateDrift (services/driftDetection.ts).

export interface HabitLogDate {
  date: Date;
}

// БАГ (найден при аудите, исправлено ранее): раньше стрик считался, отталкиваясь от
// ДАТЫ, которую только что залогировали — если пользователь отмечал прошедший день
// (например, забыл вчера), подсчёт стартовал от вчерашней даты назад, полностью
// игнорируя более свежие логи. Правильный якорь — самая свежая дата СРЕДИ ЛОГОВ,
// а не дата конкретно текущего запроса. Функция ожидает logs, отсортированные по
// дате по убыванию (как возвращает Prisma с orderBy: { date: "desc" }).
export function calcStreakFromLogs(logsDesc: HabitLogDate[]): number {
  if (logsDesc.length === 0) return 0;

  let streak = 0;
  let cursor = logsDesc[0].date;
  for (const log of logsDesc) {
    if (log.date.getTime() === cursor.getTime()) {
      streak++;
      cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
    } else {
      break; // разрыв в датах — цепочка подряд идущих дней закончилась
    }
  }
  return streak;
}

// Привычка считается завершённой, когда с момента старта (startedAt) прошло не меньше
// targetDays календарных дней — независимо от того, не пропускал ли пользователь дни:
// раздел 16 ТЗ описывает привычку как испытание длиной N дней, а не требование
// идеального стрика без единого пропуска.
export function isHabitTargetReached(startedAt: Date | null, targetDays: number, now: Date = new Date()): boolean {
  if (!startedAt) return false;
  const daysSinceStart = Math.floor((now.getTime() - startedAt.getTime()) / (24 * 60 * 60 * 1000));
  return daysSinceStart >= targetDays;
}

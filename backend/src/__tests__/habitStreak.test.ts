import { describe, it, expect } from "vitest";
import { calcStreakFromLogs, isHabitTargetReached } from "../services/habitStreak.js";

function d(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

describe("calcStreakFromLogs", () => {
  it("возвращает 0 без логов", () => {
    expect(calcStreakFromLogs([])).toBe(0);
  });

  it("считает подряд идущие дни от самой свежей даты в логах", () => {
    const logs = [{ date: d("2026-03-10") }, { date: d("2026-03-09") }, { date: d("2026-03-08") }];
    expect(calcStreakFromLogs(logs)).toBe(3);
  });

  it("останавливается на первом разрыве в датах", () => {
    const logs = [{ date: d("2026-03-10") }, { date: d("2026-03-09") }, { date: d("2026-03-07") }]; // пропущено 8 марта
    expect(calcStreakFromLogs(logs)).toBe(2);
  });

  it("не привязывается к дате ЗАПРОСА — только к самой свежей дате СРЕДИ ЛОГОВ (регрессионный тест на исходный баг)", () => {
    // Пользователь забыл отметить позавчера, отметил только вчера и сегодня —
    // стрик должен считаться от сегодняшней даты, а не от произвольной другой.
    const logs = [{ date: d("2026-03-10") }, { date: d("2026-03-09") }];
    expect(calcStreakFromLogs(logs)).toBe(2);
  });

  it("одна запись — стрик 1", () => {
    expect(calcStreakFromLogs([{ date: d("2026-03-10") }])).toBe(1);
  });
});

describe("isHabitTargetReached", () => {
  const now = new Date("2026-03-10T12:00:00.000Z");

  it("false, если привычка ещё не начата (startedAt = null)", () => {
    expect(isHabitTargetReached(null, 30, now)).toBe(false);
  });

  it("false, если прошло меньше targetDays", () => {
    const startedAt = new Date("2026-03-01T12:00:00.000Z"); // 9 дней назад
    expect(isHabitTargetReached(startedAt, 30, now)).toBe(false);
  });

  it("true, если прошло ровно targetDays", () => {
    const startedAt = new Date("2026-02-08T12:00:00.000Z"); // ровно 30 дней назад
    expect(isHabitTargetReached(startedAt, 30, now)).toBe(true);
  });

  it("true, если прошло больше targetDays", () => {
    const startedAt = new Date("2026-01-01T12:00:00.000Z");
    expect(isHabitTargetReached(startedAt, 30, now)).toBe(true);
  });
});

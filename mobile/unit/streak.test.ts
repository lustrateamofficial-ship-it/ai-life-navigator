import { describe, it, expect } from "vitest";
import { streakFrom, bestStreakFrom, skipsLeft, MAX_SKIPS_PER_WEEK } from "../phone/streakCore";
import { dayKey } from "../phone/dayKey";

const NOW = new Date(2026, 10, 25, 15, 0); // среда, местное время
const back = (n: number) => dayKey(new Date(2026, 10, 25 - n, 12));

describe("серия дней", () => {
  it("пусто: серия 0", () => {
    expect(streakFrom([], NOW, [])).toBe(0);
  });
  it("три дня подряд до сегодня", () => {
    expect(streakFrom([back(0), back(1), back(2)], NOW, [])).toBe(3);
  });
  it("сегодня ещё не закрыт: серия держится со вчера", () => {
    expect(streakFrom([back(1), back(2)], NOW, [])).toBe(2);
  });
  it("пропущенный вчерашний день без отметки рвёт серию", () => {
    expect(streakFrom([back(0), back(2), back(3)], NOW, [])).toBe(1);
  });
  it("осознанный пропуск не рвёт серию и сам не прибавляет", () => {
    expect(streakFrom([back(0), back(2), back(3)], NOW, [back(1)])).toBe(3);
  });
  it("сегодня пропущен: серия сохраняется", () => {
    expect(streakFrom([back(1), back(2)], NOW, [back(0)])).toBe(2);
  });
  it("только пропуски без закрытых дней: серия 0", () => {
    expect(streakFrom([], NOW, [back(0), back(1)])).toBe(0);
  });
  it("лучшая серия берёт самый длинный отрезок", () => {
    expect(bestStreakFrom([back(20), back(19), back(18), back(10), back(9)], [])).toBe(3);
  });
  it("лучшая серия проходит через пропущенные дни", () => {
    expect(bestStreakFrom([back(5), back(3), back(2)], [back(4)])).toBe(3);
    expect(bestStreakFrom([back(5), back(3), back(2)], [])).toBe(2);
  });
  it("повторы одного дня не удлиняют серию", () => {
    expect(bestStreakFrom([back(1), back(1), back(0)], [])).toBe(2);
  });
  it("пропусков за неделю не больше двух", () => {
    expect(MAX_SKIPS_PER_WEEK).toBe(2);
    expect(skipsLeft(NOW, [])).toBe(2);
    expect(skipsLeft(NOW, [back(1)])).toBe(1);
    expect(skipsLeft(NOW, [back(1), back(3)])).toBe(0);
  });
  it("старые пропуски (больше семи дней назад) лимит не занимают", () => {
    expect(skipsLeft(NOW, [back(7), back(10), back(20)])).toBe(2);
  });
  it("работает через границу месяца и года", () => {
    const ny = new Date(2027, 0, 2, 10, 0);
    const k = (n: number) => dayKey(new Date(2027, 0, 2 - n, 12));
    expect(streakFrom([k(0), k(1), k(2), k(3)], ny, [])).toBe(4);
  });
});

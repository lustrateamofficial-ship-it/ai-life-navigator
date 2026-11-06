import { describe, it, expect } from "vitest";
import { computeNextTrigger } from "../utils/reminderRecurrence.js";

describe("computeNextTrigger", () => {
  it("daily: сдвигает ровно на сутки", () => {
    const next = computeNextTrigger(new Date("2026-03-10T09:00:00.000Z"), "daily");
    expect(next.toISOString()).toBe("2026-03-11T09:00:00.000Z");
  });

  it("weekly: сдвигает на 7 дней", () => {
    const next = computeNextTrigger(new Date("2026-03-10T09:00:00.000Z"), "weekly");
    expect(next.toISOString()).toBe("2026-03-17T09:00:00.000Z");
  });

  it("monthly: сдвигает на календарный месяц", () => {
    const next = computeNextTrigger(new Date("2026-03-10T09:00:00.000Z"), "monthly");
    expect(next.toISOString()).toBe("2026-04-10T09:00:00.000Z");
  });

  it("monthly: корректно переходит через границу года", () => {
    const next = computeNextTrigger(new Date("2026-12-10T09:00:00.000Z"), "monthly");
    expect(next.toISOString()).toBe("2027-01-10T09:00:00.000Z");
  });

  it("monthly: 31 января переходит на конец февраля, а не на 3 марта", () => {
    const next = computeNextTrigger(new Date(2026, 0, 31, 12, 0), "monthly");
    expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([2026, 1, 28]);
  });

  it("monthly: в високосный год 31 января даёт 29 февраля", () => {
    const next = computeNextTrigger(new Date(2028, 0, 31, 12, 0), "monthly");
    expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([2028, 1, 29]);
  });

  it("monthly: 30 апреля даёт 30 мая, время сохраняется", () => {
    const next = computeNextTrigger(new Date(2026, 3, 30, 9, 15), "monthly");
    expect([next.getMonth(), next.getDate(), next.getHours(), next.getMinutes()]).toEqual([4, 30, 9, 15]);
  });

  it("daily: корректно переходит через границу месяца", () => {
    const next = computeNextTrigger(new Date("2026-03-31T09:00:00.000Z"), "daily");
    expect(next.toISOString()).toBe("2026-04-01T09:00:00.000Z");
  });

  it("once (или любое незнакомое значение): не меняет время — обрабатывается отдельно в scheduler.ts как неповторяющееся", () => {
    const original = new Date("2026-03-10T09:00:00.000Z");
    const next = computeNextTrigger(original, "once");
    expect(next.toISOString()).toBe(original.toISOString());
  });

  it("weekdays: пятница → понедельник, будни идут подряд", () => {
    // 2026-11-06 — пятница
    expect(computeNextTrigger(new Date("2026-11-06T09:00:00.000Z"), "weekdays").toISOString()).toBe("2026-11-09T09:00:00.000Z");
    expect(computeNextTrigger(new Date("2026-11-09T09:00:00.000Z"), "weekdays").toISOString()).toBe("2026-11-10T09:00:00.000Z");
  });

  it("weekends: пятница → суббота, воскресенье → следующая суббота", () => {
    expect(computeNextTrigger(new Date("2026-11-06T09:00:00.000Z"), "weekends").toISOString()).toBe("2026-11-07T09:00:00.000Z");
    expect(computeNextTrigger(new Date("2026-11-08T09:00:00.000Z"), "weekends").toISOString()).toBe("2026-11-14T09:00:00.000Z");
  });
});

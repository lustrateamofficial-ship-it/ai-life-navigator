import { describe, it, expect } from "vitest";
import { firstOccurrence } from "../utils/recurringStart.js";

// 2026-11-25 среда, 2026-11-28 суббота, 2026-11-29 воскресенье, 2026-11-30 понедельник.
const at = (iso: string) => new Date(iso);
const day = (d: Date) => d.toISOString().slice(0, 10);

describe("firstOccurrence: первый срок повторяющейся задачи", () => {
  it("ежедневная: сегодня, полдень UTC", () => {
    const d = firstOccurrence(at("2026-11-25T08:00:00Z"), "daily", "UTC");
    expect(d.toISOString()).toBe("2026-11-25T12:00:00.000Z");
  });
  it("по будням в среду: сегодня", () => {
    expect(day(firstOccurrence(at("2026-11-25T08:00:00Z"), "weekdays", "UTC"))).toBe("2026-11-25");
  });
  it("по будням в субботу: переносится на понедельник", () => {
    expect(day(firstOccurrence(at("2026-11-28T08:00:00Z"), "weekdays", "UTC"))).toBe("2026-11-30");
  });
  it("по будням в воскресенье: понедельник", () => {
    expect(day(firstOccurrence(at("2026-11-29T08:00:00Z"), "weekdays", "UTC"))).toBe("2026-11-30");
  });
  it("по выходным в среду: суббота", () => {
    expect(day(firstOccurrence(at("2026-11-25T08:00:00Z"), "weekends", "UTC"))).toBe("2026-11-28");
  });
  it("по выходным в воскресенье: сегодня", () => {
    expect(day(firstOccurrence(at("2026-11-29T08:00:00Z"), "weekends", "UTC"))).toBe("2026-11-29");
  });
  it("еженедельная и ежемесячная: сегодня", () => {
    expect(day(firstOccurrence(at("2026-11-25T08:00:00Z"), "weekly", "UTC"))).toBe("2026-11-25");
    expect(day(firstOccurrence(at("2026-11-25T08:00:00Z"), "monthly", "UTC"))).toBe("2026-11-25");
  });
  it("день берётся по часовому поясу пользователя, а не по UTC", () => {
    // 23:30 UTC 24 ноября = 01:30 25 ноября в Киеве
    expect(day(firstOccurrence(at("2026-11-24T23:30:00Z"), "daily", "Europe/Kyiv"))).toBe("2026-11-25");
    expect(day(firstOccurrence(at("2026-11-24T23:30:00Z"), "daily", "America/New_York"))).toBe("2026-11-24");
  });
});

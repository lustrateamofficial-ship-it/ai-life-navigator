import { describe, it, expect } from "vitest";
import { normalizeProposals, countProposals } from "../services/journalExtraction.js";
import { localDateTimeToUtc } from "../utils/userTime.js";

const NOW = new Date("2026-10-27T10:00:00.000Z");

describe("localDateTimeToUtc", () => {
  it("переводит местное время Киева (осень, UTC+2) в UTC", () => {
    expect(localDateTimeToUtc("2026-11-10T19:00", "Europe/Kyiv")?.toISOString()).toBe("2026-11-10T17:00:00.000Z");
  });
  it("учитывает летнее время (UTC+3)", () => {
    expect(localDateTimeToUtc("2026-07-10T19:00", "Europe/Kyiv")?.toISOString()).toBe("2026-07-10T16:00:00.000Z");
  });
  it("работает для поясов с отрицательным смещением", () => {
    expect(localDateTimeToUtc("2026-01-15T08:30", "America/New_York")?.toISOString()).toBe("2026-01-15T13:30:00.000Z");
  });
  it("возвращает null для мусора и неизвестного пояса", () => {
    expect(localDateTimeToUtc("завтра", "UTC")).toBeNull();
    expect(localDateTimeToUtc("2026-01-15T08:30", "Нет/Такого")).toBeNull();
  });
});

describe("normalizeProposals", () => {
  it("возвращает пустой результат для не-объекта", () => {
    expect(countProposals(normalizeProposals("мусор", "UTC", NOW))).toBe(0);
    expect(countProposals(normalizeProposals(null, "UTC", NOW))).toBe(0);
    expect(countProposals(normalizeProposals([1, 2], "UTC", NOW))).toBe(0);
  });

  it("отбрасывает напоминания без времени и в прошлом, но оставляет будущие в UTC", () => {
    const r = normalizeProposals(
      {
        reminders: [
          { title: "без времени" },
          { title: "в прошлом", triggerAt: "2026-10-01T10:00" },
          { title: "завтра", triggerAt: "2026-10-28T19:00" },
        ],
      },
      "Europe/Kyiv",
      NOW
    );
    expect(r.reminders).toEqual([{ title: "завтра", triggerAt: "2026-10-28T17:00:00.000Z" }]);
  });

  it("не отбрасывает задачу с невалидным дедлайном, а просто убирает дедлайн", () => {
    const r = normalizeProposals({ tasks: [{ title: "Отчёт", deadline: "пятница" }] }, "UTC", NOW);
    expect(r.tasks).toEqual([{ title: "Отчёт" }]);
  });

  it("проверяет суммы, тип и вес", () => {
    const r = normalizeProposals(
      {
        transactions: [
          { type: "expense", amount: 2000, category: "еда" },
          { type: "expense", amount: -5, category: "еда" },
          { type: "expense", amount: "100", category: "еда" },
          { type: "gift", amount: 10, category: "x" },
          { type: "income", amount: 10, category: "" },
        ],
        weight: { weightKg: 5 },
      },
      "UTC",
      NOW
    );
    expect(r.transactions).toEqual([{ type: "expense", amount: 2000, category: "еда" }]);
    expect(r.weight).toBeNull();
  });

  it("округляет вес до десятых и принимает разумное значение", () => {
    expect(normalizeProposals({ weight: { weightKg: 90.44 } }, "UTC", NOW).weight).toEqual({ weightKg: 90.4 });
  });

  it("убирает дубликаты без учёта регистра и обрезает пробелы", () => {
    const r = normalizeProposals({ tasks: [{ title: "  Купить хлеб " }, { title: "купить   хлеб" }] }, "UTC", NOW);
    expect(r.tasks).toHaveLength(1);
    expect(r.tasks[0].title).toBe("Купить хлеб");
  });

  it("ограничивает количество предложений одного вида", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ title: `задача ${i}` }));
    expect(normalizeProposals({ tasks: many }, "UTC", NOW).tasks.length).toBe(10);
  });
});

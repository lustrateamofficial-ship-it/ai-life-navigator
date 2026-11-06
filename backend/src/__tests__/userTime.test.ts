import { describe, it, expect } from "vitest";
import { localDateOnly } from "../utils/userTime.js";

describe("localDateOnly", () => {
  it("возвращает тот же календарный день для UTC", () => {
    const d = localDateOnly(new Date("2026-03-15T12:00:00.000Z"), "UTC");
    expect(d.toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });

  it("переносит на предыдущий календарный день, когда локальное время ещё не наступило по UTC-дате", () => {
    // 21:30 UTC 14 марта — уже 00:30 15 марта в Москве (UTC+3), но ещё только
    // 13:30 14 марта в Лос-Анджелесе (UTC-8 зимой/-7 летом) — то есть предыдущий день.
    const d = localDateOnly(new Date("2026-03-15T02:00:00.000Z"), "America/Los_Angeles");
    expect(d.toISOString()).toBe("2026-03-14T00:00:00.000Z");
  });

  it("переносит на следующий календарный день для часовых поясов впереди UTC", () => {
    // 21:30 UTC — уже следующий день в Москве (UTC+3: 00:30 следующего дня)
    const d = localDateOnly(new Date("2026-03-14T21:30:00.000Z"), "Europe/Moscow");
    expect(d.toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });

  it("корректно переходит через границу года", () => {
    // 23:00 UTC 31 декабря 2025 + 14 часов (Pacific/Kiritimati, самый ранний пояс на Земле)
    // = 13:00 1 января 2026 по местному времени.
    const d = localDateOnly(new Date("2025-12-31T23:00:00.000Z"), "Pacific/Kiritimati");
    expect(d.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("откатывается на UTC при неизвестном/некорректном часовом поясе вместо падения", () => {
    const d = localDateOnly(new Date("2026-03-15T12:00:00.000Z"), "Not/A_Real_Timezone");
    expect(d.toISOString()).toBe("2026-03-15T00:00:00.000Z");
  });
});

import { monthBoundsInTimezone, weekStartInTimezone } from "../utils/userTime.js";

describe("monthBoundsInTimezone", () => {
  it("учитывает часовой пояс на границе месяца", () => {
    const kyiv = monthBoundsInTimezone(new Date("2026-10-31T22:30:00Z"), "Europe/Kyiv");
    expect(kyiv.start.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(kyiv.end.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(monthBoundsInTimezone(new Date("2026-10-31T22:30:00Z"), "UTC").start.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
  it("переходит через границу года", () => {
    expect(monthBoundsInTimezone(new Date("2026-12-15T10:00:00Z"), "UTC").end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("weekStartInTimezone", () => {
  it("неделя начинается с понедельника", () => {
    expect(weekStartInTimezone(new Date("2026-10-28T10:00:00Z"), "UTC").toISOString()).toBe("2026-10-26T00:00:00.000Z");
    expect(weekStartInTimezone(new Date("2026-10-25T10:00:00Z"), "UTC").toISOString()).toBe("2026-10-19T00:00:00.000Z");
  });
  it("учитывает часовой пояс в ночь на понедельник", () => {
    expect(weekStartInTimezone(new Date("2026-10-25T22:30:00Z"), "Europe/Kyiv").toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });
});

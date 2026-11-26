import { describe, it, expect } from "vitest";
import { dayLevels, weekStart, key } from "../phone/weekLevels";

const MON = new Date(2026, 10, 23); // понедельник 23 ноября 2026
const local = (day: number, h = 12) => new Date(2026, 10, day, h).toISOString();

describe("плитка недели", () => {
  it("понедельник недели из любого дня", () => {
    for (const d of [23, 24, 25, 29]) expect(key(weekStart(new Date(2026, 10, d, 15)))).toBe("2026-11-23");
    expect(key(weekStart(new Date(2026, 10, 30)))).toBe("2026-11-30");
  });
  it("пустая неделя", () => {
    expect(dayLevels(MON, [], [])).toEqual({ levels: [0, 0, 0, 0, 0, 0, 0], done: 0 });
  });
  it("один вид дел: уровень 1", () => {
    const r = dayLevels(MON, [local(24)], []);
    expect(r.levels).toEqual([0, 1, 0, 0, 0, 0, 0]);
  });
  it("запись и закрытая задача в один день: уровень 2, задачи считаются", () => {
    const r = dayLevels(MON, [local(25)], [local(25), local(25, 18)]);
    expect(r.levels[2]).toBe(2);
    expect(r.done).toBe(2);
  });
  it("вес и привычка считаются по дате без сдвига часовым поясом", () => {
    const r = dayLevels(MON, [], [], ["2026-11-26T00:00:00.000Z"], ["2026-11-26T00:00:00.000Z"]);
    expect(r.levels[3]).toBe(2);
  });
  it("вес один: уровень 1; уровень не выше 2", () => {
    expect(dayLevels(MON, [], [], ["2026-11-27T00:00:00.000Z"]).levels[4]).toBe(1);
    expect(dayLevels(MON, [local(28)], [local(28)], ["2026-11-28"], ["2026-11-28"]).levels[5]).toBe(2);
  });
  it("дни вне недели игнорируются", () => {
    expect(dayLevels(MON, [local(22), local(30)], []).levels).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

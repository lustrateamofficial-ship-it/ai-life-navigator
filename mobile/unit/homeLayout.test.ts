import { describe, it, expect } from "vitest";
import { moveTile, toggleTile, spans, shortcutSpans, normalizeLayouts, defaultLayouts } from "../phone/homeLayout";

describe("плитки экранов", () => {
  it("moveTile двигает вниз и вверх на любое число мест", () => {
    expect(moveTile(["a", "b", "c", "d"], 0, 3)).toEqual(["b", "c", "d", "a"]);
    expect(moveTile(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveTile(["a", "b", "c"], 1, 99)).toEqual(["a", "c", "b"]);
    expect(moveTile(["a", "b", "c"], 1, -5)).toEqual(["b", "a", "c"]);
  });
  it("moveTile не ломается на неверных номерах", () => {
    expect(moveTile(["a", "b"], 5, 0)).toEqual(["a", "b"]);
    expect(moveTile(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });
  it("toggleTile включает и выключает", () => {
    expect(toggleTile(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleTile(["a", "b"], "a")).toEqual(["b"]);
  });
  it("spans: две половинки подряд делят ряд, одиночная занимает весь", () => {
    const half = (id: string) => id !== "x";
    expect(spans(["a", "b", "x", "c"], half)).toEqual(["half", "half", "full", "full"]);
    expect(spans(["a", "b", "c"], half)).toEqual(["half", "half", "full"]);
    expect(spans([], half)).toEqual([]);
  });
  it("shortcutSpans: неполный ряд растягивается", () => {
    expect(shortcutSpans(3)).toEqual([2, 2, 2]);
    expect(shortcutSpans(4)).toEqual([2, 2, 2, 6]);
    expect(shortcutSpans(5)).toEqual([2, 2, 2, 3, 3]);
  });
  it("normalizeLayouts принимает старый вид по времени суток и мусор", () => {
    const def = defaultLayouts();
    expect(normalizeLayouts(null)).toEqual(def);
    expect(normalizeLayouts("мусор")).toEqual(def);
    const old = normalizeLayouts({ morning: ["ring"], day: ["weight"], evening: ["week"] }, new Date(2026, 10, 27, 12));
    expect(old.today).toEqual(["weight"]);
    expect(old.journal).toEqual(def.journal);
  });
  it("normalizeLayouts отбрасывает неизвестные плитки", () => {
    const l = normalizeLayouts({ today: ["ring", "нет-такой"] });
    expect(l.today.includes("ring")).toBe(true);
    expect(l.today.includes("нет-такой")).toBe(false);
  });
});

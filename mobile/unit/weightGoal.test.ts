import { describe, it, expect } from "vitest";
import { weightProgress, goalLine, normalizeStart } from "../phone/weightGoal";

describe("цель по весу", () => {
  it("похудение: процент и остаток", () => {
    const p = weightProgress(90, 85, 80);
    expect(p).toMatchObject({ direction: "lose", percent: 50, left: 5, moved: 5, reached: false, wrongWay: false });
  });
  it("цель достигнута и перевыполнена", () => {
    const p = weightProgress(90, 79, 80);
    expect(p.reached).toBe(true);
    expect(p.percent).toBe(100);
    expect(p.left).toBe(0);
  });
  it("набор массы", () => {
    expect(weightProgress(60, 63, 66)).toMatchObject({ direction: "gain", percent: 50, left: 3 });
  });
  it("вес ушёл в обратную сторону", () => {
    const p = weightProgress(90, 93, 80);
    expect(p.wrongWay).toBe(true);
    expect(p.percent).toBe(0);
    expect(p.moved).toBe(-3);
  });
  it("удержание веса", () => {
    expect(weightProgress(80, 80.2, 80)).toMatchObject({ direction: "keep", reached: true, percent: 100 });
    expect(weightProgress(80, 82, 80)).toMatchObject({ direction: "keep", reached: false, left: 2 });
  });
  it("строка для сводки", () => {
    expect(goalLine(82, null, null)).toBe("Вес 82 кг");
    expect(goalLine(82, 75, null)).toBe("Вес 82 кг (цель 75 кг)");
    expect(goalLine(85, 80, 90)).toBe("Вес 85 кг, цель 80 кг: выполнено 50%");
    expect(goalLine(79.5, 80, 90)).toBe("Вес 79,5 кг: цель 80 кг достигнута");
  });
  it("стартовый вес проверяется", () => {
    expect(normalizeStart({ kg: 82.46, date: "2026-11-01" })).toEqual({ kg: 82.5, date: "2026-11-01" });
    expect(normalizeStart({ kg: -5 })).toBeNull();
    expect(normalizeStart({ kg: 900 })).toBeNull();
    expect(normalizeStart("x")).toBeNull();
    expect(normalizeStart(null)).toBeNull();
    expect(normalizeStart({ kg: 70, date: "вчера" })?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

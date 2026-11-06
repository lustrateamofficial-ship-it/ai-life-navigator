import { describe, it, expect } from "vitest";
import { detectCrisis, supportResourcesForTimezone } from "../services/distressDetection.js";

describe("detectCrisis", () => {
  it("распознаёт прямые формулировки", () => {
    expect(detectCrisis("Я больше не хочу жить")).toBe(true);
    expect(detectCrisis("думаю покончить с собой")).toBe(true);
    expect(detectCrisis("Хочу умереть")).toBe(true);
    expect(detectCrisis("лучше бы меня не было")).toBe(true);
  });
  it("не реагирует на обычные записи и отрицание", () => {
    expect(detectCrisis("Сегодня тяжёлый день, много работы, устал")).toBe(false);
    expect(detectCrisis("не хочу умирать, хочу успеть многое")).toBe(false);
    expect(detectCrisis("Купить хлеб и позвонить маме")).toBe(false);
  });
  it("не зависит от регистра, ё и лишних пробелов", () => {
    expect(detectCrisis("НЕ   ХОЧУ   ЖИТЬ")).toBe(true);
  });
});

describe("supportResourcesForTimezone", () => {
  it("для Украины даёт конкретные номера", () => {
    expect(supportResourcesForTimezone("Europe/Kyiv").map((r) => r.contact)).toEqual(["7333", "112"]);
  });
  it("для остальных не выдумывает номер", () => {
    const r = supportResourcesForTimezone("America/New_York");
    expect(r.some((x) => /^\d+$/.test(x.contact))).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { evaluateDrift } from "../services/driftDetection.js";

describe("evaluateDrift", () => {
  it("does not flag drift below the minimum sample size (раздел 25: no small-sample conclusions)", () => {
    const result = evaluateDrift(5, 0);
    expect(result.driftDetected).toBe(false);
  });

  it("flags drift when few completed tasks are linked to goals", () => {
    // 30 задач выполнено, только 2 связаны с целью — классический пример из ТЗ (раздел 25)
    const result = evaluateDrift(30, 2);
    expect(result.driftDetected).toBe(true);
    expect(result.ratio).toBeCloseTo(0.07, 2);
  });

  it("does not flag drift when most tasks are goal-linked", () => {
    const result = evaluateDrift(20, 15);
    expect(result.driftDetected).toBe(false);
  });

  it("handles zero completed tasks without dividing by zero", () => {
    const result = evaluateDrift(0, 0);
    expect(result.driftDetected).toBe(false);
    expect(result.ratio).toBe(0);
  });
});

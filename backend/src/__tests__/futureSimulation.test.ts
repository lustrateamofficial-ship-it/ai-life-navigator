import { describe, it, expect } from "vitest";
import { linearRegression } from "../services/futureSimulation.js";

describe("linearRegression", () => {
  it("returns null for too few points (raздел 28: не выдумывать прогноз на малых данных)", () => {
    expect(linearRegression([{ x: 0, y: 1 }, { x: 1, y: 2 }])).toBeNull();
  });

  it("fits a perfect line y = 2x + 1", () => {
    const points = [0, 1, 2, 3, 4].map((x) => ({ x, y: 2 * x + 1 }));
    const fit = linearRegression(points);
    expect(fit).not.toBeNull();
    expect(fit!.slope).toBeCloseTo(2, 5);
    expect(fit!.intercept).toBeCloseTo(1, 5);
  });

  it("returns null for a vertical/degenerate x series", () => {
    const points = [0, 0, 0, 0, 0].map((x) => ({ x, y: 5 }));
    expect(linearRegression(points)).toBeNull();
  });
});

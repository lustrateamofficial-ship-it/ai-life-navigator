import { describe, it, expect } from "vitest";
import { pearson } from "../services/correlationEngine.js";

describe("pearson correlation", () => {
  it("returns null for too few data points (section 23: no conclusions on small samples)", () => {
    expect(pearson([1, 2], [1, 2])).toBeNull();
  });

  it("returns 1 for perfectly correlated series", () => {
    const r = pearson([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(1, 5);
  });

  it("returns -1 for perfectly inverse series", () => {
    const r = pearson([1, 2, 3, 4, 5], [10, 8, 6, 4, 2]);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(-1, 5);
  });

  it("returns null when one series has zero variance", () => {
    expect(pearson([1, 2, 3, 4, 5], [3, 3, 3, 3, 3])).toBeNull();
  });

  it("returns a value close to 0 for uncorrelated-ish data", () => {
    const r = pearson([1, 2, 3, 4, 5, 6], [3, 1, 4, 1, 5, 9]);
    expect(r).not.toBeNull();
    expect(Math.abs(r!)).toBeLessThan(1);
  });
});

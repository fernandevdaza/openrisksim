import { describe, expect, it } from "vitest";
import {
  boundsFromCertainty,
  certaintyFromBounds,
  defaultCertainty,
  levelNumber,
  levelPct,
  meanConfidenceInterval,
  parseLevelInput,
  percentileSorted,
  sortedFinite,
  switchMode,
  withBound,
  withCertainty,
} from "./certainty";

// 1..100
const data = sortedFinite(Array.from({ length: 100 }, (_, i) => 100 - i).concat([NaN, Infinity]));

describe("certainty helpers", () => {
  it("sorts and drops non-finite", () => {
    expect(data.length).toBe(100);
    expect(data[0]).toBe(1);
    expect(data[99]).toBe(100);
  });
  it("percentile matches PERCENTILE.INC", () => {
    expect(percentileSorted(data, 0)).toBe(1);
    expect(percentileSorted(data, 1)).toBe(100);
    expect(percentileSorted(data, 0.5)).toBeCloseTo(50.5);
    expect(percentileSorted(data, 0.05)).toBeCloseTo(5.95);
  });
  it("certainty from bounds for every mode", () => {
    expect(certaintyFromBounds(data, "two", 11, 90)).toBeCloseTo(0.8);
    expect(certaintyFromBounds(data, "left", -Infinity, 25)).toBeCloseTo(0.25);
    expect(certaintyFromBounds(data, "right", 76, Infinity)).toBeCloseTo(0.25);
    expect(certaintyFromBounds(data, "two", 50, 10)).toBe(0);
  });
  it("bounds from certainty", () => {
    const two = boundsFromCertainty(data, "two", 0.9);
    expect(two.lower).toBeCloseTo(5.95);
    expect(two.upper).toBeCloseTo(95.05);
    expect(boundsFromCertainty(data, "left", 0.3).upper).toBeCloseTo(30.7);
    expect(boundsFromCertainty(data, "right", 0.3).lower).toBeCloseTo(70.3);
  });
  it("state transitions", () => {
    const s = defaultCertainty(data);
    expect(s.mode).toBe("two");
    expect(s.certainty).toBeCloseTo(0.9, 1);
    const s2 = withBound(data, s, "lower", 50.5);
    expect(s2.certainty).toBeCloseTo((95 - 50) / 100);
    const s3 = withCertainty(data, s2, 0.5);
    expect(s3.lower).toBeCloseTo(percentileSorted(data, 0.25));
    const s4 = switchMode(data, s3, "left");
    expect(s4.lower).toBe(-Infinity);
    expect(s4.certainty).toBe(0.5);
  });
});

describe("confidence level helpers", () => {
  it("parses percentages, fractions and decimal commas", () => {
    expect(parseLevelInput("90")).toBe(0.9);
    expect(parseLevelInput("97,5")).toBe(0.975);
    expect(parseLevelInput("97.5 %")).toBe(0.975);
    expect(parseLevelInput("0,9")).toBe(0.9);
    expect(parseLevelInput("99,9")).toBe(0.999);
    expect(parseLevelInput("40")).toBeNaN();
    expect(parseLevelInput("100")).toBeNaN();
    expect(parseLevelInput("abc")).toBeNaN();
    expect(parseLevelInput("")).toBeNaN();
    expect(parseLevelInput("5", 0.01, 0.999)).toBe(0.05);
  });
  it("formats levels per locale", () => {
    expect(levelNumber(0.975, "es")).toBe("97,5");
    expect(levelNumber(0.9, "en")).toBe("90");
    expect(levelPct(0.9, "es")).toBe("90 %");
    expect(levelPct(0.99, "en")).toBe("99%");
  });
  it("mean CI from summary stats (Student t)", () => {
    const st = { mean: 10, stdDev: 2, count: 12, meanCI95: [8.7, 11.3] as [number, number] };
    expect(meanConfidenceInterval(st, 0.95)).toEqual([8.7, 11.3]);
    const ci90 = meanConfidenceInterval(st, 0.9);
    // t_{0.95, 11} = 1.795884819
    expect(ci90[1] - 10).toBeCloseTo((1.795884819 * 2) / Math.sqrt(12), 8);
    expect(meanConfidenceInterval({ ...st, meanCI: [1, 2], confidenceLevel: 0.9 }, 0.9)).toEqual([1, 2]);
    expect(meanConfidenceInterval({ mean: 3, stdDev: 0, count: 1 }, 0.9)).toEqual([3, 3]);
  });
});

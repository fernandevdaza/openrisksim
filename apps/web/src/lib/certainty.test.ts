import { describe, expect, it } from "vitest";
import {
  boundsFromCertainty,
  certaintyFromBounds,
  defaultCertainty,
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

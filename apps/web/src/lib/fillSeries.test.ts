import { describe, expect, it } from "vitest";
import { fillExtent, fillTarget, seriesGenerator } from "./fillSeries";

describe("fill series", () => {
  it("extends two or more numbers linearly (forward and backward)", () => {
    const g = seriesGenerator([1, 3])!;
    expect([2, 3, 4].map(g)).toEqual([5, 7, 9]);
    expect([-1, -2].map(g)).toEqual([-1, -3]);
    expect([3, 4].map(seriesGenerator([0.1, 0.2, 0.3])!)).toEqual([0.4, 0.5]);
  });
  it("copies single numbers, formulas, booleans and plain text", () => {
    expect(seriesGenerator([5])).toBeNull();
    expect(seriesGenerator(["=A1*2", "=A2*2"])).toBeNull();
    expect(seriesGenerator([true, false])).toBeNull();
    expect(seriesGenerator(["abc"])).toBeNull();
    expect(seriesGenerator([1, "x"])).toBeNull();
  });
  it("increments text with a trailing number", () => {
    const g = seriesGenerator(["Año 1"])!;
    expect([1, 2].map(g)).toEqual(["'Año 2", "'Año 3"]);
    const g2 = seriesGenerator(["Q1", "Q3"])!;
    expect(g2(2)).toBe("'Q5");
    expect(seriesGenerator(["A1", "B2"])).toBeNull();
  });
  it("computes drag direction and target", () => {
    const src = { r0: 0, c0: 1, r1: 0, c1: 1 };
    expect(fillExtent(src, { row: 4, col: 1 })).toEqual({ dir: "down", count: 4 });
    expect(fillExtent(src, { row: 0, col: 1 })).toBeNull();
    expect(fillExtent(src, { row: 1, col: 5 })).toEqual({ dir: "right", count: 4 });
    expect(fillExtent({ r0: 5, c0: 5, r1: 6, c1: 5 }, { row: 2, col: 5 })).toEqual({ dir: "up", count: 3 });
    expect(fillTarget(src, "down", 4)).toEqual({ r0: 1, r1: 4, c0: 1, c1: 1 });
    expect(fillTarget({ r0: 5, c0: 5, r1: 6, c1: 5 }, "up", 3)).toEqual({ r0: 2, r1: 4, c0: 5, c1: 5 });
  });
});

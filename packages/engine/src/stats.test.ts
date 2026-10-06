import { describe as suite, expect, it } from "vitest";
import { certainty, describe, empiricalCdf, histogram, meanCIHalfWidth, pearson, percentile, spearman } from "./stats";
import { testRng } from "./test-utils";

// Reference values computed with Excel-equivalent formulas (AVERAGE, MEDIAN, STDEV.S, VAR.S, SKEW, KURT,
// PERCENTILE.INC; cross-checked with scipy bias=False / numpy linear percentiles).
const DATA = [3.2, 7.5, 1.1, 4.8, 9.9, 2.3, 6.6, 4.8, 12.4, 0.5, 5.7, 8.1];

suite("percentile (PERCENTILE.INC)", () => {
  const sorted = Float64Array.from(DATA).sort();
  it.each([
    [0, 0.5],
    [0.01, 0.566],
    [0.05, 0.83],
    [0.1, 1.22],
    [0.25, 2.975],
    [0.33, 4.208],
    [0.5, 5.25],
    [0.75, 7.65],
    [0.9, 9.72],
    [0.95, 11.025],
    [0.99, 12.125],
    [1, 12.4],
  ])("p=%f", (p, expected) => {
    expect(percentile(sorted, p)).toBeCloseTo(expected, 10);
  });
  it("edge cases", () => {
    expect(percentile([], 0.5)).toBeNaN();
    expect(percentile([7], 0.3)).toBe(7);
    expect(percentile([1, 2], -1)).toBe(1);
    expect(percentile([1, 2], 2)).toBe(2);
  });
});

suite("describe", () => {
  it("matches Excel on a fixed dataset", () => {
    const s = describe(DATA);
    expect(s.count).toBe(12);
    expect(s.mean).toBeCloseTo(5.575, 12);
    expect(s.median).toBeCloseTo(5.25, 12);
    expect(s.stdDev).toBeCloseTo(3.564758056306206, 12);
    expect(s.variance).toBeCloseTo(12.7075, 12);
    expect(s.skewness).toBeCloseTo(0.3692949028619193, 12);
    expect(s.kurtosis).toBeCloseTo(-0.33781554033776295, 12);
    expect(s.min).toBe(0.5);
    expect(s.max).toBe(12.4);
    expect(s.range).toBeCloseTo(11.9, 12);
    expect(s.cv).toBeCloseTo(3.564758056306206 / 5.575, 12);
    expect(s.stdErrorMean).toBeCloseTo(3.564758056306206 / Math.sqrt(12), 12);
    const half = 2.2009851600916384 * (3.564758056306206 / Math.sqrt(12));
    expect(s.meanCI95[0]).toBeCloseTo(5.575 - half, 8);
    expect(s.meanCI95[1]).toBeCloseTo(5.575 + half, 8);
    expect(s.percentiles[1]).toBeCloseTo(0.566, 10);
    expect(s.percentiles[33]).toBeCloseTo(4.208, 10);
    expect(s.percentiles[50]).toBeCloseTo(5.25, 10);
    expect(s.percentiles[99]).toBeCloseTo(12.125, 10);
    for (let p = 1; p <= 99; p++) expect(Number.isFinite(s.percentiles[p])).toBe(true);
  });

  it("ignores NaN", () => {
    const s = describe([...DATA, NaN, NaN]);
    expect(s.count).toBe(12);
    expect(s.mean).toBeCloseTo(5.575, 12);
  });

  it("mode: most frequent value for integer data", () => {
    expect(describe([1, 2, 2, 3, 3, 3, 4]).mode).toBe(3);
    expect(describe([5, 5, 1, 1]).mode).toBe(1); // tie → smallest
  });

  it("mode: histogram peak for continuous data", () => {
    const rng = testRng(3);
    const v = new Float64Array(20000);
    // Triangular(0, 7, 10) via inverse CDF → mode 7.
    for (let i = 0; i < v.length; i++) {
      const u = rng.next();
      v[i] = u < 0.7 ? Math.sqrt(u * 10 * 7) : 10 - Math.sqrt((1 - u) * 10 * 3);
    }
    expect(Math.abs(describe(v).mode - 7)).toBeLessThan(0.6);
  });

  it("handles empty, single and constant data", () => {
    const e = describe([]);
    expect(e.count).toBe(0);
    expect(e.mean).toBeNaN();
    expect(e.percentiles[50]).toBeNaN();
    const one = describe([4]);
    expect(one.mean).toBe(4);
    expect(one.stdDev).toBe(0);
    expect(one.meanCI95).toEqual([4, 4]);
    const c = describe([2, 2, 2, 2, 2]);
    expect(c.stdDev).toBe(0);
    expect(c.mode).toBe(2);
    expect(c.skewness).toBeNaN();
    expect(c.kurtosis).toBeNaN();
    expect(describe([0, 0]).cv).toBeNaN();
  });

  it("uses z for large samples (normal data sanity check)", () => {
    const rng = testRng(1);
    const v = new Float64Array(100000);
    for (let i = 0; i < v.length; i++) {
      // Box–Muller
      v[i] = Math.sqrt(-2 * Math.log(1 - rng.next())) * Math.cos(2 * Math.PI * rng.next());
    }
    const s = describe(v);
    expect(Math.abs(s.mean)).toBeLessThan(0.02);
    expect(Math.abs(s.stdDev - 1)).toBeLessThan(0.02);
    expect(Math.abs(s.skewness)).toBeLessThan(0.05);
    expect(Math.abs(s.kurtosis)).toBeLessThan(0.1);
    expect(Math.abs(s.percentiles[95] - 1.645)).toBeLessThan(0.03);
    expect(Math.abs(s.mode)).toBeLessThan(0.3);
  });
});

suite("describe — confidence level of the mean CI", () => {
  const sem = 3.564758056306206 / Math.sqrt(12);
  it("defaults to 95 % and equals meanCI95", () => {
    const s = describe(DATA);
    expect(s.confidenceLevel).toBe(0.95);
    expect(s.meanCI).toEqual(s.meanCI95);
  });
  it("uses Student t at the chosen level (df = 11)", () => {
    // t_{0.95, 11} = 1.795884819, t_{0.995, 11} = 3.105806516
    const s90 = describe(DATA, { confidence: 0.9 });
    expect(s90.confidenceLevel).toBe(0.9);
    expect(s90.meanCI![1] - s90.mean).toBeCloseTo(1.795884819 * sem, 8);
    expect(s90.meanCI95).toEqual(describe(DATA).meanCI95);
    const s99 = describe(DATA, { confidence: 0.99 });
    expect(s99.meanCI![1] - s99.mean).toBeCloseTo(3.105806516 * sem, 8);
    expect(s99.meanCI![1] - s99.meanCI![0]).toBeGreaterThan(s90.meanCI![1] - s90.meanCI![0]);
  });
  it("edge cases and validation", () => {
    expect(describe([4], { confidence: 0.8 }).meanCI).toEqual([4, 4]);
    expect(describe([], { confidence: 0.8 }).meanCI![0]).toBeNaN();
    expect(() => describe(DATA, { confidence: 1 })).toThrow();
    expect(() => describe(DATA, { confidence: 0 })).toThrow();
    // large n: t → z
    expect(meanCIHalfWidth(1, 1_000_001, 0.9)).toBeCloseTo(1.6448536 / 1000, 8);
  });
});

suite("histogram", () => {
  it("auto bins are clamped to [10, 100] and counts add up", () => {
    const rng = testRng(2);
    const v = Array.from({ length: 1000 }, () => rng.next());
    const h = histogram(v);
    expect(h.length).toBeGreaterThanOrEqual(10);
    expect(h.length).toBeLessThanOrEqual(100);
    expect(h.reduce((a, b) => a + b.count, 0)).toBe(1000);
    expect(h[h.length - 1].cumulative).toBeCloseTo(1, 12);
    expect(h[0].from).toBe(Math.min(...v));
    expect(h[h.length - 1].to).toBe(Math.max(...v));
    const big = Array.from({ length: 1_000_000 }, () => rng.next());
    expect(histogram(big).length).toBe(100);
    const small = [1.5, 2.5, 3.5];
    expect(histogram(small).length).toBe(10);
  });

  it("fixed number of bins", () => {
    const h = histogram([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(h.length).toBe(5);
    expect(h.map((b) => b.count)).toEqual([2, 2, 2, 2, 3]);
    expect(h[4].frequency).toBeCloseTo(3 / 11, 12);
  });

  it("integer data gets one bin per value", () => {
    const h = histogram([0, 1, 1, 2, 2, 2, 5, NaN]);
    expect(h.length).toBe(6);
    expect(h[0].from).toBe(-0.5);
    expect(h[2]).toMatchObject({ from: 1.5, to: 2.5, count: 3 });
    expect(h[3].count).toBe(0);
  });

  it("constant and empty data", () => {
    const h = histogram([3, 3, 3]);
    expect(h).toHaveLength(1);
    expect(h[0].count).toBe(3);
    expect(h[0].from).toBeLessThan(3);
    expect(h[0].to).toBeGreaterThan(3);
    expect(histogram([NaN])).toEqual([]);
  });
});

suite("certainty / correlations / ecdf", () => {
  it("certainty is the share inside [lower, upper]", () => {
    expect(certainty([1, 2, 3, 4, NaN], 2, 3)).toBe(0.5);
    expect(certainty([1, 2, 3, 4], -Infinity, 2.5)).toBe(0.5);
    expect(certainty([], 0, 1)).toBeNaN();
  });

  it("pearson", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 12);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 12);
    expect(pearson([1, 2, 3], [1, 1, 1])).toBeNaN();
    expect(pearson([1, 2, NaN, 3], [2, 4, 100, 6])).toBeCloseTo(1, 12);
  });

  it("spearman with ties (average ranks) matches scipy", () => {
    expect(spearman([1, 2, 2, 3, 4, 4, 4, 5], [2, 1, 3, 3, 5, 4, 6, 6])).toBeCloseTo(0.9007775105401477, 12);
    expect(spearman([1, 2, 3, 4], [1, 4, 9, 16])).toBeCloseTo(1, 12);
    expect(spearman([1, 2, 3, 4], [10, 9, 1, 0])).toBeCloseTo(-1, 12);
  });

  it("empiricalCdf", () => {
    const { x, p } = empiricalCdf([1, 2, 3, 4], 4);
    expect(x).toEqual([1, 2, 3, 4]);
    expect(p).toEqual([0.25, 0.5, 0.75, 1]);
    const d = empiricalCdf([5, 5]);
    expect(d).toEqual({ x: [5], p: [1] });
    const big = empiricalCdf(Array.from({ length: 1000 }, (_, i) => i));
    expect(big.x).toHaveLength(200);
    for (let i = 1; i < big.p.length; i++) expect(big.p[i]).toBeGreaterThanOrEqual(big.p[i - 1]);
  });
});

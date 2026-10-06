import { describe, expect, it } from "vitest";
import {
  arima,
  autoArima,
  autoForecast,
  holt,
  holtWinters,
  movingAverage,
  multipleRegression,
  normalizeLevels,
  pathPercentileBands,
  predict,
  simpleExponentialSmoothing,
  stepwiseRegression,
  trendForecast,
  type ForecastOutput,
} from "./index";
import { normalQuantile, studentTQuantile } from "./_stats";
import { SeededRng } from "./optim";

function noisySeasonal(n: number, seed: number): number[] {
  const rng = new SeededRng(seed);
  return Array.from({ length: n }, (_, t) => 100 + 0.5 * t + 8 * Math.sin((2 * Math.PI * t) / 12) + rng.normal());
}

const LEVELS = [0.5, 0.8, 0.9, 0.95, 0.99];

function checkIntervals(out: ForecastOutput) {
  const byLevel = new Map(out.intervals.map((iv) => [iv.level, iv]));
  expect(out.intervals.map((iv) => iv.level)).toEqual(LEVELS);
  const i95 = byLevel.get(0.95)!;
  const i80 = byLevel.get(0.8)!;
  out.forecast.forEach((_, h) => {
    expect(i95.lower[h]).toBeCloseTo(out.lower95[h], 9);
    expect(i95.upper[h]).toBeCloseTo(out.upper95[h], 9);
    expect(i80.lower[h]).toBeCloseTo(out.lower80[h], 9);
    expect(i80.upper[h]).toBeCloseTo(out.upper80[h], 9);
    // nested & monotone in level
    for (let j = 1; j < out.intervals.length; j++) {
      const a = out.intervals[j - 1];
      const b = out.intervals[j];
      expect(b.upper[h] - b.lower[h]).toBeGreaterThan(a.upper[h] - a.lower[h]);
      expect(b.lower[h]).toBeLessThanOrEqual(a.lower[h]);
      expect(b.upper[h]).toBeGreaterThanOrEqual(a.upper[h]);
    }
  });
}

describe("confidence levels", () => {
  it("normalizeLevels sorts, dedupes, defaults and validates", () => {
    expect(normalizeLevels()).toEqual([0.8, 0.95]);
    expect(normalizeLevels([0.95, 0.8, 0.95, 0.9])).toEqual([0.8, 0.9, 0.95]);
    expect(normalizeLevels([])).toEqual([]);
    expect(() => normalizeLevels([0.3])).toThrow();
    expect(() => normalizeLevels([1])).toThrow();
    expect(() => normalizeLevels([NaN])).toThrow();
    expect(normalizeLevels([0.5, 0.999])).toEqual([0.5, 0.999]);
  });

  it("default output carries 80 % and 95 % intervals equal to the legacy fields", () => {
    const out = simpleExponentialSmoothing([3, 4, 6, 5, 7, 8, 7, 9], 3);
    expect(out.intervals.map((i) => i.level)).toEqual([0.8, 0.95]);
    expect(out.intervals[1].lower).toEqual(out.lower95);
    expect(out.intervals[0].upper).toEqual(out.upper80);
  });

  it("every method: level 0.95 equals the old 95 % interval, widths grow with the level", () => {
    const y = noisySeasonal(60, 3);
    const opts = { levels: [0.99, 0.5, 0.95, 0.8, 0.9] };
    checkIntervals(movingAverage(y, 4, 3, opts));
    checkIntervals(simpleExponentialSmoothing(y, 4, undefined, opts));
    checkIntervals(holt(y, 4, opts));
    checkIntervals(holt(y, 4, { damped: true, ...opts }));
    checkIntervals(holtWinters(y, 4, 12, opts));
    checkIntervals(holtWinters(y, 4, 12, { seasonal: "multiplicative", ...opts }));
    checkIntervals(arima(y, 4, { p: 1, d: 1, q: 0 }, opts));
    checkIntervals(autoArima(y.slice(0, 40), 4, { maxP: 1, maxQ: 1, ...opts }));
    checkIntervals(trendForecast(y, 4, "linear", opts));
    checkIntervals(trendForecast(y, 4, "exponential", opts));
    checkIntervals(autoForecast(y, 4, 12, opts).best);
  });

  it("normal-based methods use z, trend lines use Student t", () => {
    const y = [2, 4.5, 5.5, 8.4, 9.6];
    // ETS: half-width ratio 90 % / 95 % = z ratio
    const ses = simpleExponentialSmoothing(y, 1, 0.5, { levels: [0.9, 0.95] });
    const half = (o: ForecastOutput, i: number) => o.intervals[i].upper[0] - o.forecast[0];
    expect(half(ses, 0) / half(ses, 1)).toBeCloseTo(normalQuantile(0.95) / normalQuantile(0.975), 10);
    expect(half(ses, 0) / half(ses, 1)).toBeCloseTo(1.6448536 / 1.959964, 6);
    // Linear trend on 5 points: df = 3, t(0.95; 3) = 2.353363, t(0.975; 3) = 3.182446
    const tr = trendForecast(y, 1, "linear", { levels: [0.9, 0.95] });
    expect(half(tr, 0) / half(tr, 1)).toBeCloseTo(2.353363 / 3.182446, 6);
    expect(studentTQuantile(0.95, 3)).toBeCloseTo(2.353363, 6);
    // half-width / se equals t: se² = s²(1 + x₀ᵀ(XᵀX)⁻¹x₀) with x₀ = (1, 6)
    const n = 5;
    const ts = [1, 2, 3, 4, 5];
    const tm = 3;
    const sxx = ts.reduce((s, t) => s + (t - tm) ** 2, 0);
    const ym = y.reduce((a, b) => a + b, 0) / n;
    const b = ts.reduce((s, t, i) => s + (t - tm) * (y[i] - ym), 0) / sxx;
    const a = ym - b * tm;
    const s2 = ts.reduce((s, t, i) => s + (y[i] - a - b * t) ** 2, 0) / (n - 2);
    const se = Math.sqrt(s2 * (1 + 1 / n + (6 - tm) ** 2 / sxx));
    expect(half(tr, 0)).toBeCloseTo(2.353363 * se, 5);
  });

  it("regression: coefficient CI at a chosen confidence, ci95 kept", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8];
    const ys = [2.3, 3.9, 6.4, 7.6, 10.3, 11.8, 14.4, 15.7];
    const r95 = multipleRegression(ys, xs.map((x) => [x]));
    const r90 = multipleRegression(ys, xs.map((x) => [x]), undefined, { confidence: 0.9 });
    expect(r95.confidenceLevel).toBe(0.95);
    expect(r90.confidenceLevel).toBe(0.9);
    r95.coefficients.forEach((c, j) => {
      expect(c.ci).toEqual(c.ci95);
      expect(r90.coefficients[j].ci95).toEqual(c.ci95);
      const t90 = studentTQuantile(0.95, 6); // 1.943180
      expect(t90).toBeCloseTo(1.94318, 5);
      expect(r90.coefficients[j].ci[1] - c.value).toBeCloseTo(t90 * c.stdError, 9);
    });
    expect(() => multipleRegression(ys, xs.map((x) => [x]), undefined, { confidence: 0.2 })).toThrow();
    const sw = stepwiseRegression(ys, xs.map((x) => [x, Math.sin(x)]), ["a", "b"], { confidence: 0.99 });
    expect(sw.confidenceLevel).toBe(0.99);
    const w = (c: { ci: [number, number] }) => c.ci[1] - c.ci[0];
    expect(w(sw.coefficients[0])).toBeGreaterThan(sw.coefficients[0].ci95[1] - sw.coefficients[0].ci95[0]);
  });

  it("regression predict: mean-response vs prediction interval (textbook formulas)", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8];
    const ys = [2.3, 3.9, 6.4, 7.6, 10.3, 11.8, 14.4, 15.7];
    const r = multipleRegression(ys, xs.map((x) => [x]));
    const x0 = 10;
    const n = xs.length;
    const xm = xs.reduce((a, b) => a + b, 0) / n;
    const sxx = xs.reduce((s, x) => s + (x - xm) ** 2, 0);
    const s = r.standardError;
    const tq = studentTQuantile(0.95, n - 2);
    const ci = predict(r, [x0], { confidence: 0.9 });
    const pi = predict(r, [x0], { confidence: 0.9, prediction: true });
    expect(ci.value).toBeCloseTo(r.coefficients[0].value + r.coefficients[1].value * x0, 10);
    expect(ci.upper - ci.value).toBeCloseTo(tq * s * Math.sqrt(1 / n + (x0 - xm) ** 2 / sxx), 9);
    expect(pi.upper - pi.value).toBeCloseTo(tq * s * Math.sqrt(1 + 1 / n + (x0 - xm) ** 2 / sxx), 9);
    expect(predict(r, [3]).value).toBeCloseTo(r.fitted[2], 10);
    expect(() => predict(r, [1, 2])).toThrow();
  });

  it("pathPercentileBands gives central percentile bands per step", () => {
    const paths = Array.from({ length: 101 }, (_, i) => [0, i, 2 * i]);
    const { median, bands } = pathPercentileBands(paths, [0.9, 0.5, 0.9]);
    expect(bands.map((b) => b.level)).toEqual([0.5, 0.9]);
    expect(median).toEqual([0, 50, 100]);
    expect(bands[1].lower[1]).toBeCloseTo(5, 10);
    expect(bands[1].upper[1]).toBeCloseTo(95, 10);
    expect(bands[0].lower[2]).toBeCloseTo(50, 10);
    expect(bands[0].upper[2]).toBeCloseTo(150, 10);
    expect(() => pathPercentileBands(paths, [1])).toThrow();
  });
});

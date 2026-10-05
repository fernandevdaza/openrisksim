import { describe, expect, it } from "vitest";
import {
  binFrequencies,
  commonEdges,
  estimateMeanReversion,
  kurtosis,
  leveredBeta,
  logReturns,
  mean,
  npvProfile,
  pathPercentiles,
  percentileInterval,
  periodicFromEffective,
  probabilityPlotPoints,
  profileRates,
  quantileSorted,
  shareWhere,
  simpleNpv,
  skewness,
  statisticFn,
  stdDev,
  unleveredBeta,
  welchInterval,
} from "./stats";

describe("basic statistics", () => {
  const data = [2, 4, 4, 4, 5, 5, 7, 9];
  it("mean / sd / quantiles match Excel", () => {
    expect(mean(data)).toBe(5);
    expect(stdDev(data)).toBeCloseTo(2.13809, 4); // STDEV.S
    expect(quantileSorted([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantileSorted([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75);
    expect(skewness(data)).toBeCloseTo(0.81848, 4); // SKEW
    expect(kurtosis(data)).toBeCloseTo(0.940625, 4); // KURT
  });
  it("statistic functions for the bootstrap", () => {
    const v = Float64Array.from([1, 2, 3, 4, 5]);
    expect(statisticFn("mean")(v)).toBe(3);
    expect(statisticFn("median")(v)).toBe(3);
    expect(statisticFn("p95")(v)).toBeCloseTo(4.8);
    expect(statisticFn("cv")(v)).toBeCloseTo(stdDev(v) / 3);
    expect(percentileInterval([5, 1, 3, 2, 4], 0.5)).toEqual([2, 4]);
    expect(shareWhere([1, -1, NaN, 3], (x) => x > 0)).toBeCloseTo(2 / 3);
  });
});

describe("paths and processes", () => {
  it("percentiles across paths per step", () => {
    const paths = [
      [1, 1, 1],
      [1, 2, 3],
      [1, 3, 5],
    ];
    const p = pathPercentiles(paths, [0, 0.5, 1]);
    expect(p[1]).toEqual([1, 2, 3]);
    expect(p[2]).toEqual([1, 3, 5]);
    expect(logReturns([100, 110, 0, 121])[0]).toBeCloseTo(Math.log(1.1));
  });
  it("recovers OU parameters from a simulated series", () => {
    // deterministic pseudo-random normal via Box–Muller on an LCG
    let s = 42;
    const u = () => ((s = (s * 1664525 + 1013904223) % 4294967296) + 0.5) / 4294967296;
    const norm = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
    const dt = 1 / 52;
    const kappa = 3;
    const mu = 50;
    const sigma = 4;
    const b = Math.exp(-kappa * dt);
    const sd = sigma * Math.sqrt((1 - b * b) / (2 * kappa));
    const x = [40];
    for (let i = 0; i < 20000; i++) x.push(mu + (x[x.length - 1] - mu) * b + sd * norm());
    const est = estimateMeanReversion(x, dt)!;
    expect(est.longRunMean).toBeCloseTo(mu, 0);
    expect(est.speed).toBeGreaterThan(2);
    expect(est.speed).toBeLessThan(4);
    expect(est.volatility).toBeCloseTo(sigma, 0);
    expect(estimateMeanReversion([1, 2, 3, 4, 5, 6], 1)).toBeNull();
  });
});

describe("finance helpers", () => {
  it("npv profile and rate grid", () => {
    const cf = [-1000, 500, 500, 500];
    const prof = npvProfile(cf, [0, 0.1], simpleNpv);
    expect(prof[0].npv).toBe(500);
    expect(prof[1].npv).toBeCloseTo(243.43, 2);
    const rates = profileRates([0.234], 0.1);
    expect(rates[0]).toBe(0);
    expect(rates[rates.length - 1]).toBeGreaterThan(0.234);
  });
  it("beta relevering and periodic rates", () => {
    expect(leveredBeta(0.8, 0.5, 0.3)).toBeCloseTo(1.08);
    expect(unleveredBeta(1.08, 0.5, 0.3)).toBeCloseTo(0.8);
    expect(periodicFromEffective(0.1268250301, 12)).toBeCloseTo(0.01, 6);
  });
  it("Welch interval", () => {
    // t quantile stub: large df → normal 1.96
    const r = welchInterval({ mean: 10, variance: 4, n: 100 }, { mean: 9, variance: 9, n: 100 }, 0.95, () => 1.96);
    expect(r.diff).toBe(1);
    expect(r.se).toBeCloseTo(Math.sqrt(0.13));
    expect(r.lower).toBeCloseTo(1 - 1.96 * Math.sqrt(0.13));
    expect(r.df).toBeGreaterThan(150);
    expect(r.df).toBeLessThan(198);
  });
});

describe("binning and probability plots", () => {
  it("common edges and frequencies", () => {
    const edges = commonEdges([[0, 1], [2, 4]], 4);
    expect(edges).toEqual([0, 1, 2, 3, 4]);
    expect(binFrequencies([0, 0.5, 1, 4, NaN], edges)).toEqual([0.5, 0.25, 0, 0.25]);
  });
  it("P–P and Q–Q points of a uniform(0,1)", () => {
    const data = Array.from({ length: 100 }, (_, i) => (i + 0.5) / 100);
    const { pp, qq } = probabilityPlotPoints(data, (x) => x, (p) => p);
    expect(pp.length).toBe(100);
    for (const [a, b] of pp) expect(a).toBeCloseTo(b, 10);
    for (const [a, b] of qq) expect(a).toBeCloseTo(b, 10);
  });
});

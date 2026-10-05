import type { DistributionSpec } from "@openrisksim/core";
import { describe, expect, it } from "vitest";
import { andersonDarlingCdf, fitDistributions, kolmogorovCdf } from "./fitting";
import { createDistribution } from "./registry";
import { createRng } from "./rng";
import { expectClose } from "./testdata/helpers";

function sample(spec: DistributionSpec, n: number, seed: number): number[] {
  const d = createDistribution(spec);
  const rng = createRng(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(d.sample(rng));
  return out;
}

describe("goodness-of-fit distributions", () => {
  it("kolmogorovCdf matches scipy.stats.kstwo", () => {
    const ref: [number, number, number][] = [
      [10, 0.274, 0.6284796154565043],
      [20, 0.2, 0.647279826376585],
      [50, 0.15, 0.8097363348175198],
      [100, 0.1, 0.7473072429936127],
      [500, 0.05, 0.8413373977618461],
      [1000, 0.03, 0.6773097856085364],
      [5, 0.5, 0.888],
    ];
    for (const [n, d, v] of ref) expectClose(kolmogorovCdf(n, d), v, 2e-3, 0, `K(${n},${d})`);
  });

  it("Anderson–Darling limiting critical values", () => {
    expectClose(andersonDarlingCdf(1e6, 1.933), 0.9, 2e-3);
    expectClose(andersonDarlingCdf(1e6, 2.492), 0.95, 2e-3);
    expectClose(andersonDarlingCdf(1e6, 3.857), 0.99, 1e-3);
  });
});

interface Case {
  spec: DistributionSpec;
  n: number;
  /** relative tolerance for parameter recovery */
  tol: number;
}

const CONTINUOUS_CASES: Case[] = [
  { spec: { id: "normal", params: { mean: 10, stdDev: 2 } }, n: 3000, tol: 0.05 },
  { spec: { id: "lognormal", params: { mean: 100, stdDev: 60 } }, n: 3000, tol: 0.06 },
  { spec: { id: "gamma", params: { shape: 3, scale: 2 } }, n: 3000, tol: 0.08 },
  { spec: { id: "exponential", params: { rate: 0.5 } }, n: 3000, tol: 0.06 },
  { spec: { id: "weibull", params: { shape: 1.5, scale: 20, location: 0 } }, n: 3000, tol: 0.06 },
  { spec: { id: "uniform", params: { min: -3, max: 7 } }, n: 3000, tol: 0.01 },
  { spec: { id: "logistic", params: { mean: 5, scale: 2 } }, n: 5000, tol: 0.06 },
  { spec: { id: "gumbel", params: { location: 50, scale: 8 } }, n: 3000, tol: 0.06 },
  { spec: { id: "laplace", params: { location: 3, scale: 1.5 } }, n: 3000, tol: 0.06 },
  { spec: { id: "cauchy", params: { location: 0, scale: 1 } }, n: 3000, tol: 0.08 },
  { spec: { id: "studentT", params: { df: 3, mean: 1, scale: 2 } }, n: 5000, tol: 0.15 },
  { spec: { id: "pareto", params: { shape: 3, scale: 10 } }, n: 3000, tol: 0.06 },
  { spec: { id: "triangular", params: { min: 0, mode: 3, max: 10 } }, n: 3000, tol: 0.1 },
  { spec: { id: "beta", params: { alpha: 2, beta: 5, min: 0, max: 1 } }, n: 3000, tol: 0.15 },
];

const DISCRETE_CASES: Case[] = [
  { spec: { id: "poisson", params: { lambda: 4 } }, n: 3000, tol: 0.05 },
  { spec: { id: "negativeBinomial", params: { r: 3, p: 0.3 } }, n: 3000, tol: 0.15 },
  { spec: { id: "binomial", params: { n: 20, p: 0.3 } }, n: 3000, tol: 0.15 },
  { spec: { id: "geometric", params: { p: 0.2 } }, n: 3000, tol: 0.06 },
  { spec: { id: "bernoulli", params: { p: 0.3 } }, n: 2000, tol: 0.1 },
];

describe("fitDistributions", () => {
  let firstPlace = 0;
  const all = [...CONTINUOUS_CASES, ...DISCRETE_CASES];
  for (const c of all) {
    it(`recovers ${c.spec.id} ${JSON.stringify(c.spec.params)}`, () => {
      const data = sample(c.spec, c.n, 777);
      const res = fitDistributions(data);
      expect(res.length).toBeGreaterThan(0);
      res.forEach((r, i) => expect(r.rank).toBe(i + 1));
      for (let i = 1; i < res.length; i++) expect(res[i].aic).toBeGreaterThanOrEqual(res[i - 1].aic);
      const mine = res.find((r) => r.spec.id === c.spec.id);
      expect(mine, `${c.spec.id} was fitted`).toBeDefined();
      if (!mine) return;
      if (res[0].spec.id === c.spec.id) firstPlace++;
      expect(mine.rank, `${c.spec.id} rank (best: ${res[0].spec.id})`).toBeLessThanOrEqual(2);
      for (const [k, v] of Object.entries(c.spec.params)) {
        const got = mine.spec.params[k];
        if (k === "location" && (c.spec.id === "weibull" || c.spec.id === "frechet")) {
          expect(Math.abs(got)).toBeLessThan(1e-9);
          continue;
        }
        if (c.spec.id === "uniform" || c.spec.id === "triangular" || k === "min" || k === "max") {
          expect(Math.abs(got - v), `${k}: ${got} vs ${v}`).toBeLessThan(c.tol * 10 + 0.05);
          continue;
        }
        expect(Math.abs(got - v) / Math.max(Math.abs(v), 1), `${k}: ${got} vs ${v}`).toBeLessThan(c.tol);
      }
      // statistics are well-formed and the true family is not rejected
      expect(Number.isFinite(mine.logLikelihood)).toBe(true);
      expect(mine.aic).toBeCloseTo(2 * Object.keys(mine.spec.params).length - 2 * mine.logLikelihood, -2);
      expect(mine.ks.statistic).toBeGreaterThanOrEqual(0);
      expect(mine.ks.statistic).toBeLessThan(0.05);
      expect(mine.ks.pValue).toBeGreaterThan(0.01);
      if (mine.chiSquare) {
        expect(mine.chiSquare.bins).toBeGreaterThan(2);
        expect(mine.chiSquare.pValue).toBeGreaterThan(0.001);
      }
      if (createDistribution(c.spec).kind === "continuous") {
        expect(Number.isFinite(mine.ad.statistic)).toBe(true);
        expect(mine.ad.pValue).not.toBeNull();
      } else {
        expect(mine.ad.pValue).toBeNull();
      }
    });
  }
  it("ranks the true family first in most cases", () => {
    expect(firstPlace / all.length).toBeGreaterThanOrEqual(0.75);
  });

  it("chooses candidates compatible with the data support", () => {
    const neg = sample({ id: "normal", params: { mean: 0, stdDev: 1 } }, 500, 1);
    const ids = fitDistributions(neg).map((r) => r.spec.id);
    for (const id of ["lognormal", "gamma", "weibull", "exponential", "pareto", "frechet", "chiSquare", "f", "erlang", "rayleigh"]) {
      expect(ids).not.toContain(id);
    }
    expect(ids).toContain("normal");
  });

  it("auto-detects discrete data and honours explicit options", () => {
    const counts = sample({ id: "poisson", params: { lambda: 3 } }, 500, 5);
    const disc = fitDistributions(counts);
    expect(disc.every((r) => ["poisson", "geometric", "negativeBinomial", "binomial", "bernoulli", "discreteUniform"].includes(r.spec.id))).toBe(true);
    const cont = fitDistributions(counts.map((v) => v + 0.5), { candidates: ["normal", "gamma"] });
    expect(cont.map((r) => r.spec.id).sort()).toEqual(["gamma", "normal"]);
    const forced = fitDistributions(counts, { discrete: false, candidates: ["normal"] });
    expect(forced[0].spec.id).toBe("normal");
    expect(forced[0].ad.pValue).not.toBeNull();
  });

  it("supports every ranking criterion", () => {
    const data = sample({ id: "gamma", params: { shape: 2, scale: 3 } }, 800, 9);
    for (const rankBy of ["aic", "bic", "ks", "ad"] as const) {
      const res = fitDistributions(data, { rankBy });
      const key = (r: (typeof res)[number]): number =>
        rankBy === "ks" ? r.ks.statistic : rankBy === "ad" ? r.ad.statistic : rankBy === "bic" ? r.bic : r.aic;
      for (let i = 1; i < res.length; i++) expect(key(res[i])).toBeGreaterThanOrEqual(key(res[i - 1]));
    }
  });

  it("handles degenerate and tiny inputs", () => {
    expect(fitDistributions([])).toEqual([]);
    expect(fitDistributions([1])).toEqual([]);
    const c = fitDistributions([4, 4, 4, NaN]);
    expect(c[0].spec).toEqual({ id: "fixed", params: { value: 4 } });
    const small = fitDistributions([1.2, 3.4, 2.2, 5.1, 0.7]);
    expect(small.length).toBeGreaterThan(3);
    for (const r of small) {
      expect(Number.isFinite(r.aic)).toBe(true);
      expect(createDistribution(r.spec)).toBeDefined();
    }
  });

  it("all fitted specs are valid and constructible", () => {
    const data = sample({ id: "lognormal", params: { mean: 20, stdDev: 8 } }, 1000, 3);
    const res = fitDistributions(data);
    expect(res.length).toBeGreaterThan(15);
    for (const r of res) expect(() => createDistribution(r.spec)).not.toThrow();
  });
});

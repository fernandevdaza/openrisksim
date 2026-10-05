import { DISTRIBUTION_IDS, type DistributionId, type DistributionSpec } from "@openrisksim/core";
import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import { createDistribution, defaultSpec } from "./registry";
import { expectClose } from "./testdata/helpers";
import { REF } from "./testdata/scipyReference";

describe("families vs scipy reference values", () => {
  for (const f of REF.families) {
    it(`${f.id}`, () => {
      const d = createDistribution({ id: f.id as DistributionId, params: { ...f.params } as Record<string, number> });
      expect(d.kind).toBe(f.discrete ? "discrete" : "continuous");
      for (let i = 0; i < f.x.length; i++) {
        expectClose(d.pdf(f.x[i]), f.pdf[i], 1e-11, 1e-300, `${f.id} pdf(${f.x[i]})`);
        expectClose(d.cdf(f.x[i]), f.cdf[i], 1e-11, 1e-300, `${f.id} cdf(${f.x[i]})`);
      }
      for (let i = 0; i < f.p.length; i++) {
        if (f.discrete) expect(d.quantile(f.p[i]), `${f.id} q(${f.p[i]})`).toBe(f.q[i]);
        else expectClose(d.quantile(f.p[i]), f.q[i], 1e-10, 1e-12, `${f.id} q(${f.p[i]})`);
      }
      expectClose(d.mean(), f.mean, 1e-12, 1e-12, `${f.id} mean`);
      expectClose(d.variance(), f.variance, 1e-11, 1e-12, `${f.id} variance`);
    });
  }

  it("cosine (closed form, f(x) = cos((x−c)/s)/(2s))", () => {
    const d = createDistribution({ id: "cosine", params: { min: 0, max: Math.PI } });
    // c = π/2, s = 1
    expectClose(d.pdf(Math.PI / 2), 0.5, 1e-15);
    expectClose(d.cdf(Math.PI / 2), 0.5, 1e-15);
    expectClose(d.cdf(Math.PI / 2 + Math.PI / 6), 0.75, 1e-15);
    expectClose(d.quantile(0.75), Math.PI / 2 + Math.PI / 6, 1e-15);
    expectClose(d.variance(), Math.PI * Math.PI / 4 - 2, 1e-15);
    expect(d.pdf(-0.1)).toBe(0);
  });

  it("special shapes: triangular with mode at an end, PERT symmetric", () => {
    const t = createDistribution({ id: "triangular", params: { min: 0, mode: 0, max: 2 } });
    expectClose(t.pdf(0), 1, 1e-15);
    expectClose(t.cdf(1), 0.75, 1e-15);
    expectClose(t.quantile(0.75), 1, 1e-15);
    const t2 = createDistribution({ id: "triangular", params: { min: 0, mode: 2, max: 2 } });
    expectClose(t2.quantile(0.25), 1, 1e-15);
    expect(t2.quantile(1)).toBe(2);
    const p = createDistribution({ id: "pert", params: { min: 0, mode: 5, max: 10 } });
    expectClose(p.quantile(0.5), 5, 1e-12);
    expectClose(p.mean(), 5, 1e-15);
    expectClose(p.variance(), 25 / 7, 1e-14);
  });
});

describe("custom and fixed", () => {
  it("custom with weights is discrete over the given values", () => {
    const d = createDistribution({ id: "custom", params: {}, values: [10, 2.5, 7, 2.5], weights: [1, 1, 2, 0] });
    expect(d.kind).toBe("discrete");
    expectClose(d.pdf(2.5), 0.25, 1e-15);
    expectClose(d.pdf(7), 0.5, 1e-15);
    expect(d.pdf(3)).toBe(0);
    expectClose(d.cdf(7), 0.75, 1e-15);
    expect(d.quantile(0.25)).toBe(2.5);
    expect(d.quantile(0.2500001)).toBe(7);
    expect(d.quantile(0.9)).toBe(10);
    expectClose(d.mean(), 0.25 * 2.5 + 0.5 * 7 + 0.25 * 10, 1e-15);
    expect(d.support()).toEqual([2.5, 10]);
  });

  it("custom without weights is empirical continuous (PERCENTILE.INC)", () => {
    const d = createDistribution({ id: "custom", params: {}, values: [3, 1, 2, 10, 4] });
    expect(d.kind).toBe("continuous");
    // sorted 1,2,3,4,10 → q(p) = PERCENTILE.INC
    expectClose(d.quantile(0), 1, 0);
    expectClose(d.quantile(0.5), 3, 1e-15);
    expectClose(d.quantile(0.9), 7.6, 1e-14);
    expectClose(d.quantile(1), 10, 0);
    expectClose(d.cdf(3.5), 0.625, 1e-15);
    expectClose(d.pdf(5), 1 / (4 * 6), 1e-15);
    // mixture of uniforms on [1,2],[2,3],[3,4],[4,10]
    expectClose(d.mean(), (1.5 + 2.5 + 3.5 + 7) / 4, 1e-14);
    const m2 = (1 + 2 + 4) / 3 + (4 + 6 + 9) / 3 + (9 + 12 + 16) / 3 + (16 + 40 + 100) / 3;
    expectClose(d.variance(), m2 / 4 - d.mean() ** 2, 1e-12);
    for (const p of [0.01, 0.3, 0.77]) expectClose(d.cdf(d.quantile(p)), p, 1e-14);
  });

  it("fixed is a constant", () => {
    const d = createDistribution({ id: "fixed", params: { value: 42 } });
    expect(d.quantile(0.3)).toBe(42);
    expect(d.sample(createRng(1))).toBe(42);
    expect(d.mean()).toBe(42);
    expect(d.variance()).toBe(0);
    expect(d.cdf(41.9)).toBe(0);
    expect(d.cdf(42)).toBe(1);
  });
});

/** Specs used for round-trip and sampling tests (defaults + a few extreme parameterisations). */
const EXTRA_SPECS: DistributionSpec[] = [
  { id: "gamma", params: { shape: 0.05, scale: 2 } },
  { id: "gamma", params: { shape: 5000, scale: 0.01 } },
  { id: "beta", params: { alpha: 0.3, beta: 0.4, min: 0, max: 1 } },
  { id: "beta", params: { alpha: 800, beta: 300, min: -5, max: 5 } },
  { id: "studentT", params: { df: 1, mean: 0, scale: 1 } },
  { id: "studentT", params: { df: 0.6, mean: 3, scale: 2 } },
  { id: "studentT", params: { df: 3000, mean: 0, scale: 1 } },
  { id: "lognormal", params: { mean: 1e6, stdDev: 5e6 } },
  { id: "weibull", params: { shape: 0.3, scale: 1, location: 0 } },
  { id: "f", params: { df1: 0.5, df2: 0.8 } },
  { id: "chiSquare", params: { df: 0.2 } },
  { id: "normal", params: { mean: 1e9, stdDev: 1e-3 } },
];

function continuousSpecs(): DistributionSpec[] {
  const out: DistributionSpec[] = [];
  for (const id of DISTRIBUTION_IDS) {
    const s = defaultSpec(id);
    if (createDistribution(s).kind === "continuous") out.push(s);
  }
  return [...out, ...EXTRA_SPECS];
}

describe("quantile / cdf round trips", () => {
  const ps = [1e-12, 1e-8, 1e-4, 0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99, 0.9999, 1 - 1e-8, 1 - 1e-12];
  for (const spec of continuousSpecs()) {
    it(`continuous ${spec.id} ${JSON.stringify(spec.params)}`, () => {
      const d = createDistribution(spec);
      let prev = -Infinity;
      for (const p of ps) {
        const x = d.quantile(p);
        expect(Number.isFinite(x), `q(${p}) finite`).toBe(true);
        expect(x).toBeGreaterThanOrEqual(prev);
        prev = x;
        const [s0, s1] = d.support();
        if (Math.abs(x - s0) <= 1e-13 * Math.abs(x) || Math.abs(s1 - x) <= 1e-13 * Math.abs(x)) continue; // root not representable
        // compare in the better-conditioned tail; one ulp of x moves the cdf by pdf(x)·ulp(x)
        const fx = d.pdf(x);
        const ulpEffect = 4 * fx * 2.2e-16 * Math.abs(x);
        if (p <= 0.5) expectClose(d.cdf(x), p, 1e-8, ulpEffect, `${spec.id} cdf(q(${p}))`);
        else expectClose(1 - d.cdf(x), 1 - p, 1e-6, 1e-15 + ulpEffect, `${spec.id} sf(q(${p}))`);
        // and x ≈ q(cdf(x)); rounding of cdf(x) (≈ ε·min(F, 1−F) at best) moves x by that / pdf
        const F = d.cdf(x);
        const back = d.quantile(F);
        const dx = (8 * 2.2e-16 * (p <= 0.5 ? F : 1)) / fx;
        expectClose(back, x, 1e-6, dx + 1e-9 * (1 + Math.abs(x)), `${spec.id} q(cdf(${x}))`);
      }
    });
  }

  const discreteSpecs: DistributionSpec[] = [
    ...DISTRIBUTION_IDS.map((id) => defaultSpec(id)).filter((s) => createDistribution(s).kind === "discrete"),
    { id: "binomial", params: { n: 1_000_000, p: 0.3 } },
    { id: "poisson", params: { lambda: 1e5 } },
    { id: "poisson", params: { lambda: 0.01 } },
    { id: "negativeBinomial", params: { r: 0.5, p: 0.05 } },
    { id: "geometric", params: { p: 0.001 } },
    { id: "hypergeometric", params: { population: 10000, successes: 3000, draws: 500 } },
  ];
  for (const spec of discreteSpecs) {
    it(`discrete ${spec.id} ${JSON.stringify(spec.params)}`, () => {
      const d = createDistribution(spec);
      for (const p of [1e-12, 1e-6, 0.001, 0.05, 0.3, 0.5, 0.7, 0.95, 0.999, 1 - 1e-9]) {
        const k = d.quantile(p);
        expect(Number.isFinite(k)).toBe(true);
        expect(d.cdf(k), `cdf(q(${p})) ≥ p`).toBeGreaterThanOrEqual(p - 1e-12);
        // smallest such k: the previous support point has cdf < p
        const prevPt = spec.id === "custom" ? -Infinity : k - 1;
        if (prevPt >= d.support()[0]) expect(d.cdf(prevPt), `cdf(q(${p}) − 1) < p`).toBeLessThan(p + 1e-12);
        expect(d.quantile(d.cdf(k))).toBe(k);
      }
    });
  }
});

describe("sampling (200k draws) matches analytic mean/variance", () => {
  const N = 200_000;
  const specs: DistributionSpec[] = [];
  for (const id of DISTRIBUTION_IDS) {
    if (id === "cauchy") continue; // no moments
    let s = defaultSpec(id);
    if (id === "pareto") s = { id, params: { shape: 6, scale: 100 } }; // finite 4th moment
    if (id === "studentT") s = { id, params: { df: 8, mean: 0, scale: 1 } };
    if (id === "frechet") s = { id, params: { shape: 6, scale: 100, location: 0 } };
    specs.push(s);
  }
  specs.push({ id: "normal", params: { mean: 5, stdDev: 2 }, truncate: { min: 4, max: 9 } });
  specs.push({ id: "poisson", params: { lambda: 4.2 }, truncate: { min: 2, max: 6 } });
  for (const spec of specs) {
    it(`${spec.id}${spec.truncate ? " (truncated)" : ""}`, () => {
      const d = createDistribution(spec);
      const rng = createRng(2024);
      let s1 = 0;
      let s2 = 0;
      const m = d.mean();
      const [lo, hi] = d.support();
      let outside = 0;
      for (let i = 0; i < N; i++) {
        const x = d.sample(rng);
        if (!(x >= lo && x <= hi)) outside++;
        const dx = x - m;
        s1 += dx;
        s2 += dx * dx;
      }
      expect(outside).toBe(0);
      const sampleMean = m + s1 / N;
      const sampleVar = s2 / N - (s1 / N) ** 2;
      const v = d.variance();
      const se = Math.sqrt(v / N);
      expect(Math.abs(sampleMean - m), `mean ${sampleMean} vs ${m}`).toBeLessThan(5 * se + 1e-12);
      if (v > 0) expect(Math.abs(sampleVar / v - 1), `variance ${sampleVar} vs ${v}`).toBeLessThan(0.03);
      else expect(sampleVar).toBe(0);
    });
  }
});

describe("truncation", () => {
  it("normal truncated to [7, 12] matches scipy truncnorm", () => {
    const d = createDistribution({ id: "normal", params: { mean: 10, stdDev: 2 }, truncate: { min: 7, max: 12 } });
    expectClose(d.mean(), 9.709625105694947, 1e-9);
    expectClose(d.variance(), 1.6627400246295574, 1e-8);
    expectClose(d.cdf(9), 0.31209634585195783, 1e-12);
    expectClose(d.quantile(0.3), 8.946412804721982, 1e-12);
    expectClose(d.pdf(9), 0.2272745389349412, 1e-12);
    expect(d.pdf(6.9)).toBe(0);
    expect(d.cdf(12)).toBe(1);
    expect(d.support()).toEqual([7, 12]);
    expect(d.quantile(0)).toBe(7);
    expect(d.quantile(1)).toBe(12);
  });

  it("far upper-tail truncation keeps precision", () => {
    const d5 = createDistribution({ id: "normal", params: { mean: 0, stdDev: 1 }, truncate: { min: 5 } });
    expectClose(d5.mean(), 5.1865039671258515, 1e-8);
    expectClose(d5.variance(), 0.03269643461706184, 1e-6);
    expectClose(d5.quantile(0.5), 5.132018332044298, 1e-11);
    const d10 = createDistribution({ id: "normal", params: { mean: 0, stdDev: 1 }, truncate: { min: 10 } });
    expectClose(d10.quantile(0.5), 10.06841183608143, 1e-10);
    expectClose(d10.mean(), 10.098093233962564, 1e-8);
  });

  it("gamma truncated to [1, 10]", () => {
    const d = createDistribution({ id: "gamma", params: { shape: 2.5, scale: 3 }, truncate: { min: 1, max: 10 } });
    expectClose(d.mean(), 5.427900031330883, 1e-9);
    expectClose(d.variance(), 5.545009775555715, 1e-8);
  });

  it("discrete truncation (poisson to [2, 6])", () => {
    const d = createDistribution({ id: "poisson", params: { lambda: 4.2 }, truncate: { min: 1.5, max: 6 } });
    expectClose(d.mean(), 3.926877483599032, 1e-12);
    expectClose(d.variance(), 1.6853834516148507, 1e-11);
    const cum = [0.16752776, 0.40206662, 0.64833243, 0.85519571, 1];
    for (let k = 2; k <= 6; k++) expectClose(d.cdf(k), cum[k - 2], 1e-7);
    expect(d.quantile(0)).toBe(2);
    expect(d.quantile(0.1)).toBe(2);
    expect(d.quantile(0.17)).toBe(3);
    expect(d.quantile(0.999)).toBe(6);
    expect(d.support()).toEqual([2, 6]);
    expect(d.pdf(1)).toBe(0);
  });

  it("custom discrete truncation and impossible truncation", () => {
    const d = createDistribution({
      id: "custom",
      params: {},
      values: [1, 2, 3, 4],
      weights: [1, 1, 1, 1],
      truncate: { min: 1.5, max: 3 },
    });
    expect(d.quantile(0.4)).toBe(2);
    expect(d.quantile(0.6)).toBe(3);
    expectClose(d.mean(), 2.5, 1e-15);
    expect(() =>
      createDistribution({ id: "uniform", params: { min: 0, max: 1 }, truncate: { min: 2, max: 3 } }),
    ).toThrow();
  });
});

describe("performance of closed-form quantiles", () => {
  const ids: DistributionSpec[] = [
    { id: "normal", params: { mean: 0, stdDev: 1 } },
    { id: "lognormal", params: { mean: 10, stdDev: 3 } },
    { id: "uniform", params: { min: 0, max: 1 } },
    { id: "triangular", params: { min: 0, mode: 1, max: 3 } },
    { id: "exponential", params: { rate: 2 } },
    { id: "weibull", params: { shape: 2, scale: 1, location: 0 } },
    { id: "logistic", params: { mean: 0, scale: 1 } },
    { id: "gumbel", params: { location: 0, scale: 1 } },
  ];
  for (const spec of ids) {
    it(`${spec.id} quantile ≤ 2 µs`, () => {
      const d = createDistribution(spec);
      const n = 200_000;
      let s = 0;
      for (let i = 0; i < 20_000; i++) s += d.quantile((i + 0.5) / 20_000); // warm-up
      const t0 = performance.now();
      for (let i = 0; i < n; i++) s += d.quantile((i + 0.5) / n);
      const us = ((performance.now() - t0) * 1000) / n;
      expect(Number.isFinite(s)).toBe(true);
      expect(us).toBeLessThan(2);
    });
  }
  it("gamma / beta quantiles stay reasonably fast (< 30 µs)", () => {
    for (const spec of [
      { id: "gamma", params: { shape: 2.5, scale: 1 } },
      { id: "beta", params: { alpha: 2, beta: 5, min: 0, max: 1 } },
      { id: "pert", params: { min: 0, mode: 3, max: 10 } },
    ] as DistributionSpec[]) {
      const d = createDistribution(spec);
      const n = 20_000;
      const t0 = performance.now();
      let s = 0;
      for (let i = 0; i < n; i++) s += d.quantile((i + 0.5) / n);
      const us = ((performance.now() - t0) * 1000) / n;
      expect(Number.isFinite(s)).toBe(true);
      expect(us).toBeLessThan(30);
    }
  });
});

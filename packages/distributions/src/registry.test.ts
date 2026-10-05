import { DISTRIBUTION_IDS, type DistributionSpec } from "@openrisksim/core";
import { describe, expect, it } from "vitest";
import {
  DISTRIBUTION_META,
  DistributionError,
  createDistribution,
  defaultSpec,
  distributionCurve,
  getDistributionMeta,
  validateSpec,
} from "./index";

describe("DISTRIBUTION_META", () => {
  it("has exactly one entry per DistributionId, with bilingual texts", () => {
    expect(DISTRIBUTION_META.map((m) => m.id).sort()).toEqual([...DISTRIBUTION_IDS].sort());
    for (const m of DISTRIBUTION_META) {
      for (const txt of [m.name, m.description, m.usage]) {
        expect(txt.en.length).toBeGreaterThan(2);
        expect(txt.es.length).toBeGreaterThan(2);
      }
      for (const p of m.params) {
        expect(p.label.en.length).toBeGreaterThan(0);
        expect(p.label.es.length).toBeGreaterThan(0);
      }
    }
    expect(getDistributionMeta("pert").params.map((p) => p.key)).toEqual(["min", "mode", "max"]);
  });

  it("uses exactly the contract parameter keys", () => {
    const keys = Object.fromEntries(DISTRIBUTION_META.map((m) => [m.id, m.params.map((p) => p.key).join(",")]));
    expect(keys).toEqual({
      normal: "mean,stdDev",
      lognormal: "mean,stdDev",
      uniform: "min,max",
      triangular: "min,mode,max",
      pert: "min,mode,max",
      beta: "alpha,beta,min,max",
      gamma: "shape,scale",
      exponential: "rate",
      weibull: "shape,scale,location",
      logistic: "mean,scale",
      studentT: "df,mean,scale",
      chiSquare: "df",
      f: "df1,df2",
      cauchy: "location,scale",
      gumbel: "location,scale",
      frechet: "shape,scale,location",
      pareto: "shape,scale",
      laplace: "location,scale",
      rayleigh: "scale",
      erlang: "k,rate",
      arcsine: "min,max",
      cosine: "min,max",
      powerFunction: "alpha,min,max",
      trapezoidal: "min,mode1,mode2,max",
      bernoulli: "p",
      binomial: "n,p",
      poisson: "lambda",
      geometric: "p",
      negativeBinomial: "r,p",
      hypergeometric: "population,successes,draws",
      discreteUniform: "min,max",
      custom: "",
      fixed: "value",
    });
  });

  it("defaults are valid and buildable for every family", () => {
    for (const id of DISTRIBUTION_IDS) {
      const spec = defaultSpec(id);
      expect(validateSpec(spec), id).toEqual({ ok: true });
      const d = createDistribution(spec);
      expect(Number.isFinite(d.quantile(0.5)), id).toBe(true);
      expect(d.spec.id).toBe(id);
    }
  });

  it("getDistributionMeta throws for unknown ids", () => {
    expect(() => getDistributionMeta("nope" as never)).toThrow(DistributionError);
  });
});

describe("validateSpec", () => {
  const bad = (spec: DistributionSpec, key: string): void => {
    const r = validateSpec(spec);
    expect(r.ok, JSON.stringify(spec)).toBe(false);
    if (!r.ok) {
      expect(r.errors.map((e) => e.key)).toContain(key);
      for (const e of r.errors) {
        expect(e.message.en.length).toBeGreaterThan(5);
        expect(e.message.es.length).toBeGreaterThan(5);
      }
    }
  };

  it("catches ordering errors", () => {
    bad({ id: "triangular", params: { min: 10, mode: 5, max: 20 } }, "mode");
    bad({ id: "triangular", params: { min: 10, mode: 15, max: 10 } }, "max");
    bad({ id: "uniform", params: { min: 3, max: 3 } }, "max");
    bad({ id: "pert", params: { min: 1, mode: 4, max: 3 } }, "mode");
    bad({ id: "trapezoidal", params: { min: 0, mode1: 5, mode2: 4, max: 10 } }, "mode1");
    bad({ id: "trapezoidal", params: { min: 0, mode1: 2, mode2: 11, max: 10 } }, "mode2");
    bad({ id: "discreteUniform", params: { min: 5, max: 4 } }, "max");
    bad({ id: "hypergeometric", params: { population: 10, successes: 11, draws: 3 } }, "successes");
    bad({ id: "hypergeometric", params: { population: 10, successes: 5, draws: 12 } }, "draws");
    const r = validateSpec({ id: "triangular", params: { min: 10, mode: 5, max: 20 } });
    if (!r.ok) {
      expect(r.errors[0].message.es).toContain("más probable");
      expect(r.errors[0].message.en).toContain("most likely");
    }
  });

  it("catches out-of-range / non-integer / missing / non-finite parameters", () => {
    bad({ id: "normal", params: { mean: 0, stdDev: 0 } }, "stdDev");
    bad({ id: "normal", params: { mean: NaN, stdDev: 1 } }, "mean");
    bad({ id: "normal", params: { mean: 0 } }, "stdDev");
    bad({ id: "lognormal", params: { mean: -5, stdDev: 1 } }, "mean");
    bad({ id: "binomial", params: { n: 10.5, p: 0.5 } }, "n");
    bad({ id: "binomial", params: { n: 10, p: 1.5 } }, "p");
    bad({ id: "geometric", params: { p: 0 } }, "p");
    bad({ id: "erlang", params: { k: 0, rate: 1 } }, "k");
    bad({ id: "gamma", params: { shape: -1, scale: 1 } }, "shape");
    bad({ id: "poisson", params: { lambda: Infinity } }, "lambda");
  });

  it("validates custom values / weights", () => {
    bad({ id: "custom", params: {}, values: [] }, "values");
    bad({ id: "custom", params: {}, values: [1, NaN] }, "values");
    bad({ id: "custom", params: {}, values: [1, 2], weights: [1] }, "weights");
    bad({ id: "custom", params: {}, values: [1, 2], weights: [1, -1] }, "weights");
    bad({ id: "custom", params: {}, values: [1, 2], weights: [0, 0] }, "weights");
    expect(validateSpec({ id: "custom", params: {}, values: [1, 2], weights: [0, 3] }).ok).toBe(true);
  });

  it("validates truncation", () => {
    bad({ id: "normal", params: { mean: 0, stdDev: 1 }, truncate: { min: 2, max: 1 } }, "truncate");
    bad({ id: "uniform", params: { min: 0, max: 1 }, truncate: { min: 5 } }, "truncate");
    bad({ id: "fixed", params: { value: 3 }, truncate: { min: 4 } }, "truncate");
    expect(validateSpec({ id: "normal", params: { mean: 0, stdDev: 1 }, truncate: { min: 0 } }).ok).toBe(true);
  });

  it("rejects unknown ids", () => {
    bad({ id: "foo" as never, params: {} }, "id");
  });

  it("optional location / bounds may be omitted", () => {
    expect(validateSpec({ id: "weibull", params: { shape: 2, scale: 3 } }).ok).toBe(true);
    const b = createDistribution({ id: "beta", params: { alpha: 2, beta: 3 } });
    expect(b.support()).toEqual([0, 1]);
  });
});

describe("createDistribution", () => {
  it("throws DistributionError with bilingual details", () => {
    try {
      createDistribution({ id: "uniform", params: { min: 5, max: 1 } });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DistributionError);
      expect((e as DistributionError).errors[0].key).toBe("max");
    }
  });

  it("does not alias the input spec", () => {
    const spec: DistributionSpec = { id: "normal", params: { mean: 1, stdDev: 2 } };
    const d = createDistribution(spec);
    spec.params.mean = 100;
    expect(d.spec.params.mean).toBe(1);
    expect(d.mean()).toBe(1);
  });

  it("p outside [0,1] gives NaN; endpoints give support bounds", () => {
    const d = createDistribution({ id: "gamma", params: { shape: 2, scale: 1 } });
    expect(d.quantile(-0.1)).toBeNaN();
    expect(d.quantile(1.1)).toBeNaN();
    expect(d.quantile(0)).toBe(0);
    expect(d.quantile(1)).toBe(Infinity);
    const p = createDistribution({ id: "poisson", params: { lambda: 3 } });
    expect(p.quantile(0)).toBe(0);
    expect(p.quantile(1)).toBe(Infinity);
  });

  it("sample never returns an infinite value even if the RNG returns 0", () => {
    const d = createDistribution({ id: "normal", params: { mean: 0, stdDev: 1 } });
    const zero = { next: () => 0, seed: () => undefined };
    expect(Number.isFinite(d.sample(zero))).toBe(true);
  });
});

describe("distributionCurve", () => {
  it("continuous: n evenly spaced points between q(0.001) and q(0.999)", () => {
    const d = createDistribution({ id: "normal", params: { mean: 0, stdDev: 1 } });
    const c = distributionCurve(d, 101);
    expect(c.x.length).toBe(101);
    expect(c.x[0]).toBeCloseTo(-3.090232306167813, 12);
    expect(c.x[100]).toBeCloseTo(3.090232306167813, 12);
    expect(c.pdf[50]).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 12);
    expect(c.cdf[50]).toBeCloseTo(0.5, 12);
  });

  it("discrete: each integer", () => {
    const d = createDistribution({ id: "binomial", params: { n: 10, p: 0.5 } });
    const c = distributionCurve(d);
    expect(c.x).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(c.pdf.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    const p = distributionCurve(createDistribution({ id: "poisson", params: { lambda: 3 } }));
    expect(p.x[0]).toBe(0);
    expect(p.x.every((v) => Number.isInteger(v))).toBe(true);
  });

  it("custom discrete / fixed: support points", () => {
    const d = createDistribution({ id: "custom", params: {}, values: [1.5, 7, 3], weights: [1, 1, 2] });
    expect(distributionCurve(d).x).toEqual([1.5, 3, 7]);
    expect(distributionCurve(createDistribution({ id: "fixed", params: { value: 2.5 } })).x).toEqual([2.5]);
  });

  it("works for every default spec", () => {
    for (const id of DISTRIBUTION_IDS) {
      const c = distributionCurve(createDistribution(defaultSpec(id)));
      expect(c.x.length, id).toBeGreaterThan(0);
      expect(c.x.length).toBe(c.pdf.length);
      expect(c.cdf.every((v) => v >= 0 && v <= 1), id).toBe(true);
    }
  });
});

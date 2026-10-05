/**
 * Test helpers: a tiny seeded RNG and hand-written `Distribution` doubles, so engine tests do not depend
 * on `@openrisksim/distributions`. Use with
 * `vi.mock("./deps", async () => (await import("./test-utils")).fakeDistributionsModule());`
 * Not exported from the package index.
 */
import type { Distribution, DistributionSpec, Rng } from "@openrisksim/core";
import { stdNormalQuantile } from "./numeric";

/** mulberry32: small, fast, seedable 32-bit generator returning [0,1). */
export function testRng(seed = 1): Rng {
  let s = seed >>> 0;
  return {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    seed(v: number) {
      s = v >>> 0;
    },
  };
}

/** Abramowitz–Stegun 7.1.26 erf (|error| < 1.5e-7). */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}

export function testNormalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

interface Base {
  kind: "continuous" | "discrete";
  pdf(x: number): number;
  cdf(x: number): number;
  quantile(p: number): number;
  mean(): number;
  variance(): number;
  support(): [number, number];
}

function baseFor(spec: DistributionSpec): Base {
  const p = spec.params;
  switch (spec.id) {
    case "normal": {
      const m = p.mean;
      const s = p.stdDev;
      if (!(s > 0)) throw new Error("bad stdDev");
      return {
        kind: "continuous",
        pdf: (x) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI)),
        cdf: (x) => testNormalCdf((x - m) / s),
        quantile: (u) => m + s * stdNormalQuantile(u),
        mean: () => m,
        variance: () => s * s,
        support: () => [-Infinity, Infinity],
      };
    }
    case "uniform": {
      const a = p.min;
      const b = p.max;
      return {
        kind: "continuous",
        pdf: (x) => (x >= a && x <= b ? 1 / (b - a) : 0),
        cdf: (x) => (x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a)),
        quantile: (u) => a + u * (b - a),
        mean: () => (a + b) / 2,
        variance: () => (b - a) ** 2 / 12,
        support: () => [a, b],
      };
    }
    case "triangular": {
      const a = p.min;
      const c = p.mode;
      const b = p.max;
      const fc = (c - a) / (b - a);
      return {
        kind: "continuous",
        pdf: (x) =>
          x < a || x > b ? 0 : x < c ? (2 * (x - a)) / ((b - a) * (c - a)) : (2 * (b - x)) / ((b - a) * (b - c)),
        cdf: (x) =>
          x <= a ? 0 : x >= b ? 1 : x < c ? (x - a) ** 2 / ((b - a) * (c - a)) : 1 - (b - x) ** 2 / ((b - a) * (b - c)),
        quantile: (u) => (u < fc ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c))),
        mean: () => (a + b + c) / 3,
        variance: () => (a * a + b * b + c * c - a * b - a * c - b * c) / 18,
        support: () => [a, b],
      };
    }
    case "discreteUniform": {
      const a = Math.round(p.min);
      const b = Math.round(p.max);
      const k = b - a + 1;
      return {
        kind: "discrete",
        pdf: (x) => (Number.isInteger(x) && x >= a && x <= b ? 1 / k : 0),
        cdf: (x) => (x < a ? 0 : x >= b ? 1 : (Math.floor(x) - a + 1) / k),
        quantile: (u) => Math.min(b, a + Math.ceil(u * k) - 1),
        mean: () => (a + b) / 2,
        variance: () => (k * k - 1) / 12,
        support: () => [a, b],
      };
    }
    case "fixed": {
      const v = p.value;
      return {
        kind: "discrete",
        pdf: (x) => (x === v ? 1 : 0),
        cdf: (x) => (x >= v ? 1 : 0),
        quantile: () => v,
        mean: () => v,
        variance: () => 0,
        support: () => [v, v],
      };
    }
    default:
      throw new Error(`test double: unsupported distribution ${spec.id}`);
  }
}

/** Distribution test double with truncation implemented as q(cdf(min) + u·(cdf(max) − cdf(min))). */
export function testDistribution(spec: DistributionSpec): Distribution {
  const b = baseFor(spec);
  const tr = spec.truncate;
  const lo = tr?.min !== undefined ? b.cdf(tr.min) : 0;
  const hi = tr?.max !== undefined ? b.cdf(tr.max) : 1;
  const quantile = tr ? (u: number) => b.quantile(lo + u * (hi - lo)) : b.quantile;
  return {
    spec,
    kind: b.kind,
    pdf: b.pdf,
    cdf: b.cdf,
    quantile,
    sample: (rng: Rng) => quantile(rng.next()),
    mean: b.mean,
    variance: b.variance,
    support: b.support,
  };
}

/** Replacement for `@openrisksim/distributions` in tests (only what the engine uses). */
export function fakeDistributionsModule() {
  return {
    createRng: (seed?: number | null) => testRng(seed ?? 123456789),
    createDistribution: testDistribution,
    normalQuantile: stdNormalQuantile,
    normalCdf: testNormalCdf,
    /** Large-df normal approximation; good enough to check formula plumbing. */
    studentTCdf: (t: number) => testNormalCdf(t),
  };
}

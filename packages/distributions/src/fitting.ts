/**
 * Distribution fitting: maximum likelihood estimation for every applicable family plus
 * goodness-of-fit statistics (log-likelihood, AIC, BIC, Kolmogorov–Smirnov, Anderson–Darling,
 * chi-square with equiprobable bins).
 *
 * Notes on p-values: parameters are estimated from the same data, so the KS and AD p-values
 * (computed for fully specified null hypotheses, except AD for normal/lognormal which uses the
 * D'Agostino–Stephens correction) are conservative/approximate. They remain useful for ranking.
 */
import type { DistributionId, DistributionSpec } from "@openrisksim/core";
import type { BaseDist } from "./families/types";
import { nelderMead } from "./nelderMead";
import { buildBase, validateSpec } from "./registry";
import { EULER_GAMMA, chiSquareSf, digamma, lnGamma, trigamma } from "./special";

export interface FitResult {
  spec: DistributionSpec;
  logLikelihood: number;
  aic: number;
  bic: number;
  ks: { statistic: number; pValue: number };
  /** Anderson–Darling (continuous only; NaN statistic and null p-value for discrete fits). */
  ad: { statistic: number; pValue: number | null };
  chiSquare: { statistic: number; pValue: number; bins: number } | null;
  rank: number;
}

export interface FitOptions {
  candidates?: DistributionId[];
  discrete?: boolean;
  rankBy?: "ks" | "aic" | "bic" | "ad";
}

/* ------------------------------------------------------------------------------------------ */
/* Data summary                                                                               */
/* ------------------------------------------------------------------------------------------ */

interface Ctx {
  x: Float64Array; // sorted
  n: number;
  min: number;
  max: number;
  mean: number;
  /** MLE variance (divisor n) */
  variance: number;
  sd: number;
  median: number;
  /** mean / variance of ln x (only when min > 0) */
  meanLog: number;
  varLog: number;
  /** padding used for bounded families: range/(n − 1) */
  pad: number;
  /** distinct values and counts (for discrete fitting) */
  values: number[];
  counts: number[];
}

function quantileSorted(x: Float64Array, p: number): number {
  const h = (x.length - 1) * p;
  const i = Math.floor(h);
  if (i >= x.length - 1) return x[x.length - 1];
  return x[i] + (h - i) * (x[i + 1] - x[i]);
}

function makeCtx(data: Float64Array): Ctx {
  const x = data.slice().sort();
  const n = x.length;
  let s = 0;
  for (let i = 0; i < n; i++) s += x[i];
  const mean = s / n;
  let v = 0;
  for (let i = 0; i < n; i++) v += (x[i] - mean) * (x[i] - mean);
  const variance = v / n;
  let meanLog = NaN;
  let varLog = NaN;
  if (x[0] > 0) {
    let sl = 0;
    for (let i = 0; i < n; i++) sl += Math.log(x[i]);
    meanLog = sl / n;
    let vl = 0;
    for (let i = 0; i < n; i++) {
      const d = Math.log(x[i]) - meanLog;
      vl += d * d;
    }
    varLog = vl / n;
  }
  const values: number[] = [];
  const counts: number[] = [];
  for (let i = 0; i < n; i++) {
    if (values.length > 0 && values[values.length - 1] === x[i]) counts[counts.length - 1]++;
    else {
      values.push(x[i]);
      counts.push(1);
    }
  }
  const range = x[n - 1] - x[0];
  return {
    x,
    n,
    min: x[0],
    max: x[n - 1],
    mean,
    variance,
    sd: Math.sqrt(variance),
    median: quantileSorted(x, 0.5),
    meanLog,
    varLog,
    pad: range / Math.max(1, n - 1),
    values,
    counts,
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Estimators                                                                                 */
/* ------------------------------------------------------------------------------------------ */

interface Estimate {
  params: Record<string, number>;
  /** number of estimated parameters (for AIC/BIC) */
  k: number;
}

type Estimator = (c: Ctx) => Estimate | null;

/** Σ log pdf for a candidate spec (−∞ when invalid). */
function logLik(spec: DistributionSpec, c: Ctx): number {
  let d: BaseDist;
  try {
    d = buildBase(spec);
  } catch {
    return -Infinity;
  }
  const lp = d.logPdf ?? ((v: number) => Math.log(d.pdf(v)));
  let s = 0;
  for (let i = 0; i < c.values.length; i++) {
    const v = lp(c.values[i]);
    if (!(v > -Infinity) || Number.isNaN(v)) return -Infinity;
    s += c.counts[i] * v;
  }
  return s;
}

/** Numerical MLE via Nelder–Mead on an unconstrained parametrisation. */
function nmFit(
  c: Ctx,
  id: DistributionId,
  toParams: (z: number[]) => Record<string, number> | null,
  z0: number[],
  maxIter = 600,
): Record<string, number> | null {
  const obj = (z: number[]): number => {
    const p = toParams(z);
    if (!p) return Infinity;
    const ll = logLik({ id, params: p }, c);
    return -ll;
  };
  if (!Number.isFinite(obj(z0))) return null;
  let r = nelderMead(obj, z0, { maxIter, step: 0.3 });
  // one restart from the optimum to escape premature convergence
  r = nelderMead(obj, r.x, { maxIter, step: 0.1 });
  if (!Number.isFinite(r.value)) return null;
  return toParams(r.x);
}

function golden(f: (x: number) => number, a: number, b: number, iters = 80): number {
  const gr = (Math.sqrt(5) - 1) / 2;
  let c = b - gr * (b - a);
  let d = a + gr * (b - a);
  let fc = f(c);
  let fd = f(d);
  for (let i = 0; i < iters; i++) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - gr * (b - a);
      fc = f(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + gr * (b - a);
      fd = f(d);
    }
  }
  return (a + b) / 2;
}

/** Inverse digamma via Newton (Minka). */
function invDigamma(y: number): number {
  let x = y >= -2.22 ? Math.exp(y) + 0.5 : -1 / (y + EULER_GAMMA);
  for (let i = 0; i < 25; i++) {
    const dx = (digamma(x) - y) / trigamma(x);
    x -= dx;
    if (x <= 0) x = 1e-8;
    if (Math.abs(dx) < 1e-14 * x) break;
  }
  return x;
}

function gammaShapeMle(c: Ctx): number | null {
  const s = Math.log(c.mean) - c.meanLog;
  if (!(s > 0)) return null;
  let k = (3 - s + Math.sqrt((s - 3) * (s - 3) + 24 * s)) / (12 * s);
  for (let i = 0; i < 50; i++) {
    const g = Math.log(k) - digamma(k) - s;
    const dg = 1 / k - trigamma(k);
    const kn = k - g / dg;
    k = kn > 0 ? kn : k / 2;
    if (Math.abs(g / dg) < 1e-12 * k) break;
  }
  return Number.isFinite(k) && k > 0 ? k : null;
}

/** Gumbel (max) MLE on arbitrary data (used for gumbel and, on ln x, for fréchet). */
function gumbelMle(xs: Float64Array): { location: number; scale: number } | null {
  const n = xs.length;
  let m = 0;
  for (let i = 0; i < n; i++) m += xs[i];
  m /= n;
  let v = 0;
  for (let i = 0; i < n; i++) v += (xs[i] - m) * (xs[i] - m);
  const sd = Math.sqrt(v / n);
  if (!(sd > 0)) return null;
  const xmin = xs[0];
  // Profile equation in β: β = mean − Σ x e^{−x/β} / Σ e^{−x/β}; g(β) increasing → bisection.
  // Weights are shifted by the minimum so that they never overflow.
  const g = (b: number): number => {
    let s0 = 0;
    let s1 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.exp(-(xs[i] - xmin) / b);
      s0 += w;
      s1 += w * xs[i];
    }
    return b - m + s1 / s0;
  };
  let lo = sd * 1e-3;
  let hi = sd * 10;
  let glo = g(lo);
  let ghi = g(hi);
  let it = 0;
  while (glo > 0 && it++ < 60) {
    lo /= 4;
    glo = g(lo);
  }
  it = 0;
  while (ghi < 0 && it++ < 60) {
    hi *= 4;
    ghi = g(hi);
  }
  if (!(glo <= 0 && ghi >= 0)) return null;
  for (let i = 0; i < 100; i++) {
    const mid = 0.5 * (lo + hi);
    if (g(mid) < 0) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-13 * hi) break;
  }
  const beta = 0.5 * (lo + hi);
  let s0 = 0;
  for (let i = 0; i < n; i++) s0 += Math.exp(-(xs[i] - xmin) / beta);
  const location = xmin - beta * Math.log(s0 / n);
  return { location, scale: beta };
}

/**
 * Joint MLE of (min, mode, max) for triangular / PERT, starting from padded bounds.
 * Parametrisation keeps min < data min, max > data max and min ≤ mode ≤ max.
 */
function refineBounds(
  c: Ctx,
  id: "triangular" | "pert",
  a0: number,
  m0: number,
  b0: number,
): Record<string, number> | null {
  const range = c.max - c.min;
  const sig = (u: number): number => 1 / (1 + Math.exp(-u));
  const t0 = Math.min(0.999, Math.max(0.001, (m0 - a0) / (b0 - a0)));
  const z0 = [Math.log((c.min - a0) / range), Math.log(t0 / (1 - t0)), Math.log((b0 - c.max) / range)];
  const toParams = (z: number[]): Record<string, number> | null => {
    if (z[0] > 3 || z[2] > 3) return null; // bounds at most ~20 ranges away
    const a = c.min - Math.exp(z[0]) * range;
    const b = c.max + Math.exp(z[2]) * range;
    return { min: a, mode: a + (b - a) * sig(z[1]), max: b };
  };
  const start = logLik({ id, params: toParams(z0) as Record<string, number> }, c);
  const p = nmFit(c, id, toParams, z0, 800);
  if (!p) return null;
  return logLik({ id, params: p }, c) >= start ? p : null;
}

/** MLE of the beta shapes on fixed bounds [a, b] (Nelder–Mead on log-shapes, MoM start). */
function fitBetaShapes(c: Ctx, a: number, b: number): { alpha: number; beta: number; nll: number } | null {
  const w = b - a;
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < c.values.length; i++) {
    s1 += c.counts[i] * Math.log((c.values[i] - a) / w);
    s2 += c.counts[i] * Math.log((b - c.values[i]) / w);
  }
  if (!Number.isFinite(s1) || !Number.isFinite(s2)) return null;
  const m = (c.mean - a) / w;
  const v = c.variance / (w * w);
  let common = (m * (1 - m)) / v - 1;
  if (!(common > 0)) common = 1;
  const z0 = [Math.log(m * common), Math.log((1 - m) * common)];
  const n = c.n;
  const lnW = Math.log(w);
  const nll = (z: number[]): number => {
    const al = Math.exp(z[0]);
    const be = Math.exp(z[1]);
    if (!(al > 1e-6 && be > 1e-6 && al < 1e7 && be < 1e7)) return Infinity;
    return -(n * (lnGamma(al + be) - lnGamma(al) - lnGamma(be) - lnW) + (al - 1) * s1 + (be - 1) * s2);
  };
  let r = nelderMead(nll, z0, { step: 0.3, maxIter: 1000 });
  r = nelderMead(nll, r.x, { step: 0.05, maxIter: 1000 });
  if (!Number.isFinite(r.value)) return null;
  return { alpha: Math.exp(r.x[0]), beta: Math.exp(r.x[1]), nll: r.value };
}

const ESTIMATORS: Partial<Record<DistributionId, Estimator>> = {
  normal: (c) => (c.sd > 0 ? { params: { mean: c.mean, stdDev: c.sd }, k: 2 } : null),
  lognormal: (c) => {
    if (!(c.min > 0) || !(c.varLog > 0)) return null;
    const mean = Math.exp(c.meanLog + c.varLog / 2);
    return { params: { mean, stdDev: mean * Math.sqrt(Math.expm1(c.varLog)) }, k: 2 };
  },
  uniform: (c) => ({ params: { min: c.min - c.pad, max: c.max + c.pad }, k: 2 }),
  triangular: (c) => {
    const a = c.min - c.pad;
    const b = c.max + c.pad;
    // the MLE of the mode lies at a data point: scan (a subsample of) them
    const cand: number[] = [];
    const m = Math.min(c.values.length, 300);
    for (let i = 0; i < m; i++) cand.push(c.values[Math.floor((i * (c.values.length - 1)) / Math.max(1, m - 1))]);
    let best = -Infinity;
    let bestMode = c.median;
    for (const mode of cand) {
      const ll = logLik({ id: "triangular", params: { min: a, mode, max: b } }, c);
      if (ll > best) {
        best = ll;
        bestMode = mode;
      }
    }
    const refined = refineBounds(c, "triangular", a, bestMode, b);
    return { params: refined ?? { min: a, mode: bestMode, max: b }, k: 3 };
  },
  pert: (c) => {
    const a = c.min - c.pad;
    const b = c.max + c.pad;
    const nll = (mode: number): number => -logLik({ id: "pert", params: { min: a, mode, max: b } }, c);
    let bestMode = c.median;
    let best = Infinity;
    for (let i = 0; i <= 40; i++) {
      const mode = a + ((b - a) * i) / 40;
      const v = nll(mode);
      if (v < best) {
        best = v;
        bestMode = mode;
      }
    }
    const step = (b - a) / 40;
    const mode0 = golden(nll, Math.max(a, bestMode - step), Math.min(b, bestMode + step), 60);
    const mode = nll(mode0) <= best ? mode0 : bestMode;
    const refined = refineBounds(c, "pert", a, mode, b);
    return { params: refined ?? { min: a, mode, max: b }, k: 3 };
  },
  beta: (c) => {
    // Bounds: the data range with a small padding (4 estimated parameters) and, for data that
    // already lie in [0, 1] (proportions), the standard unit interval (2 estimated parameters).
    const options: [number, number, number][] = [[c.min - c.pad, c.max + c.pad, 4]];
    if (c.min > 0 && c.max < 1) options.push([0, 1, 2]);
    let best: Estimate | null = null;
    let bestAic = Infinity;
    for (const [a, b, k] of options) {
      const fit = fitBetaShapes(c, a, b);
      if (!fit) continue;
      const aic = 2 * k + 2 * fit.nll;
      if (aic < bestAic) {
        bestAic = aic;
        best = { params: { alpha: fit.alpha, beta: fit.beta, min: a, max: b }, k };
      }
    }
    return best;
  },
  gamma: (c) => {
    if (!(c.min > 0)) return null;
    const k = gammaShapeMle(c);
    if (k === null) return null;
    return { params: { shape: k, scale: c.mean / k }, k: 2 };
  },
  erlang: (c) => {
    if (!(c.min > 0)) return null;
    const shape = gammaShapeMle(c);
    if (shape === null) return null;
    const k = Math.max(1, Math.round(shape));
    return { params: { k, rate: k / c.mean }, k: 2 };
  },
  exponential: (c) => (c.min >= 0 && c.mean > 0 ? { params: { rate: 1 / c.mean }, k: 1 } : null),
  chiSquare: (c) => {
    if (!(c.min > 0)) return null;
    const half = invDigamma(c.meanLog - Math.LN2);
    return Number.isFinite(half) && half > 0 ? { params: { df: 2 * half }, k: 1 } : null;
  },
  weibull: (c) => {
    if (!(c.min > 0)) return null;
    const n = c.n;
    const z = new Float64Array(n);
    for (let i = 0; i < n; i++) z[i] = Math.log(c.x[i]);
    const zmax = z[n - 1];
    const g = (k: number): number => {
      let s0 = 0;
      let s1 = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.exp(k * (z[i] - zmax));
        s0 += w;
        s1 += w * z[i];
      }
      return s1 / s0 - 1 / k - c.meanLog;
    };
    let lo = 1e-3;
    let hi = 1e3;
    if (g(lo) > 0 || g(hi) < 0) return null;
    for (let i = 0; i < 200; i++) {
      const mid = Math.sqrt(lo * hi);
      if (g(mid) < 0) lo = mid;
      else hi = mid;
      if (hi / lo - 1 < 1e-12) break;
    }
    const k = Math.sqrt(lo * hi);
    let s0 = 0;
    for (let i = 0; i < n; i++) s0 += Math.exp(k * (z[i] - zmax));
    const scale = Math.exp(zmax + Math.log(s0 / n) / k);
    return { params: { shape: k, scale, location: 0 }, k: 2 };
  },
  frechet: (c) => {
    if (!(c.min > 0)) return null;
    const lx = new Float64Array(c.n);
    for (let i = 0; i < c.n; i++) lx[i] = Math.log(c.x[i]);
    const g = gumbelMle(lx);
    if (!g) return null;
    return { params: { shape: 1 / g.scale, scale: Math.exp(g.location), location: 0 }, k: 2 };
  },
  gumbel: (c) => {
    const g = gumbelMle(c.x);
    return g ? { params: { location: g.location, scale: g.scale }, k: 2 } : null;
  },
  pareto: (c) => {
    if (!(c.min > 0)) return null;
    let s = 0;
    for (let i = 0; i < c.n; i++) s += Math.log(c.x[i] / c.min);
    if (!(s > 0)) return null;
    return { params: { shape: c.n / s, scale: c.min }, k: 2 };
  },
  laplace: (c) => {
    let s = 0;
    for (let i = 0; i < c.n; i++) s += Math.abs(c.x[i] - c.median);
    const b = s / c.n;
    return b > 0 ? { params: { location: c.median, scale: b }, k: 2 } : null;
  },
  rayleigh: (c) => {
    if (!(c.min >= 0)) return null;
    let s = 0;
    for (let i = 0; i < c.n; i++) s += c.x[i] * c.x[i];
    const sc = Math.sqrt(s / (2 * c.n));
    return sc > 0 ? { params: { scale: sc }, k: 1 } : null;
  },
  logistic: (c) => {
    const p = nmFit(
      c,
      "logistic",
      (z) => ({ mean: z[0], scale: Math.exp(z[1]) }),
      [c.median, Math.log((c.sd * Math.sqrt(3)) / Math.PI)],
    );
    return p ? { params: p, k: 2 } : null;
  },
  cauchy: (c) => {
    const iqr = quantileSorted(c.x, 0.75) - quantileSorted(c.x, 0.25);
    const p = nmFit(
      c,
      "cauchy",
      (z) => ({ location: z[0], scale: Math.exp(z[1]) }),
      [c.median, Math.log(iqr > 0 ? iqr / 2 : c.sd || 1)],
    );
    return p ? { params: p, k: 2 } : null;
  },
  studentT: (c) => {
    const iqr = quantileSorted(c.x, 0.75) - quantileSorted(c.x, 0.25);
    const s0 = iqr > 0 ? iqr / 1.349 : c.sd;
    const p = nmFit(
      c,
      "studentT",
      (z) => {
        if (z[2] > Math.log(1e4) || z[2] < Math.log(0.05)) return null;
        return { df: Math.exp(z[2]), mean: z[0], scale: Math.exp(z[1]) };
      },
      [c.median, Math.log(s0), Math.log(5)],
      900,
    );
    return p ? { params: p, k: 3 } : null;
  },
  f: (c) => {
    if (!(c.min > 0)) return null;
    let d2 = c.mean > 1 ? (2 * c.mean) / (c.mean - 1) : 10;
    if (!(d2 > 4.5) || d2 > 1e3) d2 = 10;
    const v = c.variance;
    let d1 = (2 * d2 * d2 * (d2 - 2)) / (v * (d2 - 2) * (d2 - 2) * (d2 - 4) - 2 * d2 * d2);
    if (!(d1 > 0) || d1 > 1e3) d1 = 5;
    const p = nmFit(
      c,
      "f",
      (z) => {
        if (Math.abs(z[0]) > 14 || Math.abs(z[1]) > 14) return null;
        return { df1: Math.exp(z[0]), df2: Math.exp(z[1]) };
      },
      [Math.log(d1), Math.log(d2)],
    );
    return p ? { params: p, k: 2 } : null;
  },
  arcsine: (c) => ({ params: { min: c.min - c.pad, max: c.max + c.pad }, k: 2 }),
  cosine: (c) => {
    const centre = (c.min + c.max) / 2;
    const half = ((c.max - c.min) / 2) * (1 + 2 / c.n) + 1e-12 * (Math.abs(centre) + 1);
    const p = nmFit(
      c,
      "cosine",
      (z) => {
        const h = Math.exp(z[1]);
        return { min: z[0] - h, max: z[0] + h };
      },
      [centre, Math.log(half)],
    );
    return p ? { params: p, k: 2 } : null;
  },
  powerFunction: (c) => {
    const a = c.min - c.pad;
    const b = c.max + c.pad;
    let s = 0;
    for (let i = 0; i < c.n; i++) s += Math.log((c.x[i] - a) / (b - a));
    if (!(s < 0)) return null;
    return { params: { alpha: -c.n / s, min: a, max: b }, k: 3 };
  },
  trapezoidal: (c) => {
    const a = c.min - c.pad;
    const d = c.max + c.pad;
    const w = d - a;
    const sig = (u: number): number => 1 / (1 + Math.exp(-u));
    const logit = (p: number): number => Math.log(p / (1 - p));
    const q1 = (quantileSorted(c.x, 0.3) - a) / w;
    const q2 = (quantileSorted(c.x, 0.7) - a) / w;
    const s2 = (q2 - q1) / (1 - q1);
    const p = nmFit(
      c,
      "trapezoidal",
      (z) => {
        const m1 = a + w * sig(z[0]);
        const m2 = m1 + (d - m1) * sig(z[1]);
        return { min: a, mode1: m1, mode2: Math.min(m2, d), max: d };
      },
      [logit(Math.min(0.99, Math.max(0.01, q1))), logit(Math.min(0.99, Math.max(0.01, s2)))],
    );
    return p ? { params: p, k: 4 } : null;
  },

  /* ---------------- discrete ---------------- */
  poisson: (c) => (c.min >= 0 && c.mean > 0 ? { params: { lambda: c.mean }, k: 1 } : null),
  geometric: (c) => (c.min >= 0 ? { params: { p: 1 / (1 + c.mean) }, k: 1 } : null),
  bernoulli: (c) => {
    if (!(c.min >= 0 && c.max <= 1) || !c.values.every((v) => v === 0 || v === 1)) return null;
    return { params: { p: c.mean }, k: 1 };
  },
  discreteUniform: (c) => ({ params: { min: c.min, max: c.max }, k: 2 }),
  negativeBinomial: (c) => {
    if (!(c.min >= 0) || !(c.variance > c.mean) || !(c.mean > 0)) return null;
    let sumLgx1 = 0;
    for (let i = 0; i < c.values.length; i++) sumLgx1 += c.counts[i] * lnGamma(c.values[i] + 1);
    const total = c.mean * c.n;
    const ll = (r: number): number => {
      const p = r / (r + c.mean);
      let s = 0;
      for (let i = 0; i < c.values.length; i++) s += c.counts[i] * lnGamma(c.values[i] + r);
      return s - c.n * lnGamma(r) - sumLgx1 + c.n * r * Math.log(p) + total * Math.log1p(-p);
    };
    const r0 = (c.mean * c.mean) / (c.variance - c.mean);
    const lr = golden((u) => -ll(Math.exp(u)), Math.log(r0) - 5, Math.log(r0) + 5, 100);
    const r = Math.exp(lr);
    return { params: { r, p: r / (r + c.mean) }, k: 2 };
  },
  binomial: (c) => {
    if (!(c.min >= 0) || !(c.mean > 0)) return null;
    const total = c.mean * c.n;
    const ll = (N: number): number => {
      const p = c.mean / N;
      if (p >= 1) return N === c.max ? 0 : -Infinity;
      let s = 0;
      for (let i = 0; i < c.values.length; i++) {
        const v = c.values[i];
        s += c.counts[i] * (lnGamma(N + 1) - lnGamma(v + 1) - lnGamma(N - v + 1));
      }
      return s + total * Math.log(p) + (c.n * N - total) * Math.log1p(-p);
    };
    const mom = c.variance < c.mean ? (c.mean * c.mean) / (c.mean - c.variance) : c.max * 10;
    const upper = Math.min(Math.max(c.max + 50, Math.ceil(3 * mom)), c.max + 20000);
    let bestN = c.max;
    let best = -Infinity;
    for (let N = Math.max(1, c.max); N <= upper; N++) {
      const v = ll(N);
      if (v > best) {
        best = v;
        bestN = N;
      }
    }
    return { params: { n: bestN, p: Math.min(1, c.mean / bestN) }, k: 2 };
  },
};

const CONTINUOUS_DEFAULT: DistributionId[] = [
  "normal", "lognormal", "uniform", "triangular", "pert", "beta", "gamma", "exponential", "weibull",
  "logistic", "studentT", "chiSquare", "f", "cauchy", "gumbel", "frechet", "pareto", "laplace",
  "rayleigh", "erlang", "arcsine", "cosine", "powerFunction", "trapezoidal",
];
const DISCRETE_DEFAULT: DistributionId[] = [
  "poisson", "geometric", "negativeBinomial", "binomial", "bernoulli", "discreteUniform",
];

/* ------------------------------------------------------------------------------------------ */
/* Goodness of fit                                                                            */
/* ------------------------------------------------------------------------------------------ */

/** Kolmogorov distribution: P(K > λ) = 2 Σ (−1)^{j−1} e^{−2j²λ²}. */
function kolmogorovQ(lambda: number): number {
  if (lambda < 0.2) return 1;
  let sum = 0;
  let sign = 1;
  for (let j = 1; j <= 100; j++) {
    const term = Math.exp(-2 * j * j * lambda * lambda);
    sum += sign * term;
    if (term < 1e-17 * Math.abs(sum) || term < 1e-300) break;
    sign = -sign;
  }
  return Math.min(1, Math.max(0, 2 * sum));
}

/** Matrix power with decimal exponent tracking (Marsaglia–Tsang–Wang). */
function mtwMatrixPower(A: Float64Array, eA: number, m: number, n: number): { M: Float64Array; e: number } {
  if (n === 1) return { M: A.slice(), e: eA };
  const half = mtwMatrixPower(A, eA, m, Math.floor(n / 2));
  let B = mtwMul(half.M, half.M, m);
  let eB = 2 * half.e;
  if (n % 2 === 1) {
    B = mtwMul(A, B, m);
    eB += eA;
  }
  const mid = Math.floor(m / 2) * m + Math.floor(m / 2);
  if (B[mid] > 1e140) {
    for (let i = 0; i < m * m; i++) B[i] *= 1e-140;
    eB += 140;
  }
  return { M: B, e: eB };
}

function mtwMul(x: Float64Array, y: Float64Array, m: number): Float64Array {
  const z = new Float64Array(m * m);
  for (let i = 0; i < m; i++) {
    for (let k = 0; k < m; k++) {
      const xik = x[i * m + k];
      if (xik === 0) continue;
      for (let j = 0; j < m; j++) z[i * m + j] += xik * y[k * m + j];
    }
  }
  return z;
}

/** P(D_n < d) for the one-sample two-sided KS statistic — Marsaglia, Tsang & Wang (2003). */
export function kolmogorovCdf(n: number, d: number): number {
  if (d <= 0) return 0;
  if (d >= 1) return 1;
  const s = d * d * n;
  if (s > 7.24 || (s > 3.76 && n > 99)) {
    return 1 - 2 * Math.exp(-(2.000071 + 0.331 / Math.sqrt(n) + 1.409 / n) * s);
  }
  const k = Math.floor(n * d) + 1;
  const m = 2 * k - 1;
  const h = k - n * d;
  if (m > 100) {
    // asymptotic with Stephens' small-sample correction (accurate for large n)
    const sq = Math.sqrt(n);
    return 1 - kolmogorovQ((sq + 0.12 + 0.11 / sq) * d);
  }
  const H = new Float64Array(m * m);
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) H[i * m + j] = i - j + 1 < 0 ? 0 : 1;
  for (let i = 0; i < m; i++) {
    H[i * m] -= Math.pow(h, i + 1);
    H[(m - 1) * m + i] -= Math.pow(h, m - i);
  }
  H[(m - 1) * m] += 2 * h - 1 > 0 ? Math.pow(2 * h - 1, m) : 0;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      if (i - j + 1 > 0) for (let g = 1; g <= i - j + 1; g++) H[i * m + j] /= g;
    }
  }
  const { M, e } = mtwMatrixPower(H, 0, m, n);
  let sv = M[(k - 1) * m + (k - 1)];
  let eQ = e;
  for (let i = 1; i <= n; i++) {
    sv = (sv * i) / n;
    if (sv < 1e-140) {
      sv *= 1e140;
      eQ -= 140;
    }
  }
  return Math.min(1, Math.max(0, sv * Math.pow(10, eQ)));
}

/** Marsaglia & Marsaglia (2004): limiting AD distribution P(A² < z). */
function adInf(z: number): number {
  if (z <= 0) return 0;
  if (z < 2) {
    return (
      (Math.exp(-1.2337141 / z) / Math.sqrt(z)) *
      (2.00012 + (0.247105 - (0.0649821 - (0.0347962 - (0.011672 - 0.00168691 * z) * z) * z) * z) * z)
    );
  }
  return Math.exp(-Math.exp(1.0776 - (2.30695 - (0.43424 - (0.082433 - (0.008056 - 0.0003146 * z) * z) * z) * z) * z));
}

function adErrFix(n: number, x: number): number {
  if (x > 0.8) {
    return (-130.2137 + (745.2337 - (1705.091 - (1950.646 - (1116.36 - 255.7844 * x) * x) * x) * x) * x) / n;
  }
  const c = 0.01265 + 0.1757 / n;
  if (x < c) {
    let t = x / c;
    t = Math.sqrt(t) * (1 - t) * (49 * t - 102);
    return (t * (0.0037 / (n * n) + 0.00078 / n + 0.00006)) / n;
  }
  let t = (x - c) / (0.8 - c);
  t = -0.00022633 + (6.54034 - (14.6538 - (14.458 - (8.259 - 1.91864 * t) * t) * t) * t) * t;
  return (t * (0.04213 + 0.01365 / n)) / n;
}

/** P(A² < z) for a fully specified continuous null with sample size n. */
export function andersonDarlingCdf(n: number, z: number): number {
  const x = adInf(z);
  return Math.min(1, Math.max(0, x + adErrFix(n, x)));
}

/** D'Agostino & Stephens p-value for the normality AD test with estimated mean and variance. */
function adNormalPValue(a2: number, n: number): number {
  const a = a2 * (1 + 0.75 / n + 2.25 / (n * n));
  let p: number;
  if (a >= 0.6) p = Math.exp(1.2937 - 5.709 * a + 0.0186 * a * a);
  else if (a > 0.34) p = Math.exp(0.9177 - 4.279 * a - 1.38 * a * a);
  else if (a > 0.2) p = 1 - Math.exp(-8.318 + 42.796 * a - 59.938 * a * a);
  else p = 1 - Math.exp(-13.436 + 101.14 * a - 223.73 * a * a);
  return Math.min(1, Math.max(0, p));
}

function ksStatistic(d: BaseDist, c: Ctx, discrete: boolean): number {
  const n = c.n;
  let D = 0;
  if (!discrete) {
    for (let i = 0; i < n; i++) {
      const F = d.cdf(c.x[i]);
      D = Math.max(D, (i + 1) / n - F, F - i / n);
    }
    return D;
  }
  let cum = 0;
  for (let j = 0; j < c.values.length; j++) {
    const v = c.values[j];
    const below = cum / n; // Fn(v−)
    cum += c.counts[j];
    const Fn = cum / n;
    const F = d.cdf(v);
    const Fleft = d.cdf(v - 1); // integer support
    D = Math.max(D, Math.abs(Fn - F), Math.abs(below - Fleft));
  }
  return D;
}

function adStatistic(d: BaseDist, c: Ctx): number {
  const n = c.n;
  const sf = d.sf ?? ((v: number) => 1 - d.cdf(v));
  let s = 0;
  for (let i = 0; i < n; i++) {
    const F = Math.max(d.cdf(c.x[i]), 1e-300);
    const S = Math.max(sf(c.x[n - 1 - i]), 1e-300);
    s += (2 * i + 1) * (Math.log(F) + Math.log(S));
  }
  return -n - s / n;
}

function chiSquareTest(
  d: BaseDist,
  c: Ctx,
  discrete: boolean,
  kParams: number,
): { statistic: number; pValue: number; bins: number } | null {
  const n = c.n;
  if (!discrete) {
    let kb = Math.ceil(2 * Math.pow(n, 0.4));
    kb = Math.min(kb, Math.floor(n / 5));
    if (kb - 1 - kParams < 1) return null;
    const E = n / kb;
    let stat = 0;
    let idx = 0;
    for (let j = 1; j <= kb; j++) {
      const edge = j === kb ? Infinity : d.quantile(j / kb);
      let o = 0;
      while (idx < n && (c.x[idx] <= edge || j === kb)) {
        o++;
        idx++;
      }
      stat += ((o - E) * (o - E)) / E;
    }
    const df = kb - 1 - kParams;
    return { statistic: stat, pValue: chiSquareSf(stat, df), bins: kb };
  }
  // discrete: consecutive integer bins with expected count ≥ 5
  const [lo] = d.support();
  const start = Number.isFinite(lo) ? lo : c.min;
  const sf = d.sf ?? ((v: number) => 1 - d.cdf(v));
  const binEnds: number[] = [];
  const expected: number[] = [];
  let acc = 0;
  let k = start;
  const kMax = c.max;
  let guard = 0;
  while (k <= kMax && guard++ < 1e6) {
    acc += n * d.pdf(k);
    if (acc >= 5) {
      binEnds.push(k);
      expected.push(acc);
      acc = 0;
    }
    k++;
  }
  // remaining mass (including the upper tail beyond the largest observation)
  const tail = n * sf(k - 1) + acc;
  if (binEnds.length === 0) return null;
  if (tail >= 5) {
    binEnds.push(Infinity);
    expected.push(tail);
  } else {
    binEnds[binEnds.length - 1] = Infinity;
    expected[expected.length - 1] += tail;
  }
  const kb = binEnds.length;
  if (kb - 1 - kParams < 1) return null;
  let stat = 0;
  let vi = 0;
  for (let b = 0; b < kb; b++) {
    let o = 0;
    while (vi < c.values.length && c.values[vi] <= binEnds[b]) {
      o += c.counts[vi];
      vi++;
    }
    stat += ((o - expected[b]) * (o - expected[b])) / expected[b];
  }
  const df = kb - 1 - kParams;
  return { statistic: stat, pValue: chiSquareSf(stat, df), bins: kb };
}

function evaluateFit(id: DistributionId, est: Estimate, c: Ctx, discrete: boolean): FitResult | null {
  const spec: DistributionSpec = { id, params: est.params };
  for (const v of Object.values(est.params)) if (!Number.isFinite(v)) return null;
  if (!validateSpec(spec).ok) return null;
  let d: BaseDist;
  try {
    d = buildBase(spec);
  } catch {
    return null;
  }
  const ll = logLik(spec, c);
  if (!Number.isFinite(ll)) return null;
  const k = est.k;
  const n = c.n;
  const D = ksStatistic(d, c, discrete);
  const ksP = 1 - kolmogorovCdf(n, D);
  let ad: FitResult["ad"] = { statistic: NaN, pValue: null };
  if (!discrete) {
    const a2 = adStatistic(d, c);
    let p: number | null;
    if (id === "normal") p = adNormalPValue(a2, n);
    // lognormal: F(x) = Φ((ln x − μ)/σ), so A² equals the normality statistic of ln x
    else if (id === "lognormal") p = Number.isFinite(a2) ? adNormalPValue(a2, n) : null;
    else p = Number.isFinite(a2) ? 1 - andersonDarlingCdf(n, a2) : null;
    ad = { statistic: a2, pValue: p };
  }
  return {
    spec,
    logLikelihood: ll,
    aic: 2 * k - 2 * ll,
    bic: k * Math.log(n) - 2 * ll,
    ks: { statistic: D, pValue: Math.min(1, Math.max(0, ksP)) },
    ad,
    chiSquare: chiSquareTest(d, c, discrete, k),
    rank: 0,
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Public API                                                                                 */
/* ------------------------------------------------------------------------------------------ */

/**
 * Fit candidate distributions to `data` and rank them (1 = best).
 * Non-finite values are ignored. Families that cannot be fitted are omitted.
 */
export function fitDistributions(data: number[], options: FitOptions = {}): FitResult[] {
  const clean = Float64Array.from(data.filter((v) => typeof v === "number" && Number.isFinite(v)));
  if (clean.length < 2) return [];
  const c = makeCtx(clean);
  if (c.min === c.max) {
    // degenerate data: a constant
    return [
      {
        spec: { id: "fixed", params: { value: c.min } },
        logLikelihood: 0,
        aic: 2,
        bic: Math.log(c.n),
        ks: { statistic: 0, pValue: 1 },
        ad: { statistic: NaN, pValue: null },
        chiSquare: null,
        rank: 1,
      },
    ];
  }
  const discrete = options.discrete ?? c.values.every((v) => Number.isInteger(v) && v >= 0);
  const rankBy = options.rankBy ?? "aic";
  const candidates = options.candidates ?? (discrete ? DISCRETE_DEFAULT : CONTINUOUS_DEFAULT);
  const results: FitResult[] = [];
  for (const id of candidates) {
    const est = ESTIMATORS[id];
    if (!est) continue;
    // discrete families need integer data; continuous ones are evaluated with densities
    const isDiscreteFamily = DISCRETE_DEFAULT.includes(id);
    if (isDiscreteFamily && !c.values.every((v) => Number.isInteger(v))) continue;
    try {
      const e = est(c);
      if (!e) continue;
      const r = evaluateFit(id, e, c, isDiscreteFamily);
      if (r) results.push(r);
    } catch {
      // skip families that fail numerically
    }
  }
  const key = (r: FitResult): number => {
    switch (rankBy) {
      case "ks":
        return r.ks.statistic;
      case "bic":
        return r.bic;
      case "ad":
        return Number.isFinite(r.ad.statistic) ? r.ad.statistic : Infinity;
      default:
        return r.aic;
    }
  };
  results.sort((a, b) => {
    const d = key(a) - key(b);
    if (d !== 0 && !Number.isNaN(d)) return d;
    return a.aic - b.aic;
  });
  results.forEach((r, i) => (r.rank = i + 1));
  return results;
}

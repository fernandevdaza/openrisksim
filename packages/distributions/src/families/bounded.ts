/**
 * Continuous families on a bounded interval:
 * uniform, triangular, pert, beta (4-parameter), arcsine, cosine, powerFunction, trapezoidal.
 */
import { invRegIncBeta, lnBeta, regIncBetaBoth } from "../special";
import { type BaseDist, type Params, badP } from "./types";

export function uniform(p: Params): BaseDist {
  const a = p.min;
  const b = p.max;
  const w = b - a;
  const lnW = Math.log(w);
  return {
    kind: "continuous",
    pdf: (x) => (x >= a && x <= b ? 1 / w : 0),
    logPdf: (x) => (x >= a && x <= b ? -lnW : -Infinity),
    cdf: (x) => (x <= a ? 0 : x >= b ? 1 : (x - a) / w),
    sf: (x) => (x <= a ? 1 : x >= b ? 0 : (b - x) / w),
    quantile: (q) => (badP(q) ? NaN : q === 1 ? b : a + q * w),
    mean: () => a + w / 2,
    variance: () => (w * w) / 12,
    support: () => [a, b],
  };
}

export function triangular(p: Params): BaseDist {
  const a = p.min;
  const c = p.mode;
  const b = p.max;
  const w = b - a;
  const l = c - a; // left width
  const r = b - c; // right width
  const fc = l / w;
  const pdf = (x: number): number => {
    if (x < a || x > b) return 0;
    if (x < c) return (2 * (x - a)) / (w * l);
    if (x === c) return 2 / w;
    return (2 * (b - x)) / (w * r);
  };
  return {
    kind: "continuous",
    pdf,
    logPdf: (x) => Math.log(pdf(x)),
    cdf: (x) => {
      if (x <= a) return 0;
      if (x >= b) return 1;
      if (x <= c) return ((x - a) * (x - a)) / (w * l);
      return 1 - ((b - x) * (b - x)) / (w * r);
    },
    sf: (x) => {
      if (x <= a) return 1;
      if (x >= b) return 0;
      if (x <= c) return 1 - ((x - a) * (x - a)) / (w * l);
      return ((b - x) * (b - x)) / (w * r);
    },
    quantile: (q) => {
      if (badP(q)) return NaN;
      if (q < fc) return a + Math.sqrt(q * w * l);
      return b - Math.sqrt((1 - q) * w * r);
    },
    mean: () => (a + b + c) / 3,
    // shift-invariant form: with a' = 0 the variance is (w² + l² − w·l)/18
    variance: () => (w * w + l * l - w * l) / 18,
    support: () => [a, b],
  };
}

/** Four-parameter beta on [min, max]. */
export function scaledBeta(alpha: number, beta: number, min: number, max: number): BaseDist {
  const w = max - min;
  const lnNorm = -lnBeta(alpha, beta) - Math.log(w);
  const scratch = [0, 0];
  const logPdf = (x: number): number => {
    if (x < min || x > max) return -Infinity;
    const t = (x - min) / w;
    const u = (max - x) / w;
    let v = lnNorm;
    if (alpha !== 1) v += (alpha - 1) * Math.log(t);
    if (beta !== 1) v += (beta - 1) * Math.log(u);
    return v;
  };
  return {
    kind: "continuous",
    pdf: (x) => Math.exp(logPdf(x)),
    logPdf,
    cdf: (x) => {
      if (x <= min) return 0;
      if (x >= max) return 1;
      regIncBetaBoth((x - min) / w, (max - x) / w, alpha, beta, scratch);
      return scratch[0];
    },
    sf: (x) => {
      if (x <= min) return 1;
      if (x >= max) return 0;
      regIncBetaBoth((x - min) / w, (max - x) / w, alpha, beta, scratch);
      return scratch[1];
    },
    quantile: (q) => {
      if (badP(q)) return NaN;
      if (q === 1) return max;
      return min + w * invRegIncBeta(q, alpha, beta);
    },
    mean: () => min + (w * alpha) / (alpha + beta),
    variance: () => {
      const s = alpha + beta;
      return (w * w * alpha * beta) / (s * s * (s + 1));
    },
    support: () => [min, max],
  };
}

export function betaDist(p: Params): BaseDist {
  return scaledBeta(p.alpha, p.beta, p.min ?? 0, p.max ?? 1);
}

/** Beta-PERT with the classic λ = 4 weighting of the mode. */
export function pert(p: Params): BaseDist {
  const a = p.min;
  const m = p.mode;
  const b = p.max;
  const w = b - a;
  const alpha = 1 + (4 * (m - a)) / w;
  const beta = 1 + (4 * (b - m)) / w;
  const base = scaledBeta(alpha, beta, a, b);
  return {
    ...base,
    mean: () => (a + 4 * m + b) / 6,
    variance: () => {
      const mu = (a + 4 * m + b) / 6;
      return ((mu - a) * (b - mu)) / 7;
    },
  };
}

export function arcsine(p: Params): BaseDist {
  const a = p.min;
  const b = p.max;
  const w = b - a;
  const pdf = (x: number): number => (x > a && x < b ? 1 / (Math.PI * Math.sqrt((x - a) * (b - x))) : x === a || x === b ? Infinity : 0);
  return {
    kind: "continuous",
    pdf,
    logPdf: (x) => Math.log(pdf(x)),
    cdf: (x) => (x <= a ? 0 : x >= b ? 1 : (2 / Math.PI) * Math.asin(Math.sqrt((x - a) / w))),
    sf: (x) => (x <= a ? 1 : x >= b ? 0 : (2 / Math.PI) * Math.asin(Math.sqrt((b - x) / w))),
    quantile: (q) => {
      if (badP(q)) return NaN;
      if (q === 1) return b;
      const s = Math.sin((Math.PI * q) / 2);
      return a + w * s * s;
    },
    mean: () => a + w / 2,
    variance: () => (w * w) / 8,
    support: () => [a, b],
  };
}

/**
 * Cosine distribution on [min, max]: f(x) = cos((x−c)/s)/(2s), c = midpoint, s = (max−min)/π.
 * Written as F(x) = sin²((x−min)/(2s)) so that both tails are accurate.
 */
export function cosine(p: Params): BaseDist {
  const a = p.min;
  const b = p.max;
  const c = (a + b) / 2;
  const s = (b - a) / Math.PI;
  const pdf = (x: number): number => {
    if (x < a || x > b) return 0;
    return (x <= c ? Math.sin((x - a) / s) : Math.sin((b - x) / s)) / (2 * s);
  };
  const sin2 = (v: number): number => {
    const t = Math.sin(v);
    return t * t;
  };
  return {
    kind: "continuous",
    pdf,
    logPdf: (x) => Math.log(pdf(x)),
    cdf: (x) => (x <= a ? 0 : x >= b ? 1 : x <= c ? sin2((x - a) / (2 * s)) : 1 - sin2((b - x) / (2 * s))),
    sf: (x) => (x <= a ? 1 : x >= b ? 0 : x >= c ? sin2((b - x) / (2 * s)) : 1 - sin2((x - a) / (2 * s))),
    quantile: (q) => {
      if (badP(q)) return NaN;
      if (q <= 0.5) return Math.min(b, a + 2 * s * Math.asin(Math.sqrt(q)));
      return Math.max(a, b - 2 * s * Math.asin(Math.sqrt(1 - q)));
    },
    mean: () => c,
    variance: () => s * s * ((Math.PI * Math.PI) / 4 - 2),
    support: () => [a, b],
  };
}

/** Power function: F(x) = ((x−min)/(max−min))^α, i.e. a Beta(α, 1) on [min, max]. */
export function powerFunction(p: Params): BaseDist {
  const al = p.alpha;
  const a = p.min;
  const b = p.max;
  const w = b - a;
  const c = Math.log(al) - Math.log(w);
  const logPdf = (x: number): number => {
    if (x < a || x > b) return -Infinity;
    if (al === 1) return c;
    return c + (al - 1) * Math.log((x - a) / w);
  };
  return {
    kind: "continuous",
    pdf: (x) => Math.exp(logPdf(x)),
    logPdf,
    cdf: (x) => (x <= a ? 0 : x >= b ? 1 : Math.pow((x - a) / w, al)),
    sf: (x) => (x <= a ? 1 : x >= b ? 0 : -Math.expm1(al * Math.log((x - a) / w))),
    quantile: (q) => (badP(q) ? NaN : q === 1 ? b : a + w * Math.pow(q, 1 / al)),
    mean: () => a + (w * al) / (al + 1),
    variance: () => (w * w * al) / ((al + 1) * (al + 1) * (al + 2)),
    support: () => [a, b],
  };
}

export function trapezoidal(p: Params): BaseDist {
  const a = p.min;
  const b = p.mode1;
  const c = p.mode2;
  const d = p.max;
  const h = 2 / (d - a + (c - b));
  const f1 = (h * (b - a)) / 2; // cdf at b
  const f2 = 1 - (h * (d - c)) / 2; // cdf at c
  const pdf = (x: number): number => {
    if (x < a || x > d) return 0;
    if (x < b) return (h * (x - a)) / (b - a);
    if (x <= c) return h;
    return (h * (d - x)) / (d - c);
  };
  const cdf = (x: number): number => {
    if (x <= a) return 0;
    if (x >= d) return 1;
    if (x < b) return (h * (x - a) * (x - a)) / (2 * (b - a));
    if (x <= c) return f1 + h * (x - b);
    return 1 - (h * (d - x) * (d - x)) / (2 * (d - c));
  };
  // Moments about `a` (shift-invariant, no cancellation): rising + flat + falling parts.
  const B = b - a;
  const C = c - a;
  const D = d - a;
  const W = d - c;
  const m1 = (h * B * B) / 3 + (h * (C * C - B * B)) / 2 + h * ((D * W) / 2 - (W * W) / 3);
  const m2 = (h * B * B * B) / 4 + (h * (C * C * C - B * B * B)) / 3 + h * ((D * D * W) / 2 - (2 * D * W * W) / 3 + (W * W * W) / 4);
  return {
    kind: "continuous",
    pdf,
    logPdf: (x) => Math.log(pdf(x)),
    cdf,
    sf: (x) => {
      if (x > c && x < d) return (h * (d - x) * (d - x)) / (2 * (d - c));
      return 1 - cdf(x);
    },
    quantile: (q) => {
      if (badP(q)) return NaN;
      if (q < f1) return a + Math.sqrt((2 * q * (b - a)) / h);
      if (q <= f2) return b + (q - f1) / h;
      return d - Math.sqrt((2 * (1 - q) * (d - c)) / h);
    },
    mean: () => a + m1,
    variance: () => Math.max(0, m2 - m1 * m1),
    support: () => [a, d],
  };
}

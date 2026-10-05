/**
 * Continuous families on the whole real line:
 * normal, lognormal (positive), logistic, laplace, cauchy, gumbel (max), studentT.
 */
import {
  lnGamma,
  normalCdf,
  normalQuantile,
  studentTCdf,
  studentTQuantile,
  EULER_GAMMA,
} from "../special";
import { type BaseDist, type Params, LN_SQRT_2PI, badP } from "./types";

const REAL: [number, number] = [-Infinity, Infinity];

export function normal(p: Params): BaseDist {
  const mu = p.mean;
  const s = p.stdDev;
  const lnS = Math.log(s);
  return {
    kind: "continuous",
    pdf: (x) => {
      const z = (x - mu) / s;
      return Math.exp(-0.5 * z * z - LN_SQRT_2PI) / s;
    },
    logPdf: (x) => {
      const z = (x - mu) / s;
      return -0.5 * z * z - LN_SQRT_2PI - lnS;
    },
    cdf: (x) => normalCdf((x - mu) / s),
    sf: (x) => normalCdf((mu - x) / s),
    quantile: (q) => mu + s * normalQuantile(q),
    mean: () => mu,
    variance: () => s * s,
    support: () => [...REAL] as [number, number],
  };
}

/** Lognormal parametrised by the mean and standard deviation of the variable itself. */
export function lognormal(p: Params): BaseDist {
  const m = p.mean;
  const sd = p.stdDev;
  const cv = sd / m;
  const sigma2 = Math.log1p(cv * cv);
  const sigma = Math.sqrt(sigma2);
  const mu = Math.log(m) - sigma2 / 2;
  const lnSigma = Math.log(sigma);
  const logPdf = (x: number): number => {
    if (!(x > 0)) return -Infinity;
    const lx = Math.log(x);
    const z = (lx - mu) / sigma;
    return -0.5 * z * z - LN_SQRT_2PI - lnSigma - lx;
  };
  return {
    kind: "continuous",
    pdf: (x) => (x > 0 ? Math.exp(logPdf(x)) : 0),
    logPdf,
    cdf: (x) => (x > 0 ? normalCdf((Math.log(x) - mu) / sigma) : 0),
    sf: (x) => (x > 0 ? normalCdf((mu - Math.log(x)) / sigma) : 1),
    quantile: (q) => Math.exp(mu + sigma * normalQuantile(q)),
    mean: () => m,
    variance: () => sd * sd,
    support: () => [0, Infinity],
  };
}

export function logistic(p: Params): BaseDist {
  const mu = p.mean;
  const s = p.scale;
  const lnS = Math.log(s);
  const logPdf = (x: number): number => {
    const az = Math.abs((x - mu) / s);
    return -az - 2 * Math.log1p(Math.exp(-az)) - lnS;
  };
  return {
    kind: "continuous",
    pdf: (x) => {
      const e = Math.exp(-Math.abs((x - mu) / s));
      const d = 1 + e;
      return e / (s * d * d);
    },
    logPdf,
    cdf: (x) => 1 / (1 + Math.exp(-(x - mu) / s)),
    sf: (x) => 1 / (1 + Math.exp((x - mu) / s)),
    quantile: (q) => {
      if (badP(q)) return NaN;
      return mu + s * (Math.log(q) - Math.log1p(-q));
    },
    mean: () => mu,
    variance: () => (s * s * Math.PI * Math.PI) / 3,
    support: () => [...REAL] as [number, number],
  };
}

export function laplace(p: Params): BaseDist {
  const mu = p.location;
  const b = p.scale;
  const ln2b = Math.log(2 * b);
  return {
    kind: "continuous",
    pdf: (x) => Math.exp(-Math.abs(x - mu) / b) / (2 * b),
    logPdf: (x) => -Math.abs(x - mu) / b - ln2b,
    cdf: (x) => (x < mu ? 0.5 * Math.exp((x - mu) / b) : 1 - 0.5 * Math.exp(-(x - mu) / b)),
    sf: (x) => (x > mu ? 0.5 * Math.exp(-(x - mu) / b) : 1 - 0.5 * Math.exp((x - mu) / b)),
    quantile: (q) => {
      if (badP(q)) return NaN;
      return q < 0.5 ? mu + b * Math.log(2 * q) : mu - b * Math.log(2 * (1 - q));
    },
    mean: () => mu,
    variance: () => 2 * b * b,
    support: () => [...REAL] as [number, number],
  };
}

export function cauchy(p: Params): BaseDist {
  const x0 = p.location;
  const g = p.scale;
  const lnPiG = Math.log(Math.PI * g);
  return {
    kind: "continuous",
    pdf: (x) => {
      const z = (x - x0) / g;
      return 1 / (Math.PI * g * (1 + z * z));
    },
    logPdf: (x) => {
      const z = (x - x0) / g;
      return -lnPiG - Math.log1p(z * z);
    },
    cdf: (x) => Math.atan2(1, -(x - x0) / g) / Math.PI,
    sf: (x) => Math.atan2(1, (x - x0) / g) / Math.PI,
    quantile: (q) => {
      if (badP(q)) return NaN;
      if (q === 0.5) return x0;
      return q < 0.5 ? x0 - g / Math.tan(Math.PI * q) : x0 + g / Math.tan(Math.PI * (1 - q));
    },
    mean: () => NaN,
    variance: () => NaN,
    support: () => [...REAL] as [number, number],
  };
}

/** Gumbel for maxima (type I extreme value). */
export function gumbel(p: Params): BaseDist {
  const mu = p.location;
  const b = p.scale;
  const lnB = Math.log(b);
  const logPdf = (x: number): number => {
    const z = (x - mu) / b;
    return -(z + Math.exp(-z)) - lnB;
  };
  return {
    kind: "continuous",
    pdf: (x) => Math.exp(logPdf(x)),
    logPdf,
    cdf: (x) => Math.exp(-Math.exp(-(x - mu) / b)),
    sf: (x) => -Math.expm1(-Math.exp(-(x - mu) / b)),
    quantile: (q) => {
      if (badP(q)) return NaN;
      return mu - b * Math.log(-Math.log(q));
    },
    mean: () => mu + EULER_GAMMA * b,
    variance: () => (Math.PI * Math.PI * b * b) / 6,
    support: () => [...REAL] as [number, number],
  };
}

/** Location–scale Student's t. */
export function studentT(p: Params): BaseDist {
  const nu = p.df;
  const mu = p.mean;
  const s = p.scale;
  const c = lnGamma((nu + 1) / 2) - lnGamma(nu / 2) - 0.5 * Math.log(nu * Math.PI) - Math.log(s);
  const logPdf = (x: number): number => {
    const z = (x - mu) / s;
    return c - ((nu + 1) / 2) * Math.log1p((z * z) / nu);
  };
  return {
    kind: "continuous",
    pdf: (x) => Math.exp(logPdf(x)),
    logPdf,
    cdf: (x) => studentTCdf((x - mu) / s, nu),
    sf: (x) => studentTCdf((mu - x) / s, nu),
    quantile: (q) => mu + s * studentTQuantile(q, nu),
    mean: () => (nu > 1 ? mu : NaN),
    variance: () => (nu > 2 ? (s * s * nu) / (nu - 2) : nu > 1 ? Infinity : NaN),
    support: () => [...REAL] as [number, number],
  };
}

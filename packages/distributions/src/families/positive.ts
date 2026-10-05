/**
 * Continuous families with (shifted) positive support:
 * gamma, exponential, erlang, chiSquare, rayleigh, weibull, frechet, pareto, f.
 */
import {
  fCdf,
  fQuantile,
  fSf,
  invRegIncGammaP,
  lnBeta,
  lnGamma,
  regIncGammaP,
  regIncGammaQ,
} from "../special";
import { type BaseDist, type Params, badP } from "./types";

function gammaShapeScale(k: number, theta: number): BaseDist {
  const c = -lnGamma(k) - k * Math.log(theta);
  const logPdf = (x: number): number => {
    if (x < 0) return -Infinity;
    if (x === 0) {
      if (k < 1) return Infinity;
      if (k === 1) return -Math.log(theta);
      return -Infinity;
    }
    return (k - 1) * Math.log(x) - x / theta + c;
  };
  return {
    kind: "continuous",
    pdf: (x) => Math.exp(logPdf(x)),
    logPdf,
    cdf: (x) => (x > 0 ? regIncGammaP(k, x / theta) : 0),
    sf: (x) => (x > 0 ? regIncGammaQ(k, x / theta) : 1),
    quantile: (q) => theta * invRegIncGammaP(q, k),
    mean: () => k * theta,
    variance: () => k * theta * theta,
    support: () => [0, Infinity],
  };
}

export function gammaDist(p: Params): BaseDist {
  return gammaShapeScale(p.shape, p.scale);
}

export function erlang(p: Params): BaseDist {
  return gammaShapeScale(p.k, 1 / p.rate);
}

export function chiSquare(p: Params): BaseDist {
  return gammaShapeScale(p.df / 2, 2);
}

export function exponential(p: Params): BaseDist {
  const r = p.rate;
  const lnR = Math.log(r);
  return {
    kind: "continuous",
    pdf: (x) => (x >= 0 ? r * Math.exp(-r * x) : 0),
    logPdf: (x) => (x >= 0 ? lnR - r * x : -Infinity),
    cdf: (x) => (x > 0 ? -Math.expm1(-r * x) : 0),
    sf: (x) => (x > 0 ? Math.exp(-r * x) : 1),
    quantile: (q) => (badP(q) ? NaN : -Math.log1p(-q) / r),
    mean: () => 1 / r,
    variance: () => 1 / (r * r),
    support: () => [0, Infinity],
  };
}

export function rayleigh(p: Params): BaseDist {
  const s = p.scale;
  const s2 = s * s;
  return {
    kind: "continuous",
    pdf: (x) => (x >= 0 ? (x / s2) * Math.exp((-x * x) / (2 * s2)) : 0),
    logPdf: (x) => (x > 0 ? Math.log(x / s2) - (x * x) / (2 * s2) : -Infinity),
    cdf: (x) => (x > 0 ? -Math.expm1((-x * x) / (2 * s2)) : 0),
    sf: (x) => (x > 0 ? Math.exp((-x * x) / (2 * s2)) : 1),
    quantile: (q) => (badP(q) ? NaN : s * Math.sqrt(-2 * Math.log1p(-q))),
    mean: () => s * Math.sqrt(Math.PI / 2),
    variance: () => ((4 - Math.PI) / 2) * s2,
    support: () => [0, Infinity],
  };
}

export function weibull(p: Params): BaseDist {
  const k = p.shape;
  const lam = p.scale;
  const c = p.location ?? 0;
  const lnKL = Math.log(k / lam);
  const logPdf = (x: number): number => {
    const z = (x - c) / lam;
    if (z < 0) return -Infinity;
    if (z === 0) return k < 1 ? Infinity : k === 1 ? lnKL : -Infinity;
    return lnKL + (k - 1) * Math.log(z) - Math.pow(z, k);
  };
  return {
    kind: "continuous",
    pdf: (x) => Math.exp(logPdf(x)),
    logPdf,
    cdf: (x) => (x > c ? -Math.expm1(-Math.pow((x - c) / lam, k)) : 0),
    sf: (x) => (x > c ? Math.exp(-Math.pow((x - c) / lam, k)) : 1),
    quantile: (q) => (badP(q) ? NaN : c + lam * Math.pow(-Math.log1p(-q), 1 / k)),
    mean: () => c + lam * Math.exp(lnGamma(1 + 1 / k)),
    variance: () => {
      const g1 = Math.exp(lnGamma(1 + 1 / k));
      const g2 = Math.exp(lnGamma(1 + 2 / k));
      return lam * lam * (g2 - g1 * g1);
    },
    support: () => [c, Infinity],
  };
}

/** Fréchet (type II extreme value, maxima). */
export function frechet(p: Params): BaseDist {
  const a = p.shape;
  const s = p.scale;
  const m = p.location ?? 0;
  const lnAS = Math.log(a / s);
  const logPdf = (x: number): number => {
    const z = (x - m) / s;
    if (!(z > 0)) return -Infinity;
    const lz = Math.log(z);
    return lnAS - (1 + a) * lz - Math.exp(-a * lz);
  };
  return {
    kind: "continuous",
    pdf: (x) => Math.exp(logPdf(x)),
    logPdf,
    cdf: (x) => (x > m ? Math.exp(-Math.pow((x - m) / s, -a)) : 0),
    sf: (x) => (x > m ? -Math.expm1(-Math.pow((x - m) / s, -a)) : 1),
    quantile: (q) => (badP(q) ? NaN : m + s * Math.pow(-Math.log(q), -1 / a)),
    mean: () => (a > 1 ? m + s * Math.exp(lnGamma(1 - 1 / a)) : Infinity),
    variance: () => {
      if (!(a > 2)) return Infinity;
      const g1 = Math.exp(lnGamma(1 - 1 / a));
      const g2 = Math.exp(lnGamma(1 - 2 / a));
      return s * s * (g2 - g1 * g1);
    },
    support: () => [m, Infinity],
  };
}

/** Pareto type I: support [scale, ∞). */
export function pareto(p: Params): BaseDist {
  const a = p.shape;
  const xm = p.scale;
  const c = Math.log(a) + a * Math.log(xm);
  return {
    kind: "continuous",
    pdf: (x) => (x >= xm ? Math.exp(c - (a + 1) * Math.log(x)) : 0),
    logPdf: (x) => (x >= xm ? c - (a + 1) * Math.log(x) : -Infinity),
    cdf: (x) => (x > xm ? -Math.expm1(a * Math.log(xm / x)) : 0),
    sf: (x) => (x > xm ? Math.pow(xm / x, a) : 1),
    quantile: (q) => (badP(q) ? NaN : xm * Math.exp(-Math.log1p(-q) / a)),
    mean: () => (a > 1 ? (a * xm) / (a - 1) : Infinity),
    variance: () => (a > 2 ? (xm * xm * a) / ((a - 1) * (a - 1) * (a - 2)) : Infinity),
    support: () => [xm, Infinity],
  };
}

/** Fisher–Snedecor F. */
export function fDist(p: Params): BaseDist {
  const d1 = p.df1;
  const d2 = p.df2;
  const c = 0.5 * d2 * Math.log(d2) - lnBeta(d1 / 2, d2 / 2);
  const logPdf = (x: number): number => {
    if (x < 0) return -Infinity;
    if (x === 0) return d1 < 2 ? Infinity : d1 === 2 ? 0 : -Infinity;
    const dx = d1 * x;
    return c + 0.5 * d1 * Math.log(dx) - 0.5 * (d1 + d2) * Math.log(dx + d2) - Math.log(x);
  };
  return {
    kind: "continuous",
    pdf: (x) => Math.exp(logPdf(x)),
    logPdf,
    cdf: (x) => fCdf(x, d1, d2),
    sf: (x) => fSf(x, d1, d2),
    quantile: (q) => fQuantile(q, d1, d2),
    mean: () => (d2 > 2 ? d2 / (d2 - 2) : Infinity),
    variance: () => {
      if (d2 > 4) return (2 * d2 * d2 * (d1 + d2 - 2)) / (d1 * (d2 - 2) * (d2 - 2) * (d2 - 4));
      return d2 > 2 ? Infinity : NaN;
    },
    support: () => [0, Infinity],
  };
}

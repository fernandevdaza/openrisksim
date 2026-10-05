/**
 * `custom` (discrete weighted values or empirical continuous) and `fixed` (constant).
 */
import { tableDist } from "./discrete";
import { type BaseDist, badP } from "./types";

/**
 * Discrete distribution over arbitrary real `values` with non-negative `weights`
 * (duplicates are merged, zero-weight values dropped, weights normalised).
 */
export function customDiscrete(values: readonly number[], weights: readonly number[]): BaseDist {
  const pairs: [number, number][] = [];
  for (let i = 0; i < values.length; i++) {
    if (weights[i] > 0) pairs.push([values[i], weights[i]]);
  }
  pairs.sort((x, y) => x[0] - y[0]);
  const pts: number[] = [];
  const ws: number[] = [];
  for (const [v, w] of pairs) {
    if (pts.length > 0 && pts[pts.length - 1] === v) ws[ws.length - 1] += w;
    else {
      pts.push(v);
      ws.push(w);
    }
  }
  let total = 0;
  for (const w of ws) total += w;
  let mean = 0;
  for (let i = 0; i < pts.length; i++) mean += (pts[i] * ws[i]) / total;
  let variance = 0;
  for (let i = 0; i < pts.length; i++) variance += ((pts[i] - mean) * (pts[i] - mean) * ws[i]) / total;
  return tableDist(Float64Array.from(ws), 0, mean, variance, Float64Array.from(pts));
}

/**
 * Empirical continuous distribution: the CDF linearly interpolates the order statistics,
 * F(x₍ᵢ₎) = i/(n−1) (0-based), so quantile(p) equals Excel's PERCENTILE.INC.
 */
export function customEmpirical(values: readonly number[]): BaseDist {
  const xs = Float64Array.from(values).sort();
  const n = xs.length;
  if (n === 1) return fixedValue(xs[0]);
  const m = n - 1;
  const lo = xs[0];
  const hi = xs[n - 1];
  /** last i with xs[i] ≤ x (requires lo ≤ x < hi) */
  const seg = (x: number): number => {
    let l = 0;
    let h = n - 1;
    while (h - l > 1) {
      const mid = (l + h) >> 1;
      if (xs[mid] <= x) l = mid;
      else h = mid;
    }
    return l;
  };
  const pdf = (x: number): number => {
    if (x < lo || x > hi) return 0;
    let i = x >= hi ? n - 2 : seg(x);
    // at the upper end use the last segment with positive width
    while (i > 0 && xs[i + 1] === xs[i]) i--;
    const w = xs[i + 1] - xs[i];
    return w > 0 ? 1 / (m * w) : Infinity;
  };
  const cdf = (x: number): number => {
    if (Number.isNaN(x)) return NaN;
    if (x < lo) return 0;
    if (x >= hi) return 1;
    const i = seg(x);
    const w = xs[i + 1] - xs[i];
    return (i + (w > 0 ? (x - xs[i]) / w : 0)) / m;
  };
  // moments: mixture of uniforms on consecutive order statistics (centred for stability)
  let c = 0;
  for (let i = 0; i < n; i++) c += xs[i];
  c /= n;
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < m; i++) {
    const a = xs[i] - c;
    const b = xs[i + 1] - c;
    s1 += (a + b) / 2;
    s2 += (a * a + a * b + b * b) / 3;
  }
  const m1 = s1 / m;
  const variance = Math.max(0, s2 / m - m1 * m1);
  return {
    kind: "continuous",
    pdf,
    logPdf: (x) => Math.log(pdf(x)),
    cdf,
    sf: (x) => 1 - cdf(x),
    quantile: (p) => {
      if (badP(p)) return NaN;
      const h = p * m;
      const i = Math.floor(h);
      if (i >= m) return hi;
      return xs[i] + (h - i) * (xs[i + 1] - xs[i]);
    },
    mean: () => c + m1,
    variance: () => variance,
    support: () => [lo, hi],
  };
}

/** Degenerate distribution (point mass). */
export function fixedValue(v: number): BaseDist {
  return {
    kind: "discrete",
    pdf: (x) => (x === v ? 1 : 0),
    logPdf: (x) => (x === v ? 0 : -Infinity),
    cdf: (x) => (Number.isNaN(x) ? NaN : x >= v ? 1 : 0),
    sf: (x) => (Number.isNaN(x) ? NaN : x >= v ? 0 : 1),
    quantile: (p) => (badP(p) ? NaN : v),
    mean: () => v,
    variance: () => 0,
    support: () => [v, v],
    points: Float64Array.of(v),
  };
}

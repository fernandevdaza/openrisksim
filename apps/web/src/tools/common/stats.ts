/**
 * Small pure numeric helpers used by the tool windows (the heavy lifting lives in the packages).
 */

export function sortedCopy(values: ArrayLike<number>): Float64Array {
  const a = Float64Array.from(values as ArrayLike<number>).filter((v) => Number.isFinite(v));
  a.sort();
  return a;
}

/** Excel PERCENTILE.INC on sorted data, p in [0,1]. */
export function quantileSorted(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const h = (n - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(h);
  const hi = Math.min(n - 1, lo + 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

export function mean(v: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i];
  return v.length ? s / v.length : NaN;
}

/** Sample standard deviation (n − 1). */
export function stdDev(v: ArrayLike<number>): number {
  const n = v.length;
  if (n < 2) return NaN;
  const m = mean(v);
  let s = 0;
  for (let i = 0; i < n; i++) s += (v[i] - m) ** 2;
  return Math.sqrt(s / (n - 1));
}

/** Sample skewness (adjusted Fisher–Pearson, as Excel SKEW). */
export function skewness(v: ArrayLike<number>): number {
  const n = v.length;
  if (n < 3) return NaN;
  const m = mean(v);
  const s = stdDev(v);
  let acc = 0;
  for (let i = 0; i < n; i++) acc += ((v[i] - m) / s) ** 3;
  return (n / ((n - 1) * (n - 2))) * acc;
}

/** Sample excess kurtosis (as Excel KURT). */
export function kurtosis(v: ArrayLike<number>): number {
  const n = v.length;
  if (n < 4) return NaN;
  const m = mean(v);
  const s = stdDev(v);
  let acc = 0;
  for (let i = 0; i < n; i++) acc += ((v[i] - m) / s) ** 4;
  return (n * (n + 1) * acc) / ((n - 1) * (n - 2) * (n - 3)) - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
}

export type BootstrapStatistic = "mean" | "median" | "stdDev" | "cv" | "p5" | "p10" | "p90" | "p95" | "skewness" | "kurtosis";
export const BOOTSTRAP_STATISTICS: BootstrapStatistic[] = ["mean", "median", "stdDev", "cv", "p5", "p10", "p90", "p95", "skewness", "kurtosis"];

/** Statistic function usable with engine.bootstrap. */
export function statisticFn(stat: BootstrapStatistic): (v: Float64Array) => number {
  const pct = (p: number) => (v: Float64Array) => quantileSorted(Float64Array.from(v).sort(), p);
  switch (stat) {
    case "mean":
      return mean;
    case "median":
      return pct(0.5);
    case "stdDev":
      return stdDev;
    case "cv":
      return (v) => stdDev(v) / Math.abs(mean(v));
    case "p5":
      return pct(0.05);
    case "p10":
      return pct(0.1);
    case "p90":
      return pct(0.9);
    case "p95":
      return pct(0.95);
    case "skewness":
      return skewness;
    case "kurtosis":
      return kurtosis;
  }
}

/** Percentile confidence interval from bootstrap samples. */
export function percentileInterval(samples: ArrayLike<number>, confidence: number): [number, number] {
  const s = sortedCopy(samples);
  const a = (1 - confidence) / 2;
  return [quantileSorted(s, a), quantileSorted(s, 1 - a)];
}

/** For each requested percentile, the value across paths at every time step: result[pIndex][step]. */
export function pathPercentiles(paths: number[][], ps: number[]): number[][] {
  if (paths.length === 0) return ps.map(() => []);
  const steps = paths[0].length;
  const out = ps.map(() => new Array<number>(steps));
  const col = new Float64Array(paths.length);
  for (let t = 0; t < steps; t++) {
    for (let i = 0; i < paths.length; i++) col[i] = paths[i][t];
    const s = sortedCopy(col);
    ps.forEach((p, k) => (out[k][t] = quantileSorted(s, p)));
  }
  return out;
}

/** Log returns ln(p_t / p_{t−1}); non-positive prices are skipped. */
export function logReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) if (prices[i] > 0 && prices[i - 1] > 0) out.push(Math.log(prices[i] / prices[i - 1]));
  return out;
}

/**
 * Ornstein–Uhlenbeck parameters from a series via the exact AR(1) discretisation
 * x_{t+1} = a + b·x_t + ε  →  speed = −ln(b)/dt, mean = a/(1−b), σ = sd(ε)·√(2·speed/(1−b²)).
 * Returns null when the series shows no mean reversion (b ≤ 0 or b ≥ 1).
 */
export function estimateMeanReversion(series: number[], dt: number): { longRunMean: number; speed: number; volatility: number } | null {
  const n = series.length - 1;
  if (n < 3) return null;
  const x = series.slice(0, -1);
  const y = series.slice(1);
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
  }
  if (sxx === 0) return null;
  const b = sxy / sxx;
  const a = my - b * mx;
  if (!(b > 0 && b < 1)) return null;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (y[i] - a - b * x[i]) ** 2;
  const sdEps = Math.sqrt(sse / Math.max(1, n - 2));
  const speed = -Math.log(b) / dt;
  return { longRunMean: a / (1 - b), speed, volatility: sdEps * Math.sqrt((2 * speed) / (1 - b * b)) };
}

/** Welch confidence interval for the difference of means (a − b). `tQuantile(p, df)` from the distributions package. */
export function welchInterval(
  a: { mean: number; variance: number; n: number },
  b: { mean: number; variance: number; n: number },
  confidence: number,
  tQuantile: (p: number, df: number) => number,
): { diff: number; lower: number; upper: number; df: number; se: number } {
  const va = a.variance / a.n;
  const vb = b.variance / b.n;
  const se = Math.sqrt(va + vb);
  const df = (va + vb) ** 2 / (va ** 2 / (a.n - 1) + vb ** 2 / (b.n - 1));
  const tq = tQuantile(1 - (1 - confidence) / 2, df);
  const diff = a.mean - b.mean;
  return { diff, lower: diff - tq * se, upper: diff + tq * se, df, se };
}

/** NPV profile: NPV evaluated at each rate. */
export function npvProfile(cashFlows: number[], rates: number[], npvFn: (rate: number, cf: number[]) => number): { rate: number; npv: number }[] {
  return rates.map((rate) => ({ rate, npv: npvFn(rate, cashFlows) }));
}

/** Simple NPV with period 0 undiscounted (used where the finance package is not needed, e.g. tests). */
export function simpleNpv(rate: number, cf: number[]): number {
  return cf.reduce((acc, c, t) => acc + c / Math.pow(1 + rate, t), 0);
}

/** Reasonable rate grid for an NPV profile, extending past the largest IRR. */
export function profileRates(irrs: number[], discountRate: number): number[] {
  const finite = irrs.filter((r) => Number.isFinite(r));
  const top = Math.max(0.3, discountRate * 2.5, ...finite.map((r) => r * 1.6 + 0.05));
  const max = Math.min(top, 3);
  const n = 61;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push((max * i) / (n - 1));
  return out;
}

/** Hamada: levered beta from unlevered. */
export function leveredBeta(unlevered: number, debtToEquity: number, taxRate: number): number {
  return unlevered * (1 + (1 - taxRate) * debtToEquity);
}
export function unleveredBeta(levered: number, debtToEquity: number, taxRate: number): number {
  return levered / (1 + (1 - taxRate) * debtToEquity);
}

/** Equivalent periodic rate from an effective annual rate: (1+i)^(1/m) − 1. */
export function periodicFromEffective(effective: number, periodsPerYear: number): number {
  return Math.pow(1 + effective, 1 / periodsPerYear) - 1;
}

/** Fraction of trials meeting a condition. */
export function shareWhere(values: ArrayLike<number>, pred: (v: number) => boolean): number {
  let c = 0;
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    n++;
    if (pred(v)) c++;
  }
  return n ? c / n : NaN;
}

/** Common histogram bin edges for several datasets (used by overlay charts). */
export function commonEdges(datasets: ArrayLike<number>[], bins: number): number[] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const d of datasets)
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      if (!Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  if (!Number.isFinite(lo)) return [];
  if (lo === hi) {
    lo -= 0.5;
    hi += 0.5;
  }
  const out: number[] = [];
  for (let i = 0; i <= bins; i++) out.push(lo + ((hi - lo) * i) / bins);
  return out;
}

/** Relative frequencies of `values` over the given edges (last bin closed). */
export function binFrequencies(values: ArrayLike<number>, edges: number[]): number[] {
  const k = edges.length - 1;
  const counts = new Array<number>(Math.max(0, k)).fill(0);
  if (k <= 0) return counts;
  const lo = edges[0];
  const w = (edges[k] - lo) / k;
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    n++;
    let b = Math.floor((v - lo) / w);
    if (b >= k) b = k - 1;
    if (b < 0) b = 0;
    counts[b]++;
  }
  return n ? counts.map((c) => c / n) : counts;
}

/** P–P and Q–Q points for a fitted distribution. */
export function probabilityPlotPoints(
  data: ArrayLike<number>,
  cdf: (x: number) => number,
  quantile: (p: number) => number,
  maxPoints = 400,
): { pp: [number, number][]; qq: [number, number][] } {
  const s = sortedCopy(data);
  const n = s.length;
  const step = Math.max(1, Math.floor(n / maxPoints));
  const pp: [number, number][] = [];
  const qq: [number, number][] = [];
  for (let i = 0; i < n; i += step) {
    const p = (i + 0.5) / n;
    pp.push([p, cdf(s[i])]);
    const q = quantile(p);
    if (Number.isFinite(q)) qq.push([q, s[i]]);
  }
  return { pp, qq };
}

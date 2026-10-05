import type { ForecastStatistic } from "./types";

/** Linear-interpolated percentile of an ascending-sorted array (Excel PERCENTILE.INC), p in [0, 1]. */
function percentileSorted(sorted: Float64Array, p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const h = (n - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(h);
  const hi = Math.min(n - 1, lo + 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

/**
 * Statistic of a forecast's simulated values, ignoring NaN.
 * - stdDev is the sample standard deviation (n − 1); cv = stdDev / |mean| (NaN when mean = 0).
 * - Percentiles use linear interpolation (Excel PERCENTILE.INC).
 * - probAbove = P(X > threshold), probBelow = P(X ≤ threshold) (they sum to 1). threshold defaults to 0.
 * Returns NaN when there are no finite values.
 */
export function statisticOf(values: Float64Array, stat: ForecastStatistic, threshold = 0): number {
  let n = 0;
  for (let i = 0; i < values.length; i++) if (!Number.isNaN(values[i])) n++;
  if (n === 0) return NaN;
  const clean = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < values.length; i++) if (!Number.isNaN(values[i])) clean[j++] = values[i];

  const mean = (): number => {
    let s = 0;
    for (let i = 0; i < n; i++) s += clean[i];
    return s / n;
  };
  const stdDev = (m: number): number => {
    if (n < 2) return 0;
    let s = 0;
    for (let i = 0; i < n; i++) {
      const d = clean[i] - m;
      s += d * d;
    }
    return Math.sqrt(s / (n - 1));
  };
  const pct = (p: number): number => percentileSorted(clean.slice().sort(), p);

  switch (stat) {
    case "mean":
      return mean();
    case "median":
      return pct(0.5);
    case "stdDev":
      return stdDev(mean());
    case "cv": {
      const m = mean();
      return m === 0 ? NaN : stdDev(m) / Math.abs(m);
    }
    case "p5":
      return pct(0.05);
    case "p10":
      return pct(0.1);
    case "p90":
      return pct(0.9);
    case "p95":
      return pct(0.95);
    case "probAbove": {
      let c = 0;
      for (let i = 0; i < n; i++) if (clean[i] > threshold) c++;
      return c / n;
    }
    case "probBelow": {
      let c = 0;
      for (let i = 0; i < n; i++) if (clean[i] <= threshold) c++;
      return c / n;
    }
    default: {
      const never: never = stat;
      throw new Error(`Unknown statistic: ${String(never)}`);
    }
  }
}

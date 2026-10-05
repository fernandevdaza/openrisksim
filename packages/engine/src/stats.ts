/**
 * Descriptive statistics for simulated forecasts (Excel-compatible conventions).
 */
import type { DescriptiveStats, HistogramBin } from "@openrisksim/core";
import { averageRanks, tCritical975 } from "./numeric";

/** Copy of the non-NaN values. */
function finiteCopy(values: ArrayLike<number>): Float64Array {
  const n = values.length;
  let m = 0;
  for (let i = 0; i < n; i++) if (!Number.isNaN(values[i])) m++;
  const out = new Float64Array(m);
  let t = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (!Number.isNaN(v)) out[t++] = v;
  }
  return out;
}

function sortedCopy(values: ArrayLike<number>): Float64Array {
  return finiteCopy(values).sort();
}

/**
 * Percentile of an ascending-sorted array with linear interpolation, identical to Excel PERCENTILE.INC:
 * h = (n−1)·p, value = x[⌊h⌋] + (h−⌊h⌋)·(x[⌊h⌋+1] − x[⌊h⌋]). `p` is clamped to [0,1]; NaN for empty input.
 */
export function percentile(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0 || Number.isNaN(p)) return NaN;
  const q = p <= 0 ? 0 : p >= 1 ? 1 : p;
  const h = (n - 1) * q;
  const lo = Math.floor(h);
  if (lo >= n - 1) return sorted[n - 1];
  const frac = h - lo;
  const a = sorted[lo];
  return frac === 0 ? a : a + frac * (sorted[lo + 1] - a);
}

function isIntegerData(sorted: Float64Array): boolean {
  for (let i = 0; i < sorted.length; i++) if (!Number.isInteger(sorted[i])) return false;
  return true;
}

function histogramSorted(s: Float64Array, bins: number | "auto"): HistogramBin[] {
  const n = s.length;
  if (n === 0) return [];
  const min = s[0];
  const max = s[n - 1];
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    // Infinite values cannot be binned meaningfully; bin the finite part only.
    let a = 0;
    let b = n;
    while (a < n && !Number.isFinite(s[a])) a++;
    while (b > a && !Number.isFinite(s[b - 1])) b--;
    return histogramSorted(s.subarray(a, b), bins);
  }
  if (min === max) {
    const h = min === 0 ? 0.5 : Math.abs(min) * 0.005;
    return [{ from: min - h, to: max + h, count: n, frequency: 1, cumulative: 1 }];
  }

  let k: number;
  let from = min;
  let width: number;
  if (bins === "auto") {
    const range = max - min;
    if (isIntegerData(s) && range + 1 <= 100) {
      // Discrete data: one bin per integer, centred on the value.
      k = range + 1;
      from = min - 0.5;
      width = 1;
    } else {
      const iqr = percentile(s, 0.75) - percentile(s, 0.25);
      const fd = iqr > 0 ? (2 * iqr) / Math.cbrt(n) : 0;
      k = fd > 0 ? Math.ceil(range / fd) : Math.ceil(Math.log2(n) + 1);
      k = Math.max(10, Math.min(100, k));
      width = range / k;
    }
  } else {
    k = Math.max(1, Math.floor(bins) || 1);
    width = (max - min) / k;
  }

  const counts = new Float64Array(k);
  for (let i = 0; i < n; i++) {
    let b = Math.floor((s[i] - from) / width);
    if (b >= k) b = k - 1;
    else if (b < 0) b = 0;
    counts[b]++;
  }
  const out: HistogramBin[] = [];
  let cum = 0;
  for (let b = 0; b < k; b++) {
    cum += counts[b];
    out.push({
      from: from + b * width,
      to: b === k - 1 && width !== 1 ? max : from + (b + 1) * width,
      count: counts[b],
      frequency: counts[b] / n,
      cumulative: cum / n,
    });
  }
  return out;
}

/**
 * Histogram of the non-NaN values.
 * - `"auto"` (default): Freedman–Diaconis bin width, number of bins clamped to [10, 100]; integer-valued
 *   data spanning ≤ 100 distinct integers gets one bin per integer ([v−0.5, v+0.5]).
 * - number: that many equal-width bins over [min, max] (last bin closed).
 * Constant data → a single bin around the value. Empty input → [].
 */
export function histogram(values: ArrayLike<number>, bins: number | "auto" = "auto"): HistogramBin[] {
  return histogramSorted(sortedCopy(values), bins);
}

function modeOf(sorted: Float64Array): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (sorted[0] === sorted[n - 1]) return sorted[0];
  if (isIntegerData(sorted)) {
    let best = sorted[0];
    let bestCount = 0;
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && sorted[j + 1] === sorted[i]) j++;
      if (j - i + 1 > bestCount) {
        bestCount = j - i + 1;
        best = sorted[i];
      }
      i = j + 1;
    }
    return best;
  }
  const bins = histogramSorted(sorted, "auto");
  let best = bins[0];
  for (const b of bins) if (b.count > best.count) best = b;
  return (best.from + best.to) / 2;
}

/**
 * Descriptive statistics of the non-NaN values.
 * stdDev/variance are sample (n−1) estimators (Excel STDEV.S/VAR.S; 0 when n = 1); skewness and
 * kurtosis use Excel's SKEW and KURT (excess) formulas (NaN when n < 3 / n < 4 or zero variance);
 * meanCI95 uses Student-t with n−1 degrees of freedom.
 */
export function describe(values: ArrayLike<number>): DescriptiveStats {
  const s = sortedCopy(values);
  const n = s.length;
  const percentiles: Record<number, number> = {};
  for (let p = 1; p <= 99; p++) percentiles[p] = percentile(s, p / 100);
  if (n === 0) {
    return {
      count: 0, mean: NaN, median: NaN, mode: NaN, stdDev: NaN, variance: NaN, cv: NaN, min: NaN, max: NaN,
      range: NaN, skewness: NaN, kurtosis: NaN, stdErrorMean: NaN, percentiles, meanCI95: [NaN, NaN],
    };
  }

  let sum = 0;
  for (let i = 0; i < n; i++) sum += s[i];
  let mean = sum / n;
  // Second pass for an accurate mean (compensation) and central moments.
  let corr = 0;
  for (let i = 0; i < n; i++) corr += s[i] - mean;
  mean += corr / n;
  let m2 = 0;
  for (let i = 0; i < n; i++) {
    const d = s[i] - mean;
    m2 += d * d;
  }
  const variance = n > 1 ? m2 / (n - 1) : 0;
  const stdDev = Math.sqrt(variance);

  let skewness = NaN;
  let kurtosis = NaN;
  if (stdDev > 0 && n >= 3) {
    let s3 = 0;
    let s4 = 0;
    for (let i = 0; i < n; i++) {
      const z = (s[i] - mean) / stdDev;
      const z2 = z * z;
      s3 += z2 * z;
      s4 += z2 * z2;
    }
    skewness = (n / ((n - 1) * (n - 2))) * s3;
    if (n >= 4) {
      kurtosis =
        ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * s4 - (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
    }
  }

  const stdErrorMean = stdDev / Math.sqrt(n);
  const half = n > 1 ? tCritical975(n - 1) * stdErrorMean : 0;
  return {
    count: n,
    mean,
    median: percentile(s, 0.5),
    mode: modeOf(s),
    stdDev,
    variance,
    cv: mean === 0 ? NaN : stdDev / Math.abs(mean),
    min: s[0],
    max: s[n - 1],
    range: s[n - 1] - s[0],
    skewness,
    kurtosis,
    stdErrorMean,
    percentiles,
    meanCI95: [mean - half, mean + half],
  };
}

/** Share of the non-NaN values inside [lower, upper] (inclusive). NaN when there are no values. */
export function certainty(values: ArrayLike<number>, lower: number, upper: number): number {
  let total = 0;
  let inside = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isNaN(v)) continue;
    total++;
    if (v >= lower && v <= upper) inside++;
  }
  return total === 0 ? NaN : inside / total;
}

/** Pairs where either value is NaN are dropped. */
function completePairs(a: ArrayLike<number>, b: ArrayLike<number>): [Float64Array, Float64Array] {
  const n = Math.min(a.length, b.length);
  let m = 0;
  for (let i = 0; i < n; i++) if (!Number.isNaN(a[i]) && !Number.isNaN(b[i])) m++;
  if (m === n && a instanceof Float64Array && b instanceof Float64Array && a.length === n && b.length === n) {
    return [a, b];
  }
  const x = new Float64Array(m);
  const y = new Float64Array(m);
  let t = 0;
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(a[i]) && !Number.isNaN(b[i])) {
      x[t] = a[i];
      y[t] = b[i];
      t++;
    }
  }
  return [x, y];
}

/** Pearson correlation without NaN handling (inputs of equal length). NaN if either side is constant. */
export function pearsonRaw(x: ArrayLike<number>, y: ArrayLike<number>): number {
  const n = x.length;
  if (n < 2) return NaN;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += x[i];
    my += y[i];
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return NaN;
  const r = sxy / Math.sqrt(sxx * syy);
  return r > 1 ? 1 : r < -1 ? -1 : r;
}

/** Pearson correlation of the complete (non-NaN) pairs. NaN if fewer than 2 pairs or zero variance. */
export function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const [x, y] = completePairs(a, b);
  return pearsonRaw(x, y);
}

/** Spearman rank correlation (Pearson of average ranks, so ties are handled) of the complete pairs. */
export function spearman(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const [x, y] = completePairs(a, b);
  if (x.length < 2) return NaN;
  return pearsonRaw(averageRanks(x), averageRanks(y));
}

/**
 * Empirical CDF of the non-NaN values for plotting: `points` (default 200) evenly spaced x over
 * [min, max] with p = share of values ≤ x. Constant data → a single point (value, 1).
 */
export function empiricalCdf(values: ArrayLike<number>, points = 200): { x: number[]; p: number[] } {
  const s = sortedCopy(values);
  const n = s.length;
  if (n === 0) return { x: [], p: [] };
  const min = s[0];
  const max = s[n - 1];
  if (min === max || !Number.isFinite(max - min)) return { x: [max], p: [1] };
  const m = Math.max(2, Math.floor(points));
  const x: number[] = [];
  const p: number[] = [];
  let idx = 0;
  for (let j = 0; j < m; j++) {
    const xv = j === m - 1 ? max : min + ((max - min) * j) / (m - 1);
    while (idx < n && s[idx] <= xv) idx++;
    x.push(xv);
    p.push(idx / n);
  }
  return { x, p };
}

/**
 * Shared output types, error metrics and helpers to assemble a ForecastOutput.
 */
import { normalQuantile } from "./_stats";

export interface ErrorMetrics {
  mae: number;
  mse: number;
  rmse: number;
  /** Mean absolute percentage error as a fraction (0.05 = 5%); points with actual = 0 are skipped. */
  mape: number;
  /** Symmetric MAPE as a fraction: mean of 2|e|/(|a|+|f|). */
  smape: number;
  /** Theil's U2: model one-step errors relative to the naive (random-walk) forecast. < 1 beats naive. */
  theilU: number;
  /** 1 − SSE/SST over the evaluated points. */
  r2: number;
  aic?: number;
  bic?: number;
}

export interface ForecastOutput {
  method: string;
  params: Record<string, number>;
  /** In-sample one-step fitted values (NaN where undefined). */
  fitted: number[];
  /** h periods ahead. */
  forecast: number[];
  lower95: number[];
  upper95: number[];
  lower80: number[];
  upper80: number[];
  /**
   * Central prediction intervals for the requested confidence levels (ascending by level).
   * `lower95/upper95/lower80/upper80` are always populated as well, for backward compatibility.
   */
  intervals: PredictionInterval[];
  residuals: number[];
  metrics: ErrorMetrics;
}

/** Central prediction interval at confidence `level` (fraction, e.g. 0.9). */
export interface PredictionInterval {
  level: number;
  lower: number[];
  upper: number[];
}

/** Options shared by every forecasting function. */
export interface IntervalOptions {
  /** Confidence levels (fractions in [0.5, 0.999]) of the prediction intervals. Default [0.8, 0.95]. */
  levels?: number[];
}

export const Z80 = 1.2815515655446004;
export const Z95 = 1.959963984540054;
export const DEFAULT_LEVELS: readonly number[] = [0.8, 0.95];
export const MIN_LEVEL = 0.5;
export const MAX_LEVEL = 0.999;

/**
 * Validates and normalises confidence levels: every level must be finite and within
 * [0.5, 0.999]; the result is sorted ascending and de-duplicated (to 1e-9).
 * `undefined` → the defaults [0.8, 0.95].
 */
export function normalizeLevels(levels?: readonly number[]): number[] {
  if (levels === undefined) return DEFAULT_LEVELS.slice();
  const out: number[] = [];
  for (const l of [...levels].sort((a, b) => a - b)) {
    if (!Number.isFinite(l) || l < MIN_LEVEL - 1e-12 || l > MAX_LEVEL + 1e-12)
      throw new Error(`confidence level ${l} out of range [${MIN_LEVEL}, ${MAX_LEVEL}]`);
    if (!out.length || Math.abs(out[out.length - 1] - l) > 1e-9) out.push(l);
  }
  return out;
}

/** Two-sided normal quantile z such that P(|Z| ≤ z) = level. */
export function zForLevel(level: number): number {
  if (Math.abs(level - 0.95) < 1e-12) return Z95;
  if (Math.abs(level - 0.8) < 1e-12) return Z80;
  return normalQuantile((1 + level) / 2);
}

/**
 * Builds intervals for each level from a per-step half-width multiplier: lower/upper =
 * tr(center ∓ q(level)·se[i]) where q is the two-sided quantile for that level.
 */
export function intervalsFrom(
  center: number[],
  se: number[],
  levels: readonly number[],
  quantile: (level: number) => number,
  tr: (v: number) => number = (v) => v,
): PredictionInterval[] {
  return levels.map((level) => {
    const q = quantile(level);
    return {
      level,
      lower: center.map((c, i) => tr(c - q * se[i])),
      upper: center.map((c, i) => tr(c + q * se[i])),
    };
  });
}

/** Error metrics over the pairs where both actual and fitted are finite. */
export function errorMetrics(actual: number[], fitted: number[]): ErrorMetrics {
  const n = Math.min(actual.length, fitted.length);
  let cnt = 0;
  let sae = 0;
  let sse = 0;
  let sape = 0;
  let cntApe = 0;
  let ssape = 0;
  let cntS = 0;
  let sumA = 0;
  for (let i = 0; i < n; i++) {
    const a = actual[i];
    const f = fitted[i];
    if (!Number.isFinite(a) || !Number.isFinite(f)) continue;
    const e = a - f;
    cnt++;
    sae += Math.abs(e);
    sse += e * e;
    sumA += a;
    if (a !== 0) {
      sape += Math.abs(e / a);
      cntApe++;
    }
    const den = Math.abs(a) + Math.abs(f);
    if (den > 0) {
      ssape += (2 * Math.abs(e)) / den;
      cntS++;
    } else cntS++;
  }
  if (cnt === 0) return { mae: NaN, mse: NaN, rmse: NaN, mape: NaN, smape: NaN, theilU: NaN, r2: NaN };
  const mean = sumA / cnt;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    const a = actual[i];
    if (Number.isFinite(a) && Number.isFinite(fitted[i])) sst += (a - mean) ** 2;
  }
  let num = 0;
  let den = 0;
  for (let i = 1; i < n; i++) {
    const a0 = actual[i - 1];
    const a1 = actual[i];
    const f1 = fitted[i];
    if (!Number.isFinite(a0) || !Number.isFinite(a1) || !Number.isFinite(f1) || a0 === 0) continue;
    num += ((f1 - a1) / a0) ** 2;
    den += ((a1 - a0) / a0) ** 2;
  }
  const mse = sse / cnt;
  return {
    mae: sae / cnt,
    mse,
    rmse: Math.sqrt(mse),
    mape: cntApe ? sape / cntApe : NaN,
    smape: cntS ? ssape / cntS : NaN,
    theilU: den > 0 ? Math.sqrt(num / den) : NaN,
    r2: sst > 0 ? 1 - sse / sst : NaN,
  };
}

/** Information criteria from the Gaussian likelihood concentrated on σ²: n·ln(SSE/n) + 2k (AIC), + k·ln(n) (BIC). */
export function infoCriteria(sse: number, n: number, k: number): { aic: number; bic: number } {
  if (n <= 0 || !(sse > 0)) return { aic: NaN, bic: NaN };
  const base = n * Math.log(sse / n);
  return { aic: base + 2 * k, bic: base + k * Math.log(n) };
}

/**
 * Assembles a ForecastOutput: residuals = y − fitted, metrics with AIC/BIC using `k` parameters,
 * symmetric normal intervals forecast ± z·sd[h] (80 % / 95 % plus one per requested level).
 */
export function assembleOutput(
  method: string,
  params: Record<string, number>,
  y: number[],
  fitted: number[],
  forecast: number[],
  sd: number[],
  k: number,
  levels: readonly number[] = DEFAULT_LEVELS,
): ForecastOutput {
  const residuals = y.map((v, i) => (Number.isFinite(fitted[i]) ? v - fitted[i] : NaN));
  const metrics = errorMetrics(y, fitted);
  let sse = 0;
  let n = 0;
  for (const r of residuals)
    if (Number.isFinite(r)) {
      sse += r * r;
      n++;
    }
  const ic = infoCriteria(sse, n, k);
  return {
    method,
    params,
    fitted,
    forecast,
    lower95: forecast.map((f, i) => f - Z95 * sd[i]),
    upper95: forecast.map((f, i) => f + Z95 * sd[i]),
    lower80: forecast.map((f, i) => f - Z80 * sd[i]),
    upper80: forecast.map((f, i) => f + Z80 * sd[i]),
    intervals: intervalsFrom(forecast, sd, levels, zForLevel),
    residuals,
    metrics: { ...metrics, aic: ic.aic, bic: ic.bic },
  };
}

/** Residual standard deviation √(SSE/(n − k)) over finite residuals. */
export function residualSigma(residuals: number[], k: number): number {
  let sse = 0;
  let n = 0;
  for (const r of residuals)
    if (Number.isFinite(r)) {
      sse += r * r;
      n++;
    }
  const df = Math.max(1, n - k);
  return Math.sqrt(sse / df);
}

export function mean(a: number[]): number {
  let s = 0;
  for (const v of a) s += v;
  return s / a.length;
}

export function validateSeries(y: number[], minLength: number, name: string): void {
  if (!Array.isArray(y) || y.length < minLength) throw new Error(`${name}: need at least ${minLength} observations`);
  for (const v of y) if (!Number.isFinite(v)) throw new Error(`${name}: series contains non-finite values`);
}

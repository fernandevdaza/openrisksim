/**
 * Deterministic trend curves fitted by least squares on t = 1..n (Excel trendline equivalents).
 * Exponential and power are fitted on ln(y) (as Excel does), so they require y > 0.
 * Prediction intervals use the regression standard errors and the Student t quantile
 * (in log space for exponential/power, then back-transformed).
 */
import { studentTQuantile } from "./_stats";
import { leastSquares } from "./linalg";
import { assembleOutput, intervalsFrom, normalizeLevels, validateSeries, type ForecastOutput, type IntervalOptions } from "./metrics";

export type TrendKind = "linear" | "exponential" | "logarithmic" | "power" | "polynomial2" | "polynomial3";

export function trendForecast(y: number[], h: number, kind: TrendKind, opts: IntervalOptions = {}): ForecastOutput {
  const levels = normalizeLevels(opts.levels);
  const degree = kind === "polynomial3" ? 3 : kind === "polynomial2" ? 2 : 1;
  validateSeries(y, degree + 3, "trendForecast");
  const logY = kind === "exponential" || kind === "power";
  if (logY && y.some((v) => v <= 0)) throw new Error(`trendForecast: ${kind} trend requires positive data`);
  const logT = kind === "logarithmic" || kind === "power";
  const n = y.length;
  const row = (t: number): number[] => {
    const x = logT ? Math.log(t) : t;
    const r = [1];
    for (let d = 1; d <= degree; d++) r.push(Math.pow(x, d));
    return r;
  };
  const X = y.map((_, i) => row(i + 1));
  const target = logY ? y.map(Math.log) : y;
  const fit = leastSquares(X, target);
  const p = X[0].length;
  let sse = 0;
  for (const e of fit.residuals) sse += e * e;
  const df = Math.max(1, n - p);
  const s2 = sse / df;
  const fitted = logY ? fit.fitted.map(Math.exp) : fit.fitted;
  const forecast: number[] = [];
  const seFc: number[] = [];
  for (let i = 1; i <= h; i++) {
    const x0 = row(n + i);
    let mu = 0;
    for (let j = 0; j < p; j++) mu += x0[j] * fit.beta[j];
    let lev = 0;
    for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) lev += x0[a] * fit.xtxInv[a][b] * x0[b];
    const se = Math.sqrt(s2 * (1 + lev));
    forecast.push(mu);
    seFc.push(se);
  }
  const params: Record<string, number> = {};
  const names = ["a", "b", "c", "d"];
  fit.beta.forEach((b, j) => (params[names[j]] = logY && j === 0 ? Math.exp(b) : b));
  // Base output with zero-width intervals, then fill in the exact t-based intervals.
  const out = assembleOutput(`trend:${kind}`, params, y, fitted, forecast.map((m) => (logY ? Math.exp(m) : m)), forecast.map(() => 0), p);
  const tr = logY ? Math.exp : (v: number) => v;
  const tQ = (level: number) => studentTQuantile((1 + level) / 2, df);
  const [i80, i95] = intervalsFrom(forecast, seFc, [0.8, 0.95], tQ, tr);
  out.lower95 = i95.lower;
  out.upper95 = i95.upper;
  out.lower80 = i80.lower;
  out.upper80 = i80.upper;
  out.intervals = intervalsFrom(forecast, seFc, levels, tQ, tr);
  return out;
}

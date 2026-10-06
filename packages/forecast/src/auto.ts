/**
 * Automatic method selection by holdout RMSE.
 */
import { autoArima } from "./arima";
import { normalizeLevels, validateSeries, type ForecastOutput, type IntervalOptions } from "./metrics";
import { holt, holtWinters, movingAverage, simpleExponentialSmoothing } from "./smoothing";
import { trendForecast } from "./trend";

interface Candidate {
  label: string;
  fit: (y: number[], h: number, levels?: number[]) => ForecastOutput;
  minLength: number;
}

function labelOf(out: ForecastOutput): string {
  if (out.method === "arima") return `arima(${out.params.p},${out.params.d},${out.params.q})`;
  return out.method;
}

/**
 * Tries moving average, SES, Holt, damped Holt, Holt–Winters (additive and, for positive data,
 * multiplicative; only when `period` ≥ 2 and the training sample has ≥ 2 full cycles),
 * auto-ARIMA and a linear trend. Each is fitted on the training part and scored by RMSE on the
 * holdout (last 20% of the data, at least one period); the best is refitted on the full series.
 * Short series (< 8 observations) are ranked by in-sample RMSE instead.
 */
export function autoForecast(
  y: number[],
  h: number,
  period?: number,
  opts: IntervalOptions = {},
): { best: ForecastOutput; ranking: { method: string; rmse: number; aic?: number }[] } {
  validateSeries(y, 4, "autoForecast");
  const levels = normalizeLevels(opts.levels);
  const n = y.length;
  const m = period && period >= 2 ? Math.round(period) : 0;
  const window = m || 3;
  const candidates: Candidate[] = [
    { label: "movingAverage", fit: (s, k, lv) => movingAverage(s, k, window, { levels: lv }), minLength: window + 2 },
    { label: "ses", fit: (s, k, lv) => simpleExponentialSmoothing(s, k, undefined, { levels: lv }), minLength: 3 },
    { label: "holt", fit: (s, k, lv) => holt(s, k, { levels: lv }), minLength: 4 },
    { label: "holtDamped", fit: (s, k, lv) => holt(s, k, { damped: true, levels: lv }), minLength: 5 },
    { label: "arima", fit: (s, k, lv) => autoArima(s, k, { levels: lv }), minLength: 10 },
    { label: "trend:linear", fit: (s, k, lv) => trendForecast(s, k, "linear", { levels: lv }), minLength: 4 },
  ];
  if (m) {
    candidates.push({ label: "holtWintersAdditive", fit: (s, k, lv) => holtWinters(s, k, m, { levels: lv }), minLength: 2 * m });
    if (y.every((v) => v > 0))
      candidates.push({
        label: "holtWintersMultiplicative",
        fit: (s, k, lv) => holtWinters(s, k, m, { seasonal: "multiplicative", levels: lv }),
        minLength: 2 * m,
      });
  }

  let holdout = n >= 8 ? Math.max(Math.round(0.2 * n), m || 1) : 0;
  // Keep enough training data for the seasonal models when possible.
  if (holdout > 0 && n - holdout < Math.max(4, 2 * m)) holdout = Math.max(1, Math.min(holdout, n - Math.max(4, 2 * m)));
  if (holdout > 0 && n - holdout < 4) holdout = 0;
  const train = holdout ? y.slice(0, n - holdout) : y;
  const test = holdout ? y.slice(n - holdout) : [];

  const scored: { cand: Candidate; method: string; rmse: number; aic?: number }[] = [];
  for (const cand of candidates) {
    if (train.length < cand.minLength) continue;
    try {
      const out = cand.fit(train, holdout);
      let rmse: number;
      if (holdout) {
        let s = 0;
        for (let i = 0; i < holdout; i++) s += (test[i] - out.forecast[i]) ** 2;
        rmse = Math.sqrt(s / holdout);
      } else rmse = out.metrics.rmse;
      if (Number.isFinite(rmse)) scored.push({ cand, method: labelOf(out), rmse, aic: out.metrics.aic });
    } catch {
      /* method not applicable to this series */
    }
  }
  scored.sort((a, b) => a.rmse - b.rmse);
  for (const s of scored) {
    try {
      const best = s.cand.fit(y, h, levels);
      return { best, ranking: scored.map(({ method, rmse, aic }) => ({ method, rmse, aic })) };
    } catch {
      /* try the next one */
    }
  }
  throw new Error("autoForecast: no method could be fitted");
}

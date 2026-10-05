/**
 * Descriptive time-series tools: ACF/PACF, classical decomposition, seasonality detection,
 * Ljung–Box and augmented Dickey–Fuller tests.
 */
import { chiSquareCdf, normalCdf } from "./_stats";
import { leastSquares } from "./linalg";
import { mean } from "./metrics";
import { centeredMovingAverage } from "./smoothing";

/** d-th order differences. */
export function difference(y: number[], d = 1): number[] {
  let w = y.slice();
  for (let k = 0; k < d; k++) {
    const next: number[] = [];
    for (let t = 1; t < w.length; t++) next.push(w[t] - w[t - 1]);
    w = next;
  }
  return w;
}

/** Sample autocorrelations r_0..r_maxLag (index = lag, r_0 = 1). */
export function acf(y: number[], maxLag: number): number[] {
  const n = y.length;
  const L = Math.max(0, Math.min(Math.floor(maxLag), n - 1));
  const mu = mean(y);
  let c0 = 0;
  for (const v of y) c0 += (v - mu) ** 2;
  const out = [1];
  for (let k = 1; k <= L; k++) {
    let s = 0;
    for (let t = k; t < n; t++) s += (y[t] - mu) * (y[t - k] - mu);
    out.push(c0 > 0 ? s / c0 : 0);
  }
  return out;
}

/** Partial autocorrelations by Durbin–Levinson (index = lag, element 0 = 1). */
export function pacf(y: number[], maxLag: number): number[] {
  const r = acf(y, maxLag);
  return pacfFromAcf(r);
}

export function pacfFromAcf(r: number[]): number[] {
  const L = r.length - 1;
  const out = [1];
  let phi: number[] = [];
  for (let k = 1; k <= L; k++) {
    let num = r[k];
    let den = 1;
    for (let j = 1; j < k; j++) {
      num -= phi[j - 1] * r[k - j];
      den -= phi[j - 1] * r[j];
    }
    const pkk = den !== 0 ? num / den : 0;
    const next: number[] = [];
    for (let j = 1; j < k; j++) next.push(phi[j - 1] - pkk * phi[k - j - 1]);
    next.push(pkk);
    phi = next;
    out.push(pkk);
  }
  return out;
}

/**
 * Classical decomposition: trend = centered moving average of order `period` (2×m for even m),
 * seasonal = average detrended value per season position (normalised to sum 0 / mean 1),
 * residual = remainder. Trend/residual are NaN at the ends where the moving average is undefined.
 * additive: y = T + S + R; multiplicative: y = T·S·R.
 */
export function decompose(
  y: number[],
  period: number,
  kind: "additive" | "multiplicative" = "additive",
): { trend: number[]; seasonal: number[]; residual: number[] } {
  const m = Math.round(period);
  if (m < 2 || y.length < 2 * m) throw new Error("decompose: need period ≥ 2 and at least two full cycles");
  const mult = kind === "multiplicative";
  if (mult && y.some((v) => v <= 0)) throw new Error("decompose: multiplicative decomposition requires positive data");
  const trend = centeredMovingAverage(y, m);
  const sums = new Array<number>(m).fill(0);
  const counts = new Array<number>(m).fill(0);
  y.forEach((v, t) => {
    if (!Number.isFinite(trend[t])) return;
    sums[t % m] += mult ? v / trend[t] : v - trend[t];
    counts[t % m]++;
  });
  let idx = sums.map((s, j) => (counts[j] ? s / counts[j] : mult ? 1 : 0));
  const avg = mean(idx);
  idx = idx.map((s) => (mult ? s / avg : s - avg));
  const seasonal = y.map((_, t) => idx[t % m]);
  const residual = y.map((v, t) =>
    Number.isFinite(trend[t]) ? (mult ? v / (trend[t] * seasonal[t]) : v - trend[t] - seasonal[t]) : NaN,
  );
  return { trend, seasonal, residual };
}

function linearDetrend(y: number[]): number[] {
  if (y.length < 3) return y.slice();
  const fit = leastSquares(
    y.map((_, i) => [1, i]),
    y,
  );
  return fit.residuals;
}

/**
 * Seasonality detection from the ACF of the linearly detrended series: every lag in
 * [2, maxPeriod] that is a local ACF peak and significant (> 1.96/√n) is a candidate period.
 * `strength` = autocorrelation at that lag. Sorted by strength (desc).
 */
export function seasonalityTest(y: number[], maxPeriod?: number): { period: number; strength: number }[] {
  const n = y.length;
  if (n < 6) return [];
  const maxP = Math.max(2, Math.min(Math.floor(maxPeriod ?? Math.min(24, n / 2)), Math.floor(n / 2)));
  const r = acf(linearDetrend(y), maxP + 1);
  const crit = 1.96 / Math.sqrt(n);
  const out: { period: number; strength: number }[] = [];
  for (let p = 2; p <= maxP && p < r.length; p++) {
    const left = r[p - 1];
    const right = p + 1 < r.length ? r[p + 1] : -Infinity;
    if (r[p] > left && r[p] >= right && r[p] > crit) out.push({ period: p, strength: r[p] });
  }
  return out.sort((a, b) => b.strength - a.strength);
}

/** Ljung–Box portmanteau test on residuals (non-finite values dropped), df = lags. */
export function ljungBox(residuals: number[], lags: number): { q: number; pValue: number } {
  const e = residuals.filter((v) => Number.isFinite(v));
  const n = e.length;
  const L = Math.max(1, Math.min(Math.floor(lags), n - 1));
  const r = acf(e, L);
  let q = 0;
  for (let k = 1; k <= L; k++) q += (r[k] * r[k]) / (n - k);
  q *= n * (n + 2);
  return { q, pValue: 1 - chiSquareCdf(q, L) };
}

/**
 * MacKinnon (1994) approximate p-value for the ADF τ statistic, regression with constant,
 * one series (coefficients as in statsmodels' `mackinnonp`).
 */
export function mackinnonP(tau: number): number {
  const tauMax = 2.74;
  const tauMin = -18.83;
  const tauStar = -1.61;
  if (tau > tauMax) return 1;
  if (tau < tauMin) return 0;
  const c = tau <= tauStar ? [2.1659, 1.4412, 0.038269] : [1.7339, 0.93202, -0.12745, -0.010368];
  let v = 0;
  for (let i = c.length - 1; i >= 0; i--) v = v * tau + c[i];
  return normalCdf(v);
}

interface AdfFit {
  tau: number;
  aic: number;
}

function adfRegression(y: number[], lags: number, start: number): AdfFit {
  const dy = difference(y);
  // Observation t uses Δy_t (t ≥ start ≥ lags), y_{t} level index: Δy_t = y_{t+1} − y_t in dy indexing.
  const X: number[][] = [];
  const target: number[] = [];
  for (let t = start; t < dy.length; t++) {
    const row = [1, y[t]];
    for (let i = 1; i <= lags; i++) row.push(dy[t - i]);
    X.push(row);
    target.push(dy[t]);
  }
  const fit = leastSquares(X, target);
  const n = target.length;
  const k = X[0].length;
  let sse = 0;
  for (const r of fit.residuals) sse += r * r;
  const s2 = sse / (n - k);
  const se = Math.sqrt(s2 * fit.xtxInv[1][1]);
  const aic = n * Math.log(sse / n) + 2 * k;
  return { tau: fit.beta[1] / se, aic };
}

/**
 * Augmented Dickey–Fuller test with constant: Δy_t = a + β·y_{t−1} + Σ γ_i Δy_{t−i} + e_t.
 * Lag order chosen by AIC up to 12·(n/100)^{1/4} (Schwert) on a common sample, then refitted on
 * the full sample. H0: unit root. `stationary` = pValue < 0.05.
 */
export function adfTest(y: number[]): { statistic: number; pValue: number; stationary: boolean } {
  const n = y.length;
  if (n < 8) return { statistic: NaN, pValue: NaN, stationary: false };
  let kmax = Math.floor(12 * Math.pow(n / 100, 0.25));
  kmax = Math.max(0, Math.min(kmax, Math.floor((n - 1) / 3) - 1));
  try {
    let bestK = 0;
    let bestAic = Infinity;
    for (let k = 0; k <= kmax; k++) {
      const r = adfRegression(y, k, kmax);
      if (r.aic < bestAic) {
        bestAic = r.aic;
        bestK = k;
      }
    }
    const tau = adfRegression(y, bestK, bestK).tau;
    const pValue = mackinnonP(tau);
    return { statistic: tau, pValue, stationary: pValue < 0.05 };
  } catch {
    // Constant / degenerate series: no unit-root behaviour to speak of.
    return { statistic: NaN, pValue: NaN, stationary: true };
  }
}

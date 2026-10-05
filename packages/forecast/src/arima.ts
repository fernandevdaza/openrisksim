/**
 * ARIMA(p,d,q), estimated like R's default "CSS-ML":
 * - The series is differenced d times; a constant (mean when d = 0, drift when d = 1) is estimated.
 * - AR and MA polynomials are parametrised through partial autocorrelations κ = tanh(u)
 *   (Jones 1980 / Monahan 1984), so every candidate is stationary and invertible.
 * - Starting values from Hannan–Rissanen → conditional sum of squares (CSS) by Nelder–Mead →
 *   exact Gaussian likelihood (Kalman filter, Gardner–Harvey–Phillips state space) by Nelder–Mead.
 * - Forecasts from the Kalman predicted state; prediction intervals from the ψ-weights of
 *   φ(B)(1−B)^d with the ML innovation variance.
 */
import { leastSquares, solve } from "./linalg";
import { assembleOutput, mean, validateSeries, type ForecastOutput } from "./metrics";
import { nelderMead } from "./optim";
import { adfTest, difference } from "./tsa";

export interface ArimaOrder {
  p: number;
  d: number;
  q: number;
}

interface ArimaFit {
  order: ArimaOrder;
  phi: number[];
  theta: number[];
  mu: number;
  hasConst: boolean;
  w: number[];
  /** One-step prediction errors of the differenced series (Kalman innovations). */
  v: number[];
  /** Exact log-likelihood. */
  logLik: number;
  /** ML innovation variance. */
  sigma2: number;
  /** Predicted state for time n (first forecast). */
  aNext: number[];
  T: number[][];
  /** Largest |partial autocorrelation| of the AR and MA polynomials (≈ 1 ⇒ root near the unit circle). */
  maxPartial: number;
}

/** Levinson step-up: partial autocorrelations → AR coefficients. */
function stepUp(kappa: number[]): number[] {
  let phi: number[] = [];
  for (let k = 1; k <= kappa.length; k++) {
    const kk = kappa[k - 1];
    const next: number[] = [];
    for (let j = 1; j < k; j++) next.push(phi[j - 1] - kk * phi[k - j - 1]);
    next.push(kk);
    phi = next;
  }
  return phi;
}

/** Inverse of stepUp; partials clamped to ±0.95 (for starting values only). */
function stepDown(phi: number[]): number[] {
  const p = phi.length;
  const kappa = new Array<number>(p).fill(0);
  let a = phi.slice();
  for (let k = p; k >= 1; k--) {
    let kk = a[k - 1];
    if (!Number.isFinite(kk)) kk = 0;
    kk = Math.max(-0.95, Math.min(0.95, kk));
    kappa[k - 1] = kk;
    const prev: number[] = [];
    for (let j = 1; j < k; j++) prev.push((a[j - 1] + kk * a[k - j - 1]) / (1 - kk * kk));
    a = prev;
  }
  return kappa;
}

function cssSse(w: number[], phi: number[], theta: number[], mu: number, start: number): number {
  const n = w.length;
  const e = new Array<number>(n).fill(0);
  let sse = 0;
  const p = phi.length;
  const q = theta.length;
  for (let t = start; t < n; t++) {
    let v = w[t] - mu;
    for (let i = 1; i <= p; i++) v -= phi[i - 1] * (w[t - i] - mu);
    for (let j = 1; j <= q; j++) if (t - j >= start) v -= theta[j - 1] * e[t - j];
    e[t] = v;
    sse += v * v;
  }
  return sse;
}

/** Hannan–Rissanen initial estimates. */
function hannanRissanen(w: number[], p: number, q: number, mu: number): { phi: number[]; theta: number[] } {
  const n = w.length;
  const z = w.map((v) => v - mu);
  try {
    let ehat = new Array<number>(n).fill(0);
    let s0 = 0;
    if (q > 0) {
      const m = Math.min(Math.max(p + q + 2, 8), Math.floor(n / 3));
      if (m < 1) throw new Error("short");
      const X: number[][] = [];
      const yv: number[] = [];
      for (let t = m; t < n; t++) {
        X.push(Array.from({ length: m }, (_, i) => z[t - i - 1]));
        yv.push(z[t]);
      }
      const fit = leastSquares(X, yv);
      ehat = new Array<number>(n).fill(0);
      for (let t = m; t < n; t++) ehat[t] = fit.residuals[t - m];
      s0 = m;
    }
    if (p + q === 0) return { phi: [], theta: [] };
    const start = s0 + Math.max(p, q);
    const X: number[][] = [];
    const yv: number[] = [];
    for (let t = start; t < n; t++) {
      const row: number[] = [];
      for (let i = 1; i <= p; i++) row.push(z[t - i]);
      for (let j = 1; j <= q; j++) row.push(ehat[t - j]);
      X.push(row);
      yv.push(z[t]);
    }
    if (X.length <= p + q + 1) throw new Error("short");
    const b = leastSquares(X, yv).beta;
    return { phi: b.slice(0, p), theta: b.slice(p) };
  } catch {
    return { phi: new Array<number>(p).fill(0), theta: new Array<number>(q).fill(0) };
  }
}

interface KalmanOut {
  v: number[];
  sumSq: number;
  sumLogF: number;
  aNext: number[];
  T: number[][];
}

/**
 * Kalman filter for a zero-mean ARMA in Harvey's state-space form (σ² concentrated out).
 * Flat typed-array implementation; switches to the steady-state gain once the covariance has
 * converged (always the case for invertible models, usually after a few dozen steps).
 */
function kalmanArma(z: number[], phi: number[], theta: number[]): KalmanOut | null {
  const p = phi.length;
  const q = theta.length;
  const r = Math.max(p, q + 1);
  const T: number[][] = Array.from({ length: r }, (_, i) => {
    const row = new Array<number>(r).fill(0);
    if (i < p) row[0] = phi[i];
    if (i + 1 < r) row[i + 1] = 1;
    return row;
  });
  const ph = new Float64Array(r);
  for (let i = 0; i < p; i++) ph[i] = phi[i];
  const R = new Float64Array(r);
  R[0] = 1;
  for (let i = 1; i < r; i++) R[i] = i - 1 < q ? theta[i - 1] : 0;
  const Q = new Float64Array(r * r);
  for (let i = 0; i < r; i++) for (let j = 0; j < r; j++) Q[i * r + j] = R[i] * R[j];
  // Stationary covariance P solves P = T P Tᵀ + Q.
  let P: Float64Array<ArrayBuffer> = new Float64Array(r * r);
  if (p === 0) {
    // Pure MA: T is nilpotent, P = Σ_k T^k Q T^kᵀ.
    let term: Float64Array<ArrayBuffer> = Q.slice();
    P.set(Q);
    for (let k = 1; k < r; k++) {
      term = tpt(ph, term, r);
      for (let i = 0; i < r * r; i++) P[i] += term[i];
    }
  } else {
    const r2 = r * r;
    const M: number[][] = Array.from({ length: r2 }, () => new Array<number>(r2).fill(0));
    for (let i = 0; i < r; i++)
      for (let j = 0; j < r; j++)
        for (let k = 0; k < r; k++)
          for (let l = 0; l < r; l++) M[i * r + j][k * r + l] = (i * r + j === k * r + l ? 1 : 0) - T[i][k] * T[j][l];
    try {
      P = Float64Array.from(solve(M, Array.from(Q)));
    } catch {
      return null;
    }
  }
  const n = z.length;
  const v = new Array<number>(n);
  let a = new Float64Array(r);
  let aU = new Float64Array(r);
  const K = new Float64Array(r);
  const PU = new Float64Array(r * r);
  let sumSq = 0;
  let sumLogF = 0;
  let steady = false;
  let F = 1;
  let logF = 0;
  for (let t = 0; t < n; t++) {
    if (!steady) {
      F = P[0];
      if (!(F > 0)) return null;
      logF = Math.log(F);
      for (let i = 0; i < r; i++) K[i] = P[i * r] / F;
    }
    const vt = z[t] - a[0];
    v[t] = vt;
    sumSq += (vt * vt) / F;
    sumLogF += logF;
    for (let i = 0; i < r; i++) aU[i] = a[i] + K[i] * vt;
    // a ← T aU
    const a0 = aU[0];
    for (let i = 0; i < r; i++) a[i] = ph[i] * a0 + (i + 1 < r ? aU[i + 1] : 0);
    if (!steady) {
      for (let i = 0; i < r; i++) for (let j = 0; j < r; j++) PU[i * r + j] = P[i * r + j] - K[i] * P[j];
      const PN = tpt(ph, PU, r);
      let diff = 0;
      for (let i = 0; i < r * r; i++) {
        PN[i] += Q[i];
        const dd = Math.abs(PN[i] - P[i]);
        if (dd > diff) diff = dd;
      }
      P = PN;
      if (diff < 1e-11) steady = true;
    }
  }
  return { v, sumSq, sumLogF, aNext: Array.from(a), T };
}

/** T X Tᵀ for the companion-like transition (first column φ, ones on the superdiagonal). */
function tpt(ph: Float64Array, X: Float64Array, r: number): Float64Array<ArrayBuffer> {
  // Y = T X: Y[i][j] = φ_i X[0][j] + X[i+1][j]
  const Y = new Float64Array(r * r);
  for (let i = 0; i < r; i++)
    for (let j = 0; j < r; j++) Y[i * r + j] = ph[i] * X[j] + (i + 1 < r ? X[(i + 1) * r + j] : 0);
  // Z = Y Tᵀ: Z[i][j] = Σ_k Y[i][k] T[j][k] = Y[i][0] φ_j + Y[i][j+1]
  const Z = new Float64Array(r * r);
  for (let i = 0; i < r; i++)
    for (let j = 0; j < r; j++) Z[i * r + j] = Y[i * r] * ph[j] + (j + 1 < r ? Y[i * r + j + 1] : 0);
  return Z;
}

function fitArima(y: number[], order: ArimaOrder): ArimaFit {
  const { p, d, q } = order;
  const w = difference(y, d);
  const n = w.length;
  const hasConst = d <= 1;
  const k = p + q + (hasConst ? 1 : 0);
  if (n - p < k + 3) throw new Error(`arima: series too short for ARIMA(${p},${d},${q})`);
  const wMean = hasConst ? mean(w) : 0;
  let sd = 0;
  for (const x of w) sd += (x - wMean) ** 2;
  sd = Math.sqrt(sd / Math.max(1, n - 1)) || 1;

  const init = hannanRissanen(w, p, q, wMean);
  const u0 = stepDown(init.phi).map(Math.atanh);
  const v0 = stepDown(init.theta.map((t) => -t)).map(Math.atanh);
  const decode = (x: number[]) => {
    const phi = stepUp(x.slice(0, p).map(Math.tanh));
    const theta = stepUp(x.slice(p, p + q).map(Math.tanh)).map((t) => -t);
    const mu = hasConst ? x[p + q] : 0;
    return { phi, theta, mu };
  };
  const x0 = [...u0, ...v0];
  const lower = x0.map(() => -4);
  const upper = x0.map(() => 4);
  if (hasConst) {
    x0.push(wMean);
    const halfWidth = 2 * sd + 1e-8;
    lower.push(wMean - halfWidth);
    upper.push(wMean + halfWidth);
  }
  const negLogLik = (x: number[]): number => {
    const m = decode(x);
    const kf = kalmanArma(
      w.map((wt) => wt - m.mu),
      m.phi,
      m.theta,
    );
    if (!kf || !(kf.sumSq > 0)) return Infinity;
    return 0.5 * (n * Math.log(kf.sumSq / n) + kf.sumLogF);
  };
  let best = x0;
  if (x0.length > 0) {
    const css = nelderMead(
      (x) => {
        const m = decode(x);
        return cssSse(w, m.phi, m.theta, m.mu, p);
      },
      x0,
      { lower, upper, maxEvaluations: 200 * x0.length, tolerance: 1e-8 },
    );
    best = nelderMead(negLogLik, css.x, { lower, upper, maxEvaluations: 150 * x0.length, tolerance: 1e-9 }).x;
    // Guard: if ML moved somewhere worse than the CSS start (should not happen), keep CSS.
    if (negLogLik(css.x) < negLogLik(best)) best = css.x;
  }
  const m = decode(best);
  const kf = kalmanArma(
    w.map((wt) => wt - m.mu),
    m.phi,
    m.theta,
  );
  if (!kf) throw new Error("arima: likelihood evaluation failed");
  const sigma2 = kf.sumSq / n;
  const logLik = -0.5 * (n * Math.log(2 * Math.PI * sigma2) + kf.sumLogF + n);
  let maxPartial = 0;
  for (let i = 0; i < p + q; i++) maxPartial = Math.max(maxPartial, Math.abs(Math.tanh(best[i])));
  return {
    order,
    phi: m.phi,
    theta: m.theta,
    mu: m.mu,
    hasConst,
    w,
    v: kf.v,
    logLik,
    sigma2,
    aNext: kf.aNext,
    T: kf.T,
    maxPartial,
  };
}

function polyMul(a: number[], b: number[]): number[] {
  const out = new Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  return out;
}

function psiWeights(phi: number[], theta: number[], d: number, h: number): number[] {
  let ar = [1, ...phi.map((x) => -x)];
  for (let k = 0; k < d; k++) ar = polyMul(ar, [1, -1]);
  const phiStar = ar.slice(1).map((x) => -x);
  const psi = [1];
  for (let j = 1; j < h; j++) {
    let v = j <= theta.length ? theta[j - 1] : 0;
    for (let i = 1; i <= Math.min(j, phiStar.length); i++) v += phiStar[i - 1] * psi[j - i];
    psi.push(v);
  }
  return psi;
}

function nParams(fit: ArimaFit): number {
  return fit.order.p + fit.order.q + (fit.hasConst ? 1 : 0) + 1;
}

function aicOf(fit: ArimaFit): number {
  return -2 * fit.logLik + 2 * nParams(fit);
}

function forecastFit(y: number[], fit: ArimaFit, h: number): ForecastOutput {
  const { p, d, q } = fit.order;
  const { phi, theta, mu, T } = fit;
  // Forecast the differenced series from the predicted state.
  const wFc: number[] = [];
  let a = fit.aNext.slice();
  const r = a.length;
  for (let i = 0; i < h; i++) {
    wFc.push(mu + a[0]);
    const aN = new Array<number>(r);
    for (let j = 0; j < r; j++) aN[j] = T[j][0] * a[0] + (j + 1 < r ? a[j + 1] : 0);
    a = aN;
  }
  // Integrate back d times.
  let fc = wFc;
  for (let k = d - 1; k >= 0; k--) {
    const level = difference(y, k);
    let last = level[level.length - 1];
    fc = fc.map((v) => (last = last + v));
  }
  const psi = psiWeights(phi, theta, d, h);
  const sd: number[] = [];
  let acc = 0;
  for (let i = 0; i < h; i++) {
    acc += psi[i] * psi[i];
    sd.push(Math.sqrt(fit.sigma2 * acc));
  }
  const fitted = new Array<number>(y.length).fill(NaN);
  for (let t = 0; t < fit.v.length; t++) fitted[t + d] = y[t + d] - fit.v[t];
  const params: Record<string, number> = { p, d, q };
  phi.forEach((v, i) => (params[`ar${i + 1}`] = v));
  theta.forEach((v, i) => (params[`ma${i + 1}`] = v));
  if (fit.hasConst) params[d === 0 ? "mean" : "drift"] = mu;
  params.sigma2 = fit.sigma2;
  params.logLik = fit.logLik;
  const k = nParams(fit);
  const out = assembleOutput("arima", params, y, fitted, fc, sd, k);
  const nObs = fit.w.length;
  out.metrics.aic = aicOf(fit);
  out.metrics.bic = -2 * fit.logLik + k * Math.log(nObs);
  return out;
}

/**
 * ARIMA(p,d,q) by CSS + exact maximum likelihood; constant (mean) when d = 0, drift when d = 1,
 * none when d ≥ 2. `metrics.aic/bic` are the exact-likelihood criteria.
 */
export function arima(y: number[], h: number, order: ArimaOrder): ForecastOutput {
  const p = Math.max(0, Math.round(order.p));
  const d = Math.max(0, Math.round(order.d));
  const q = Math.max(0, Math.round(order.q));
  validateSeries(y, p + d + q + 4, "arima");
  return forecastFit(y, fitArima(y, { p, d, q }), h);
}

/**
 * Automatic ARIMA: d chosen by repeated ADF tests (≤ maxD, default 2), then every p ≤ maxP,
 * q ≤ maxQ (default 3) is fitted and the lowest AIC wins. As in R's auto.arima, models with a
 * root (almost) on the unit circle are discarded unless nothing else is available.
 */
export function autoArima(
  y: number[],
  h: number,
  opts: { maxP?: number; maxD?: number; maxQ?: number } = {},
): ForecastOutput {
  const maxP = opts.maxP ?? 3;
  const maxQ = opts.maxQ ?? 3;
  const maxD = opts.maxD ?? 2;
  validateSeries(y, 6, "autoArima");
  let d = 0;
  while (d < maxD) {
    const w = difference(y, d);
    if (w.length < 10 || adfTest(w).stationary) break;
    d++;
  }
  let best: { fit: ArimaFit; aic: number } | null = null;
  let fallback: { fit: ArimaFit; aic: number } | null = null;
  for (let p = 0; p <= maxP; p++) {
    for (let q = 0; q <= maxQ; q++) {
      try {
        const fit = fitArima(y, { p, d, q });
        const aic = aicOf(fit);
        if (!Number.isFinite(aic)) continue;
        if (!fallback || aic < fallback.aic) fallback = { fit, aic };
        if (fit.maxPartial < 0.99 && (!best || aic < best.aic)) best = { fit, aic };
      } catch {
        /* order not estimable with this sample size */
      }
    }
  }
  best ??= fallback;
  if (!best) throw new Error("autoArima: no ARIMA model could be estimated");
  return forecastFit(y, best.fit, h);
}

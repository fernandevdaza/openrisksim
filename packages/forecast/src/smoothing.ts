/**
 * Moving average and exponential smoothing (SES, Holt, damped Holt, Holt–Winters) in the
 * error-correction form of Hyndman & Athanasopoulos, "Forecasting: Principles and Practice".
 * Smoothing parameters are optimised by minimising the in-sample one-step SSE with a bounded
 * Nelder–Mead; initial states use the classical heuristics (no state optimisation).
 */
import { leastSquares } from "./linalg";
import { assembleOutput, mean, residualSigma, validateSeries, type ForecastOutput } from "./metrics";
import { minimize } from "./optim";

type Season = "none" | "additive" | "multiplicative";

interface EtsSpec {
  trend: boolean;
  damped: boolean;
  season: Season;
  m: number;
}

interface EtsParams {
  alpha: number;
  beta: number;
  gamma: number;
  phi: number;
}

interface EtsInit {
  l0: number;
  b0: number;
  /** Seasonal states for times −m..−1 (index j used at t = j mod m). */
  s0: number[];
}

interface EtsRun {
  fitted: number[];
  sse: number;
  level: number;
  trend: number;
  seasons: number[];
}

function etsRun(y: number[], spec: EtsSpec, p: EtsParams, init: EtsInit): EtsRun {
  const n = y.length;
  const { alpha, gamma } = p;
  const beta = spec.trend ? p.beta : 0;
  const phi = spec.trend ? (spec.damped ? p.phi : 1) : 0;
  const m = spec.season === "none" ? 1 : spec.m;
  const seasons = spec.season === "none" ? [0] : init.s0.slice();
  let l = init.l0;
  let b = spec.trend ? init.b0 : 0;
  const fitted = new Array<number>(n);
  let sse = 0;
  for (let t = 0; t < n; t++) {
    const si = t % m;
    const s = seasons[si];
    const base = l + phi * b;
    let f: number;
    if (spec.season === "additive") f = base + s;
    else if (spec.season === "multiplicative") f = base * s;
    else f = base;
    fitted[t] = f;
    const e = y[t] - f;
    sse += e * e;
    const lPrev = l;
    const bPrev = b;
    if (spec.season === "additive") l = alpha * (y[t] - s) + (1 - alpha) * base;
    else if (spec.season === "multiplicative") {
      if (Math.abs(s) < 1e-12) return { fitted, sse: Infinity, level: l, trend: b, seasons };
      l = alpha * (y[t] / s) + (1 - alpha) * base;
    } else l = alpha * y[t] + (1 - alpha) * base;
    if (spec.trend) b = beta * (l - lPrev) + (1 - beta) * phi * bPrev;
    if (spec.season === "additive") seasons[si] = gamma * (y[t] - lPrev - phi * bPrev) + (1 - gamma) * s;
    else if (spec.season === "multiplicative") {
      const d = lPrev + phi * bPrev;
      if (Math.abs(d) < 1e-12) return { fitted, sse: Infinity, level: l, trend: b, seasons };
      seasons[si] = gamma * (y[t] / d) + (1 - gamma) * s;
    }
    if (!Number.isFinite(l) || !Number.isFinite(b)) return { fitted, sse: Infinity, level: l, trend: b, seasons };
  }
  return { fitted, sse, level: l, trend: b, seasons };
}

/** Linear regression of v on t = 1..k → [intercept, slope]. */
function lineFit(v: number[]): [number, number] {
  const k = v.length;
  if (k < 2) return [v[0] ?? 0, 0];
  const X = v.map((_, i) => [1, i + 1]);
  const r = leastSquares(X, v);
  return [r.beta[0], r.beta[1]];
}

/** Centered moving average of order m (2×m MA when m is even). NaN at the ends. */
export function centeredMovingAverage(y: number[], m: number): number[] {
  const n = y.length;
  const out = new Array<number>(n).fill(NaN);
  if (m <= 1) return y.slice();
  if (m % 2 === 1) {
    const h = (m - 1) / 2;
    for (let t = h; t < n - h; t++) {
      let s = 0;
      for (let j = -h; j <= h; j++) s += y[t + j];
      out[t] = s / m;
    }
  } else {
    const h = m / 2;
    for (let t = h; t < n - h; t++) {
      let s = 0.5 * (y[t - h] + y[t + h]);
      for (let j = -h + 1; j <= h - 1; j++) s += y[t + j];
      out[t] = s / m;
    }
  }
  return out;
}

function initialStates(y: number[], spec: EtsSpec): EtsInit {
  if (spec.season === "none") {
    if (!spec.trend) return { l0: y[0], b0: 0, s0: [] };
    const [a, b] = lineFit(y.slice(0, Math.min(y.length, 10)));
    return { l0: a, b0: b, s0: [] };
  }
  const m = spec.m;
  const k = Math.min(y.length, Math.max(2 * m, 10));
  const head = y.slice(0, k);
  const trend = centeredMovingAverage(head, m);
  const mult = spec.season === "multiplicative";
  const sums = new Array<number>(m).fill(0);
  const counts = new Array<number>(m).fill(0);
  for (let t = 0; t < k; t++) {
    if (!Number.isFinite(trend[t])) continue;
    sums[t % m] += mult ? head[t] / trend[t] : head[t] - trend[t];
    counts[t % m]++;
  }
  let s0 = sums.map((s, j) => (counts[j] ? s / counts[j] : mult ? 1 : 0));
  if (mult) {
    const avg = mean(s0);
    s0 = s0.map((s) => s / avg);
  } else {
    const avg = mean(s0);
    s0 = s0.map((s) => s - avg);
  }
  const deseason = head.map((v, t) => (mult ? v / s0[t % m] : v - s0[t % m]));
  const [a, b] = lineFit(deseason);
  return { l0: a, b0: spec.trend ? b : 0, s0 };
}

/** Coefficients c_j of the linear innovations representation (FPP / Hyndman et al. 2008, class 1). */
function etsSd(sigma: number, h: number, spec: EtsSpec, p: EtsParams): number[] {
  const out: number[] = [];
  let acc = 1;
  for (let i = 1; i <= h; i++) {
    out.push(sigma * Math.sqrt(acc));
    const j = i;
    let phiJ = 0;
    if (spec.trend) {
      if (spec.damped) {
        let pw = 1;
        for (let q = 1; q <= j; q++) {
          pw *= p.phi;
          phiJ += pw;
        }
      } else phiJ = j;
    }
    let c = p.alpha + p.alpha * (spec.trend ? p.beta : 0) * phiJ;
    if (spec.season !== "none" && j % spec.m === 0) c += p.gamma;
    acc += c * c;
  }
  return out;
}

function etsForecast(run: EtsRun, n: number, h: number, spec: EtsSpec, phi: number): number[] {
  const out: number[] = [];
  let phiSum = 0;
  let pw = 1;
  for (let i = 1; i <= h; i++) {
    if (spec.trend) {
      if (spec.damped) {
        pw *= phi;
        phiSum += pw;
      } else phiSum = i;
    }
    const base = run.level + phiSum * run.trend;
    const m = spec.season === "none" ? 1 : spec.m;
    const s = spec.season === "none" ? 0 : run.seasons[(n + i - 1) % m];
    out.push(spec.season === "additive" ? base + s : spec.season === "multiplicative" ? base * s : base);
  }
  return out;
}

type ParamName = keyof EtsParams;
const BOUNDS: Record<ParamName, [number, number]> = {
  alpha: [1e-4, 0.9999],
  beta: [1e-4, 0.9999],
  gamma: [1e-4, 0.9999],
  phi: [0.8, 0.98],
};
const STARTS: Record<ParamName, number[]> = {
  alpha: [0.2, 0.5, 0.8],
  beta: [0.1],
  gamma: [0.1],
  phi: [0.95],
};

function fitEts(
  y: number[],
  h: number,
  spec: EtsSpec,
  fixed: Partial<EtsParams>,
  method: string,
): ForecastOutput {
  const init = initialStates(y, spec);
  const names: ParamName[] = ["alpha"];
  if (spec.trend) names.push("beta");
  if (spec.season !== "none") names.push("gamma");
  if (spec.trend && spec.damped) names.push("phi");
  const free = names.filter((nm) => fixed[nm] === undefined);
  const toParams = (x: number[]): EtsParams => {
    const p: EtsParams = { alpha: 0.5, beta: 0, gamma: 0, phi: 1 };
    for (const nm of names) if (fixed[nm] !== undefined) p[nm] = fixed[nm] as number;
    free.forEach((nm, i) => (p[nm] = x[i]));
    if (!spec.trend) p.beta = 0;
    if (!spec.damped) p.phi = 1;
    return p;
  };
  let best: { x: number[]; fx: number } = { x: [], fx: Infinity };
  if (free.length > 0) {
    const lower = free.map((nm) => BOUNDS[nm][0]);
    const upper = free.map((nm) => BOUNDS[nm][1]);
    const obj = (x: number[]) => etsRun(y, spec, toParams(x), init).sse;
    const startAlphas = free.includes("alpha") ? STARTS.alpha : [0];
    for (const a0 of startAlphas) {
      const x0 = free.map((nm) => (nm === "alpha" ? a0 : STARTS[nm][0]));
      const r = minimize(obj, x0, lower, upper, 300 * free.length);
      if (r.fx < best.fx) best = r;
    }
  }
  const params = toParams(best.x);
  const run = etsRun(y, spec, params, init);
  const nStates = 1 + (spec.trend ? 1 : 0) + (spec.season !== "none" ? spec.m - 1 : 0);
  const k = names.length + nStates;
  const residuals = y.map((v, i) => v - run.fitted[i]);
  const sigma = residualSigma(residuals, k);
  const forecast = etsForecast(run, y.length, h, spec, params.phi);
  let sd = etsSd(sigma, h, spec, params);
  if (spec.season === "multiplicative") {
    // Approximation: scale additive-error variance by the relative size of the seasonal factor.
    sd = sd.map((s, i) => s * Math.max(0.1, run.seasons[(y.length + i) % spec.m]));
  }
  const out: Record<string, number> = { alpha: params.alpha, l0: init.l0 };
  if (spec.trend) {
    out.beta = params.beta;
    out.b0 = init.b0;
  }
  if (spec.season !== "none") {
    out.gamma = params.gamma;
    out.period = spec.m;
  }
  if (spec.damped) out.phi = params.phi;
  return assembleOutput(method, out, y, run.fitted, forecast, sd, k);
}

/**
 * Simple moving average of the last `window` observations; one-step fitted values are the
 * average of the preceding window (NaN for t < window). Flat forecast; intervals ≈ σ·√h.
 */
export function movingAverage(y: number[], h: number, window: number): ForecastOutput {
  const w = Math.max(1, Math.round(window));
  validateSeries(y, w + 1, "movingAverage");
  const n = y.length;
  const fitted = new Array<number>(n).fill(NaN);
  for (let t = w; t < n; t++) {
    let s = 0;
    for (let j = t - w; j < t; j++) s += y[j];
    fitted[t] = s / w;
  }
  const last = mean(y.slice(n - w));
  const residuals = y.map((v, i) => v - fitted[i]);
  const sigma = residualSigma(residuals, 0);
  const forecast = new Array<number>(h).fill(last);
  const sd = forecast.map((_, i) => sigma * Math.sqrt(i + 1));
  return assembleOutput("movingAverage", { window: w }, y, fitted, forecast, sd, 1);
}

/** Simple exponential smoothing (ETS(A,N,N)); alpha optimised by SSE when omitted. */
export function simpleExponentialSmoothing(y: number[], h: number, alpha?: number): ForecastOutput {
  validateSeries(y, 2, "simpleExponentialSmoothing");
  return fitEts(y, h, { trend: false, damped: false, season: "none", m: 1 }, { alpha }, "ses");
}

/** Holt's linear trend (optionally damped: ETS(A,Ad,N)). Unspecified parameters are optimised. */
export function holt(
  y: number[],
  h: number,
  opts: { alpha?: number; beta?: number; damped?: boolean; phi?: number } = {},
): ForecastOutput {
  validateSeries(y, 3, "holt");
  const damped = !!opts.damped || opts.phi !== undefined;
  return fitEts(
    y,
    h,
    { trend: true, damped, season: "none", m: 1 },
    { alpha: opts.alpha, beta: opts.beta, phi: opts.phi },
    damped ? "holtDamped" : "holt",
  );
}

/** Holt–Winters additive or multiplicative seasonality. Requires at least two full seasonal cycles. */
export function holtWinters(
  y: number[],
  h: number,
  period: number,
  opts: { seasonal?: "additive" | "multiplicative"; alpha?: number; beta?: number; gamma?: number } = {},
): ForecastOutput {
  const m = Math.round(period);
  if (m < 2) throw new Error("holtWinters: period must be ≥ 2");
  validateSeries(y, 2 * m, "holtWinters");
  const seasonal = opts.seasonal ?? "additive";
  if (seasonal === "multiplicative" && y.some((v) => v <= 0))
    throw new Error("holtWinters: multiplicative seasonality requires strictly positive data");
  return fitEts(
    y,
    h,
    { trend: true, damped: false, season: seasonal, m },
    { alpha: opts.alpha, beta: opts.beta, gamma: opts.gamma },
    seasonal === "additive" ? "holtWintersAdditive" : "holtWintersMultiplicative",
  );
}

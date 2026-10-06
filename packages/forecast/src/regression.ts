/**
 * Ordinary least squares with full coefficient statistics (Excel LINEST / Analysis ToolPak
 * "Regression" compatible), VIF, Durbin–Watson, ANOVA, and stepwise selection.
 */
import { studentTQuantile, tTwoSidedP, fUpperP } from "./_stats";
import { leastSquares } from "./linalg";

export interface RegressionCoefficient {
  name: string;
  value: number;
  stdError: number;
  t: number;
  pValue: number;
  /** 95 % confidence interval (kept for backward compatibility). */
  ci95: [number, number];
  /** Confidence interval at `RegressionResult.confidenceLevel`. */
  ci: [number, number];
}

export interface RegressionResult {
  coefficients: RegressionCoefficient[];
  /** Confidence level of `coefficients[].ci` (default 0.95). */
  confidenceLevel: number;
  r2: number;
  adjR2: number;
  fStatistic: number;
  fPValue: number;
  /** Standard error of the regression (√MSE). */
  standardError: number;
  durbinWatson: number;
  /** Observations. */
  n: number;
  /** Number of regressors (excluding the intercept). */
  k: number;
  residuals: number[];
  fitted: number[];
  /** Variance inflation factor per regressor (same order as the columns of X). */
  vif: number[];
  anova: { regressionSS: number; residualSS: number; totalSS: number; dfReg: number; dfRes: number };
  /** Whether the model has an intercept (the design row is [1, ...x] when true). */
  intercept: boolean;
  /** (XᵀX)⁻¹ of the design matrix, used by `predict`. */
  xtxInv: number[][];
}

function checkConfidence(c: number | undefined): number {
  const level = c ?? 0.95;
  if (!Number.isFinite(level) || level < 0.5 || level > 0.999) throw new Error(`confidence level ${level} out of range [0.5, 0.999]`);
  return level;
}

function makeCoef(name: string, b: number, se: number, dfRes: number, t95: number, tq: number): RegressionCoefficient {
  const t = b / se;
  return {
    name,
    value: b,
    stdError: se,
    t,
    pValue: tTwoSidedP(t, dfRes),
    ci95: [b - t95 * se, b + t95 * se],
    ci: [b - tq * se, b + tq * se],
  };
}

function rSquaredOf(y: number[], X: number[][], intercept: boolean): number {
  const design = intercept ? X.map((r) => [1, ...r]) : X;
  const fit = leastSquares(design, y);
  let sse = 0;
  for (const e of fit.residuals) sse += e * e;
  const my = intercept ? y.reduce((a, b) => a + b, 0) / y.length : 0;
  let sst = 0;
  for (const v of y) sst += (v - my) ** 2;
  return sst > 0 ? 1 - sse / sst : 0;
}

/**
 * Multiple linear regression. X: rows = observations, columns = regressors.
 * With `intercept: false` the R², F and total SS are uncentered (as Excel LINEST with const = FALSE).
 */
export function multipleRegression(
  y: number[],
  X: number[][],
  names?: string[],
  opts: { intercept?: boolean; confidence?: number } = {},
): RegressionResult {
  const intercept = opts.intercept ?? true;
  const confidenceLevel = checkConfidence(opts.confidence);
  const n = y.length;
  if (X.length !== n) throw new Error("multipleRegression: X and y must have the same number of rows");
  const k = n ? (X[0]?.length ?? 0) : 0;
  for (const row of X) if (row.length !== k) throw new Error("multipleRegression: ragged X");
  const colNames = Array.from({ length: k }, (_, j) => names?.[j] ?? `X${j + 1}`);
  const design = X.map((r) => (intercept ? [1, ...r] : r.slice()));
  const pCount = k + (intercept ? 1 : 0);
  if (pCount === 0) throw new Error("multipleRegression: no regressors");
  const dfRes = n - pCount;
  if (dfRes <= 0) throw new Error("multipleRegression: not enough observations");
  const fit = leastSquares(design, y);
  let sse = 0;
  for (const e of fit.residuals) sse += e * e;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sst = 0;
  for (const v of y) sst += intercept ? (v - my) ** 2 : v * v;
  const ssr = sst - sse;
  const dfReg = k;
  const mse = sse / dfRes;
  const t95 = studentTQuantile(0.975, dfRes);
  const tq = studentTQuantile((1 + confidenceLevel) / 2, dfRes);
  const coefNames = intercept ? ["Intercept", ...colNames] : colNames;
  const coefficients = fit.beta.map((b, j) => makeCoef(coefNames[j], b, Math.sqrt(mse * fit.xtxInv[j][j]), dfRes, t95, tq));
  const r2 = sst > 0 ? 1 - sse / sst : NaN;
  const adjDen = intercept ? n - 1 : n;
  const adjR2 = 1 - ((1 - r2) * adjDen) / dfRes;
  const fStatistic = dfReg > 0 ? ssr / dfReg / mse : NaN;
  const fPValue = dfReg > 0 ? fUpperP(fStatistic, dfReg, dfRes) : NaN;
  let dwNum = 0;
  for (let i = 1; i < n; i++) dwNum += (fit.residuals[i] - fit.residuals[i - 1]) ** 2;
  const vif = colNames.map((_, j) => {
    if (k < 2) return 1;
    const others = X.map((r) => r.filter((_, c) => c !== j));
    const xj = X.map((r) => r[j]);
    try {
      const r2j = rSquaredOf(xj, others, true);
      return r2j >= 1 ? Infinity : 1 / (1 - r2j);
    } catch {
      return Infinity;
    }
  });
  return {
    coefficients,
    confidenceLevel,
    r2,
    adjR2,
    fStatistic,
    fPValue,
    standardError: Math.sqrt(mse),
    durbinWatson: sse > 0 ? dwNum / sse : NaN,
    n,
    k,
    residuals: fit.residuals,
    fitted: fit.fitted,
    vif,
    anova: { regressionSS: ssr, residualSS: sse, totalSS: sst, dfReg, dfRes },
    intercept,
    xtxInv: fit.xtxInv,
  };
}

/** Intercept-only "model" used when stepwise selects nothing. */
function interceptOnly(y: number[], confidenceLevel: number): RegressionResult {
  const n = y.length;
  const my = y.reduce((a, b) => a + b, 0) / n;
  const residuals = y.map((v) => v - my);
  let sst = 0;
  for (const r of residuals) sst += r * r;
  const dfRes = n - 1;
  const mse = sst / dfRes;
  const se = Math.sqrt(mse / n);
  const t95 = studentTQuantile(0.975, dfRes);
  const tq = studentTQuantile((1 + confidenceLevel) / 2, dfRes);
  let dwNum = 0;
  for (let i = 1; i < n; i++) dwNum += (residuals[i] - residuals[i - 1]) ** 2;
  return {
    coefficients: [makeCoef("Intercept", my, se, dfRes, t95, tq)],
    confidenceLevel,
    r2: 0,
    adjR2: 0,
    fStatistic: NaN,
    fPValue: NaN,
    standardError: Math.sqrt(mse),
    durbinWatson: sst > 0 ? dwNum / sst : NaN,
    n,
    k: 0,
    residuals,
    fitted: y.map(() => my),
    vif: [],
    anova: { regressionSS: 0, residualSS: sst, totalSS: sst, dfReg: 0, dfRes },
    intercept: true,
    xtxInv: [[1 / n]],
  };
}

/**
 * Forward–backward stepwise selection with p-values (intercept always included):
 * add the candidate with the smallest p-value if < pEnter (default 0.05), then drop the
 * worst included variable while its p-value > pRemove (default 0.10); repeat until stable.
 */
export function stepwiseRegression(
  y: number[],
  X: number[][],
  names?: string[],
  opts: { pEnter?: number; pRemove?: number; confidence?: number } = {},
): RegressionResult & { selected: string[] } {
  const confidence = checkConfidence(opts.confidence);
  const pEnter = opts.pEnter ?? 0.05;
  const pRemove = Math.max(opts.pRemove ?? 0.1, pEnter);
  const k = X[0]?.length ?? 0;
  const colNames = Array.from({ length: k }, (_, j) => names?.[j] ?? `X${j + 1}`);
  const sub = (cols: number[]) => X.map((r) => cols.map((c) => r[c]));
  const fitCols = (cols: number[]) => multipleRegression(y, sub(cols), cols.map((c) => colNames[c]), { confidence });
  let selected: number[] = [];
  const seen = new Set<string>();
  for (let iter = 0; iter < 4 * k + 4; iter++) {
    let changed = false;
    // Forward step
    let bestCol = -1;
    let bestP = Infinity;
    for (let c = 0; c < k; c++) {
      if (selected.includes(c)) continue;
      try {
        const r = fitCols([...selected, c]);
        const pv = r.coefficients[r.coefficients.length - 1].pValue;
        if (pv < bestP) {
          bestP = pv;
          bestCol = c;
        }
      } catch {
        /* collinear candidate */
      }
    }
    if (bestCol >= 0 && bestP < pEnter) {
      selected = [...selected, bestCol];
      changed = true;
    }
    // Backward step
    while (selected.length > 0) {
      const r = fitCols(selected);
      let worst = -1;
      let worstP = -Infinity;
      r.coefficients.slice(1).forEach((c, i) => {
        if (c.pValue > worstP) {
          worstP = c.pValue;
          worst = i;
        }
      });
      if (worstP > pRemove) {
        selected = selected.filter((_, i) => i !== worst);
        changed = true;
      } else break;
    }
    const key = [...selected].sort((a, b) => a - b).join(",");
    if (!changed || seen.has(key)) break;
    seen.add(key);
  }
  const result = selected.length ? fitCols(selected) : interceptOnly(y, confidence);
  return { ...result, selected: selected.map((c) => colNames[c]) };
}

/**
 * Point prediction at `xRow` (one value per regressor of the fitted model, in the order of its
 * coefficients without the intercept — for a stepwise result, the selected variables) with a
 * Student-t interval at `confidence` (default 0.95): the confidence interval of the mean
 * response, or, with `prediction: true`, the prediction interval of a new observation.
 */
export function predict(
  result: RegressionResult,
  xRow: number[],
  opts: { confidence?: number; prediction?: boolean } = {},
): { value: number; lower: number; upper: number; stdError: number; level: number } {
  const level = checkConfidence(opts.confidence);
  const row = result.intercept ? [1, ...xRow] : xRow.slice();
  const p = result.coefficients.length;
  if (row.length !== p) throw new Error(`predict: expected ${p - (result.intercept ? 1 : 0)} regressor values, got ${xRow.length}`);
  let value = 0;
  for (let j = 0; j < p; j++) value += row[j] * result.coefficients[j].value;
  let lev = 0;
  for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) lev += row[a] * result.xtxInv[a][b] * row[b];
  const s2 = result.standardError * result.standardError;
  const stdError = Math.sqrt(s2 * ((opts.prediction ? 1 : 0) + lev));
  const tq = studentTQuantile((1 + level) / 2, result.anova.dfRes);
  return { value, lower: value - tq * stdError, upper: value + tq * stdError, stdError, level };
}

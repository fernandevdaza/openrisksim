/**
 * Ordinary least squares with full coefficient statistics (Excel LINEST / Analysis ToolPak
 * "Regression" compatible), VIF, Durbin–Watson, ANOVA, and stepwise selection.
 */
import { studentTQuantile, tTwoSidedP, fUpperP } from "./_stats";
import { leastSquares } from "./linalg";

export interface RegressionResult {
  coefficients: { name: string; value: number; stdError: number; t: number; pValue: number; ci95: [number, number] }[];
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
  opts: { intercept?: boolean } = {},
): RegressionResult {
  const intercept = opts.intercept ?? true;
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
  const tq = studentTQuantile(0.975, dfRes);
  const coefNames = intercept ? ["Intercept", ...colNames] : colNames;
  const coefficients = fit.beta.map((b, j) => {
    const se = Math.sqrt(mse * fit.xtxInv[j][j]);
    const t = b / se;
    return {
      name: coefNames[j],
      value: b,
      stdError: se,
      t,
      pValue: tTwoSidedP(t, dfRes),
      ci95: [b - tq * se, b + tq * se] as [number, number],
    };
  });
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
  };
}

/** Intercept-only "model" used when stepwise selects nothing. */
function interceptOnly(y: number[]): RegressionResult {
  const n = y.length;
  const my = y.reduce((a, b) => a + b, 0) / n;
  const residuals = y.map((v) => v - my);
  let sst = 0;
  for (const r of residuals) sst += r * r;
  const dfRes = n - 1;
  const mse = sst / dfRes;
  const se = Math.sqrt(mse / n);
  const tq = studentTQuantile(0.975, dfRes);
  let dwNum = 0;
  for (let i = 1; i < n; i++) dwNum += (residuals[i] - residuals[i - 1]) ** 2;
  return {
    coefficients: [{ name: "Intercept", value: my, stdError: se, t: my / se, pValue: tTwoSidedP(my / se, dfRes), ci95: [my - tq * se, my + tq * se] }],
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
  opts: { pEnter?: number; pRemove?: number } = {},
): RegressionResult & { selected: string[] } {
  const pEnter = opts.pEnter ?? 0.05;
  const pRemove = Math.max(opts.pRemove ?? 0.1, pEnter);
  const k = X[0]?.length ?? 0;
  const colNames = Array.from({ length: k }, (_, j) => names?.[j] ?? `X${j + 1}`);
  const sub = (cols: number[]) => X.map((r) => cols.map((c) => r[c]));
  const fitCols = (cols: number[]) => multipleRegression(y, sub(cols), cols.map((c) => colNames[c]));
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
  const result = selected.length ? fitCols(selected) : interceptOnly(y);
  return { ...result, selected: selected.map((c) => colNames[c]) };
}

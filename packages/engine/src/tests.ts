/**
 * Hypothesis tests on simulated forecasts.
 */
import { studentTCdf } from "./deps";

function meanVar(v: ArrayLike<number>): { n: number; mean: number; variance: number } {
  let n = 0;
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    if (Number.isNaN(v[i])) continue;
    n++;
    sum += v[i];
  }
  const mean = n > 0 ? sum / n : NaN;
  let ss = 0;
  for (let i = 0; i < v.length; i++) {
    if (Number.isNaN(v[i])) continue;
    ss += (v[i] - mean) ** 2;
  }
  return { n, mean, variance: n > 1 ? ss / (n - 1) : NaN };
}

/**
 * Welch's two-sample t-test (unequal variances), two-sided. NaN values are ignored.
 * df uses the Welch–Satterthwaite approximation. Requires ≥ 2 values per sample (else NaN).
 * Degenerate case of zero variance in both samples: t = ±∞, p = 0 if the means differ; t = 0, p = 1 otherwise.
 */
export function tTestTwoSample(a: ArrayLike<number>, b: ArrayLike<number>): { t: number; df: number; pValue: number } {
  const A = meanVar(a);
  const B = meanVar(b);
  if (A.n < 2 || B.n < 2) return { t: NaN, df: NaN, pValue: NaN };
  const va = A.variance / A.n;
  const vb = B.variance / B.n;
  const se2 = va + vb;
  const diff = A.mean - B.mean;
  if (se2 === 0) {
    const df = A.n + B.n - 2;
    if (diff === 0) return { t: 0, df, pValue: 1 };
    return { t: diff > 0 ? Infinity : -Infinity, df, pValue: 0 };
  }
  const t = diff / Math.sqrt(se2);
  const df = (se2 * se2) / ((va * va) / (A.n - 1) + (vb * vb) / (B.n - 1));
  const pValue = Math.min(1, 2 * studentTCdf(-Math.abs(t), df));
  return { t, df, pValue };
}

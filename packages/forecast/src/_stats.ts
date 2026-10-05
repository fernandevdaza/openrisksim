/**
 * Local statistical special functions (kept here so that forecast does not depend on the
 * implementation status of @openrisksim/distributions). Accuracy ≈ 1e-12 or better in the
 * ranges used for p-values.
 */

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function lnGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lnGamma(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularised lower incomplete gamma P(a, x). */
export function regIncGammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (!Number.isFinite(x)) return 1;
  const gln = lnGamma(a);
  if (x < a + 1) {
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 0; n < 1000; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-16) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - gln);
  }
  // Continued fraction for Q(a,x) (modified Lentz).
  const FPMIN = 1e-300;
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - gln) * h;
}

function betacf(a: number, b: number, x: number): number {
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 1000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return h;
}

/** Regularised incomplete beta I_x(a, b). */
export function regIncBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

export function normalCdf(x: number): number {
  if (Number.isNaN(x)) return NaN;
  const p = 0.5 * regIncGammaP(0.5, (x * x) / 2);
  return x >= 0 ? 0.5 + p : 0.5 - p;
}

/** Standard normal quantile (Acklam's rational approximation + one Halley refinement step). */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  let x: number;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const e = normalCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

export function studentTCdf(t: number, df: number): number {
  if (Number.isNaN(t)) return NaN;
  if (!Number.isFinite(df)) return normalCdf(t);
  const x = df / (df + t * t);
  const tail = 0.5 * regIncBeta(x, df / 2, 0.5);
  return t > 0 ? 1 - tail : tail;
}

/** Student t quantile by bracketing + bisection/secant refinement on the CDF. */
export function studentTQuantile(p: number, df: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (!Number.isFinite(df)) return normalQuantile(p);
  if (p === 0.5) return 0;
  if (p < 0.5) return -studentTQuantile(1 - p, df);
  let lo = 0;
  let hi = Math.max(1, normalQuantile(p));
  while (studentTCdf(hi, df) < p) {
    lo = hi;
    hi *= 2;
    if (hi > 1e12) return hi;
  }
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (studentTCdf(mid, df) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-13 * Math.max(1, hi)) break;
  }
  return 0.5 * (lo + hi);
}

export function chiSquareCdf(x: number, df: number): number {
  if (x <= 0) return 0;
  return regIncGammaP(df / 2, x / 2);
}

export function fCdf(x: number, d1: number, d2: number): number {
  if (x <= 0) return 0;
  return regIncBeta((d1 * x) / (d1 * x + d2), d1 / 2, d2 / 2);
}

/** Two-sided p-value of a t statistic. */
export function tTwoSidedP(t: number, df: number): number {
  if (!Number.isFinite(t)) return Number.isNaN(t) ? NaN : 0;
  const x = df / (df + t * t);
  return regIncBeta(x, df / 2, 0.5);
}

/** Upper tail of the F distribution (computed directly for accuracy at tiny p-values). */
export function fUpperP(f: number, d1: number, d2: number): number {
  if (!(f > 0)) return Number.isNaN(f) ? NaN : 1;
  if (!Number.isFinite(f)) return 0;
  return regIncBeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2);
}

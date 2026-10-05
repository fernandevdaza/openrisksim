/**
 * Special functions needed by the distribution families, fitting and other packages.
 *
 * Sources / algorithms:
 *  - erf / erfc: rational approximations from Sun's fdlibm (s_erf.c), ≲1 ulp.
 *  - lnGamma: Lanczos (g = 7, n = 9) for small x, Stirling series for x ≥ 10.
 *  - regIncBeta: continued fraction with modified Lentz (Numerical Recipes, `betacf`).
 *  - regIncGammaP/Q: series + continued fraction (Numerical Recipes, `gser`/`gcf`).
 *  - normalQuantile: Wichura (1988) AS241 PPND16, ~1e-16 relative accuracy.
 *  - Inverses of the incomplete beta / gamma: Numerical Recipes initial guesses refined by a
 *    bracketed Halley iteration (falls back to bisection, so it always terminates).
 */

const LN_SQRT_2PI = 0.91893853320467274178; // ln(sqrt(2π))
const SQRT_2PI = 2.5066282746310002;
const SQRT1_2 = Math.SQRT1_2;
const EPS = 2.220446049250313e-16;
const FPMIN = 1e-300;

/* ------------------------------------------------------------------------------------------ */
/* erf / erfc (fdlibm)                                                                         */
/* ------------------------------------------------------------------------------------------ */

const erx = 8.45062911510467529297e-1;
const efx = 1.28379167095512586316e-1;
const pp0 = 1.28379167095512558561e-1;
const pp1 = -3.25042107247001499370e-1;
const pp2 = -2.84817495755985104766e-2;
const pp3 = -5.77027029648944159157e-3;
const pp4 = -2.37630166566501626084e-5;
const qq1 = 3.97917223959155352819e-1;
const qq2 = 6.50222499887672944485e-2;
const qq3 = 5.08130628187576562776e-3;
const qq4 = 1.32494738004321644526e-4;
const qq5 = -3.96022827877536812320e-6;
const pa0 = -2.36211856075265944077e-3;
const pa1 = 4.14856118683748331666e-1;
const pa2 = -3.72207876035701323847e-1;
const pa3 = 3.18346619901161753674e-1;
const pa4 = -1.10894694282396677476e-1;
const pa5 = 3.54783043256182359371e-2;
const pa6 = -2.16637559486879084300e-3;
const qa1 = 1.06420880400844228286e-1;
const qa2 = 5.40397917702171048937e-1;
const qa3 = 7.18286544141962662868e-2;
const qa4 = 1.26171219808761642112e-1;
const qa5 = 1.36370839120290507362e-2;
const qa6 = 1.19844998467991074170e-2;
const ra0 = -9.86494403484714822705e-3;
const ra1 = -6.93858572707181764372e-1;
const ra2 = -1.05586262253232909814e1;
const ra3 = -6.23753324503260060396e1;
const ra4 = -1.62396669462573470355e2;
const ra5 = -1.84605092906711035994e2;
const ra6 = -8.12874355063065934246e1;
const ra7 = -9.81432934416914548592;
const sa1 = 1.96512716674392571292e1;
const sa2 = 1.37657754143519042600e2;
const sa3 = 4.34565877475229228821e2;
const sa4 = 6.45387271733267880336e2;
const sa5 = 4.29008140027567833386e2;
const sa6 = 1.08635005541779435134e2;
const sa7 = 6.57024977031928170135;
const sa8 = -6.04244152148580987438e-2;
const rb0 = -9.86494292470009928597e-3;
const rb1 = -7.99283237680523006574e-1;
const rb2 = -1.77579549177547519889e1;
const rb3 = -1.60636384855821916062e2;
const rb4 = -6.37566443368389627722e2;
const rb5 = -1.02509513161107724954e3;
const rb6 = -4.83519191608651397019e2;
const sb1 = 3.03380607434824582924e1;
const sb2 = 3.25792512996573918826e2;
const sb3 = 1.53672958608443695994e3;
const sb4 = 3.19985821950859553908e3;
const sb5 = 2.55305040643316442583e3;
const sb6 = 4.74528541206955367215e2;
const sb7 = -2.24409524465858183362e1;

/** exp(-x²) * (R/S correction) for |x| in [1.25, 28): returns erfc(|x|) * |x| (before division). */
function erfcTail(ax: number): number {
  const s = 1 / (ax * ax);
  let R: number;
  let S: number;
  if (ax < 1 / 0.35) {
    R = ra0 + s * (ra1 + s * (ra2 + s * (ra3 + s * (ra4 + s * (ra5 + s * (ra6 + s * ra7))))));
    S = 1 + s * (sa1 + s * (sa2 + s * (sa3 + s * (sa4 + s * (sa5 + s * (sa6 + s * (sa7 + s * sa8)))))));
  } else {
    R = rb0 + s * (rb1 + s * (rb2 + s * (rb3 + s * (rb4 + s * (rb5 + s * rb6)))));
    S = 1 + s * (sb1 + s * (sb2 + s * (sb3 + s * (sb4 + s * (sb5 + s * (sb6 + s * sb7))))));
  }
  // z = ax with its low mantissa bits dropped so that z*z is exact.
  const z = Math.fround(ax);
  return Math.exp(-z * z - 0.5625) * Math.exp((z - ax) * (z + ax) + R / S);
}

/** Error function. */
export function erf(x: number): number {
  if (Number.isNaN(x)) return NaN;
  const ax = Math.abs(x);
  if (ax < 0.84375) {
    if (ax < 3.7252902984e-9) return x + efx * x;
    const z = x * x;
    const r = pp0 + z * (pp1 + z * (pp2 + z * (pp3 + z * pp4)));
    const s = 1 + z * (qq1 + z * (qq2 + z * (qq3 + z * (qq4 + z * qq5))));
    return x + x * (r / s);
  }
  if (ax < 1.25) {
    const s = ax - 1;
    const P = pa0 + s * (pa1 + s * (pa2 + s * (pa3 + s * (pa4 + s * (pa5 + s * pa6)))));
    const Q = 1 + s * (qa1 + s * (qa2 + s * (qa3 + s * (qa4 + s * (qa5 + s * qa6)))));
    return x >= 0 ? erx + P / Q : -erx - P / Q;
  }
  if (ax >= 6) return x >= 0 ? 1 : -1;
  const r = erfcTail(ax) / ax;
  return x >= 0 ? 1 - r : r - 1;
}

/** Complementary error function 1 − erf(x), accurate in the tails. */
export function erfc(x: number): number {
  if (Number.isNaN(x)) return NaN;
  const ax = Math.abs(x);
  if (ax < 0.84375) {
    if (ax < 1.3877787807814457e-17) return 1 - x;
    const z = x * x;
    const r = pp0 + z * (pp1 + z * (pp2 + z * (pp3 + z * pp4)));
    const s = 1 + z * (qq1 + z * (qq2 + z * (qq3 + z * (qq4 + z * qq5))));
    const y = r / s;
    if (x < 0.25) return 1 - (x + x * y);
    return 0.5 - (x * y + (x - 0.5));
  }
  if (ax < 1.25) {
    const s = ax - 1;
    const P = pa0 + s * (pa1 + s * (pa2 + s * (pa3 + s * (pa4 + s * (pa5 + s * pa6)))));
    const Q = 1 + s * (qa1 + s * (qa2 + s * (qa3 + s * (qa4 + s * (qa5 + s * qa6)))));
    return x >= 0 ? 1 - erx - P / Q : 1 + erx + P / Q;
  }
  if (ax < 28) {
    if (x < -6) return 2;
    const r = erfcTail(ax) / ax;
    return x > 0 ? r : 2 - r;
  }
  return x > 0 ? 0 : 2;
}

/* ------------------------------------------------------------------------------------------ */
/* Gamma family                                                                               */
/* ------------------------------------------------------------------------------------------ */

const LANCZOS_G = 7;
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

function lanczosSum(x: number): number {
  // x is the argument minus one (Γ(x+1) form)
  let a = LANCZOS[0];
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return a;
}

/** Stirling correction S(x) = lnΓ(x) − [(x − ½)ln x − x + ln√(2π)], for x ≥ 10. */
function stirlingSeries(x: number): number {
  const x2 = 1 / (x * x);
  return (
    (1 / 12 - x2 * (1 / 360 - x2 * (1 / 1260 - x2 * (1 / 1680 - x2 * (1 / 1188 - x2 * (691 / 360360)))))) / x
  );
}

/** ln|Γ(x)|. */
export function lnGamma(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x === Infinity) return Infinity;
  if (x <= 0 && Number.isInteger(x)) return Infinity;
  if (x < 0.5) {
    // Reflection: Γ(x)Γ(1−x) = π / sin(πx)
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lnGamma(1 - x);
  }
  if (x >= 10) return (x - 0.5) * Math.log(x) - x + LN_SQRT_2PI + stirlingSeries(x);
  if (x === 1 || x === 2) return 0;
  const xm1 = x - 1;
  const t = xm1 + LANCZOS_G + 0.5;
  return LN_SQRT_2PI + (xm1 + 0.5) * Math.log(t) - t + Math.log(lanczosSum(xm1));
}

/** Γ(x). Exact for small positive integers. */
export function gamma(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (Number.isInteger(x)) {
    if (x <= 0) return NaN;
    if (x <= 171) {
      let r = 1;
      for (let i = 2; i < x; i++) r *= i;
      return r;
    }
    return Infinity;
  }
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  if (x > 171.62) return Infinity;
  if (x < 10) {
    const xm1 = x - 1;
    const t = xm1 + LANCZOS_G + 0.5;
    return SQRT_2PI * Math.pow(t, xm1 + 0.5) * Math.exp(-t) * lanczosSum(xm1);
  }
  // Stirling with the power split in two halves to avoid overflow (x exact → few ulp error)
  const v = Math.pow(x, 0.5 * x - 0.25);
  return SQRT_2PI * v * (v * Math.exp(-x)) * Math.exp(stirlingSeries(x));
}

/** ln B(a, b) = lnΓ(a) + lnΓ(b) − lnΓ(a+b). */
export function lnBeta(a: number, b: number): number {
  return lnGamma(a) + lnGamma(b) - lnGamma(a + b);
}

/** Digamma ψ(x) = d/dx lnΓ(x). */
export function digamma(x: number): number {
  if (Number.isNaN(x)) return NaN;
  let result = 0;
  if (x <= 0) {
    if (Number.isInteger(x)) return NaN;
    // reflection ψ(1−x) − ψ(x) = π cot(πx)
    return digamma(1 - x) - Math.PI / Math.tan(Math.PI * x);
  }
  while (x < 10) {
    result -= 1 / x;
    x += 1;
  }
  const f = 1 / (x * x);
  const t =
    f * (-1 / 12 + f * (1 / 120 + f * (-1 / 252 + f * (1 / 240 + f * (-1 / 132 + f * (691 / 32760 - f / 12))))));
  return result + Math.log(x) - 0.5 / x + t;
}

/** Trigamma ψ'(x). */
export function trigamma(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x <= 0 && Number.isInteger(x)) return NaN;
  if (x <= 0) {
    const s = Math.PI / Math.sin(Math.PI * x);
    return -trigamma(1 - x) + s * s;
  }
  let result = 0;
  while (x < 10) {
    result += 1 / (x * x);
    x += 1;
  }
  const f = 1 / (x * x);
  const t =
    1 / x +
    f / 2 +
    (f / x) * (1 / 6 + f * (-1 / 30 + f * (1 / 42 + f * (-1 / 30 + f * (5 / 66 + f * (-691 / 2730 + f * (7 / 6)))))));
  return result + t;
}

/* ------------------------------------------------------------------------------------------ */
/* Incomplete gamma                                                                           */
/* ------------------------------------------------------------------------------------------ */

function maxIterFor(a: number): number {
  return 200 + Math.ceil(20 * Math.sqrt(Math.max(a, 1)));
}

/** log of the prefactor x^a e^{-x} / Γ(a), without cancellation for large a. */
function lnGammaPrefactor(a: number, x: number): number {
  if (a < 10) return a * Math.log(x) - x - lnGamma(a);
  const d = (x - a) / a;
  return a * (Math.log1p(d) - d) + 0.5 * Math.log(a) - LN_SQRT_2PI - stirlingSeries(a);
}

/** Series for P(a,x), valid for x < a+1. */
function gser(a: number, x: number): number {
  let ap = a;
  let sum = 1 / a;
  let del = sum;
  const maxIt = maxIterFor(a);
  for (let n = 0; n < maxIt; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * EPS) break;
  }
  return sum * Math.exp(lnGammaPrefactor(a, x));
}

/** Continued fraction for Q(a,x), valid for x ≥ a+1. */
function gcf(a: number, x: number): number {
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  const maxIt = maxIterFor(a);
  for (let i = 1; i <= maxIt; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return Math.exp(lnGammaPrefactor(a, x)) * h;
}

/** Regularized lower incomplete gamma P(a, x) = γ(a,x)/Γ(a). */
export function regIncGammaP(a: number, x: number): number {
  if (Number.isNaN(a) || Number.isNaN(x) || a <= 0) return NaN;
  if (x <= 0) return 0;
  if (x === Infinity) return 1;
  if (x < a + 1) return gser(a, x);
  return 1 - gcf(a, x);
}

/** Regularized upper incomplete gamma Q(a, x) = 1 − P(a, x), accurate in the upper tail. */
export function regIncGammaQ(a: number, x: number): number {
  if (Number.isNaN(a) || Number.isNaN(x) || a <= 0) return NaN;
  if (x <= 0) return 1;
  if (x === Infinity) return 0;
  if (x < a + 1) return 1 - gser(a, x);
  return gcf(a, x);
}

/**
 * Inverse of P(a, ·): the x ≥ 0 with P(a, x) = p.
 * For p > 0.5 the equation Q(a, x) = 1 − p is solved instead, for upper-tail accuracy.
 */
export function invRegIncGammaP(p: number, a: number): number {
  if (Number.isNaN(p) || !(a > 0) || p < 0 || p > 1) return NaN;
  if (p === 0) return 0;
  if (p === 1) return Infinity;
  const q = 1 - p;
  const upper = p > 0.5;
  const a1 = a - 1;
  // Initial guess (Numerical Recipes 3rd ed., invgammp)
  let x: number;
  if (a > 1) {
    const pp = p < 0.5 ? p : q;
    const t = Math.sqrt(-2 * Math.log(pp));
    let z = (2.30753 + t * 0.27061) / (1 + t * (0.99229 + t * 0.04481)) - t;
    if (p < 0.5) z = -z;
    x = Math.max(1e-3, a * Math.pow(1 - 1 / (9 * a) - z / (3 * Math.sqrt(a)), 3));
  } else {
    const t = 1 - a * (0.253 + a * 0.12);
    if (p < t) x = Math.pow(p / t, 1 / a);
    else x = 1 - Math.log(1 - (p - t) / (1 - t));
  }
  if (!(x > 0) || !Number.isFinite(x)) x = a;
  let lo = 0;
  let hi = Infinity;
  for (let it = 0; it < 300; it++) {
    const f = upper ? q - regIncGammaQ(a, x) : regIncGammaP(a, x) - p;
    if (f === 0) return x;
    if (f < 0) lo = x;
    else hi = x;
    const dens = Math.exp(lnGammaPrefactor(a, x)) / x;
    let xn: number;
    if (dens > 0 && Number.isFinite(dens)) {
      const u = f / dens;
      const step = u / (1 - 0.5 * Math.min(1, u * (a1 / x - 1)));
      xn = x - step;
      if (Math.abs(step) <= 4 * EPS * x) return xn;
    } else {
      xn = NaN;
    }
    if (!(xn > lo && xn < hi)) {
      if (hi === Infinity) xn = Math.max(2 * x, lo * 2, 1);
      else if (lo > 0 && hi / lo > 16) xn = Math.sqrt(lo * hi);
      else if (lo === 0) xn = hi / 16;
      else xn = 0.5 * (lo + hi);
    }
    if (Math.abs(xn - x) <= 4 * EPS * xn || (hi < Infinity && hi - lo <= 4 * EPS * hi)) return xn;
    x = xn;
  }
  return x;
}

/* ------------------------------------------------------------------------------------------ */
/* Incomplete beta                                                                            */
/* ------------------------------------------------------------------------------------------ */

/** Continued fraction for the incomplete beta (modified Lentz). */
function betacf(a: number, b: number, x: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  const maxIt = 300 + Math.ceil(10 * Math.sqrt(Math.max(a, b, 1)));
  for (let m = 1; m <= maxIt; m++) {
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
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** a·ln(x) with x = 1 − y supplied separately (accurate when x ≈ 1). */
function aLog(a: number, x: number, y: number): number {
  return y < 0.5 ? a * Math.log1p(-y) : a * Math.log(x);
}

/**
 * ln[ x^a y^b / B(a, b) ] (y = 1 − x), avoiding the cancellation of lnΓ terms when a and/or b
 * are large (Stirling-based rearrangement in the spirit of Boost's ibeta_power_terms).
 */
function lnBetaPrefactor(x: number, y: number, a: number, b: number): number {
  const c = a + b;
  if (a >= 10 && b >= 10) {
    const e = x * b - y * a; // x·c − a
    const u = e / a;
    const v = -e / b;
    return (
      a * (Math.log1p(u) - u) +
      b * (Math.log1p(v) - v) +
      0.5 * Math.log((a / c) * b) -
      LN_SQRT_2PI +
      stirlingSeries(c) -
      stirlingSeries(a) -
      stirlingSeries(b)
    );
  }
  if (a >= 10 || b >= 10) {
    const big = a >= 10;
    const L = big ? a : b;
    const s = big ? b : a;
    const xL = big ? x : y;
    const xS = big ? y : x;
    return (
      (L - 0.5) * Math.log1p(s / L) +
      s * Math.log(c) -
      s +
      stirlingSeries(c) -
      stirlingSeries(L) -
      lnGamma(s) +
      aLog(L, xL, xS) +
      s * Math.log(xS)
    );
  }
  return lnGamma(c) - lnGamma(a) - lnGamma(b) + aLog(a, x, y) + aLog(b, y, x);
}

/**
 * Both tails of the regularized incomplete beta at x (with y = 1 − x supplied separately for
 * accuracy). Returns [I_x(a,b), 1 − I_x(a,b)]; the smaller one is computed directly.
 * Writes into `out` to avoid allocations.
 */
export function regIncBetaBoth(x: number, y: number, a: number, b: number, out: number[]): void {
  if (x <= 0) {
    out[0] = 0;
    out[1] = 1;
    return;
  }
  if (y <= 0) {
    out[0] = 1;
    out[1] = 0;
    return;
  }
  const front = Math.exp(lnBetaPrefactor(x, y, a, b));
  if (x < (a + 1) / (a + b + 2)) {
    const lower = (front * betacf(a, b, x)) / a;
    out[0] = lower;
    out[1] = 1 - lower;
  } else {
    const upper = (front * betacf(b, a, y)) / b;
    out[0] = 1 - upper;
    out[1] = upper;
  }
}

const betaScratch = [0, 0];

/** Regularized incomplete beta I_x(a, b). */
export function regIncBeta(x: number, a: number, b: number): number {
  if (Number.isNaN(x) || !(a > 0) || !(b > 0)) return NaN;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  regIncBetaBoth(x, 1 - x, a, b, betaScratch);
  return betaScratch[0];
}

/** Upper tail 1 − I_x(a, b), computed without cancellation. */
export function regIncBetaComplement(x: number, a: number, b: number): number {
  if (Number.isNaN(x) || !(a > 0) || !(b > 0)) return NaN;
  if (x <= 0) return 1;
  if (x >= 1) return 0;
  regIncBetaBoth(x, 1 - x, a, b, betaScratch);
  return betaScratch[1];
}

/**
 * Inverse of the regularized incomplete beta: x in [0,1] with I_x(a,b) = p.
 * Halley iteration (bracketed, with bisection fallback) from the NR3 `invbetai` initial guess.
 */
export function invRegIncBeta(p: number, a: number, b: number): number {
  if (Number.isNaN(p) || !(a > 0) || !(b > 0) || p < 0 || p > 1) return NaN;
  if (p === 0) return 0;
  if (p === 1) return 1;
  const q = 1 - p;
  const upper = p > 0.5;
  const a1 = a - 1;
  const b1 = b - 1;
  let x: number;
  if (a >= 1 && b >= 1) {
    const pp = p < 0.5 ? p : q;
    const t = Math.sqrt(-2 * Math.log(pp));
    let z = (2.30753 + t * 0.27061) / (1 + t * (0.99229 + t * 0.04481)) - t;
    if (p < 0.5) z = -z;
    const al = (z * z - 3) / 6;
    const h = 2 / (1 / (2 * a - 1) + 1 / (2 * b - 1));
    const w = (z * Math.sqrt(al + h)) / h - (1 / (2 * b - 1) - 1 / (2 * a - 1)) * (al + 5 / 6 - 2 / (3 * h));
    x = a / (a + b * Math.exp(2 * w));
  } else {
    const lna = Math.log(a / (a + b));
    const lnb = Math.log(b / (a + b));
    const t = Math.exp(a * lna) / a;
    const u = Math.exp(b * lnb) / b;
    const w = t + u;
    if (p < t / w) x = Math.pow(a * w * p, 1 / a);
    else x = 1 - Math.pow(b * w * q, 1 / b);
  }
  if (!(x > 0 && x < 1)) x = a / (a + b);
  const afac = -lnBeta(a, b);
  let lo = 0;
  let hi = 1;
  const r = betaScratch;
  for (let it = 0; it < 300; it++) {
    regIncBetaBoth(x, 1 - x, a, b, r);
    const f = upper ? q - r[1] : r[0] - p;
    if (f === 0) return x;
    if (f < 0) lo = x;
    else hi = x;
    const dens = Math.exp(a1 * Math.log(x) + b1 * Math.log1p(-x) + afac);
    let xn: number;
    if (dens > 0 && Number.isFinite(dens)) {
      const u = f / dens;
      const step = u / (1 - 0.5 * Math.min(1, u * (a1 / x - b1 / (1 - x))));
      xn = x - step;
      if (Math.abs(step) <= 4 * EPS * x) return xn;
    } else {
      xn = NaN;
    }
    if (!(xn > lo && xn < hi)) {
      if (lo > 0 && hi / lo > 16) xn = Math.sqrt(lo * hi);
      else if (lo === 0) xn = hi / 16;
      else if (hi === 1 && 1 - lo < 1e-3) xn = 1 - 0.5 * (1 - lo); // approach 1 geometrically
      else xn = 0.5 * (lo + hi);
      if (!(xn > lo && xn < hi)) return x;
    }
    if (Math.abs(xn - x) <= 4 * EPS * xn || hi - lo <= 4 * EPS * hi) return xn;
    x = xn;
  }
  return x;
}

/* ------------------------------------------------------------------------------------------ */
/* Normal                                                                                     */
/* ------------------------------------------------------------------------------------------ */

/** Standard normal CDF Φ(x). */
export function normalCdf(x: number): number {
  return 0.5 * erfc(-x * SQRT1_2);
}

/** Standard normal density φ(x). */
export function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x - LN_SQRT_2PI);
}

/** Standard normal quantile Φ⁻¹(p) — Wichura (1988), algorithm AS241 (PPND16). */
export function normalQuantile(p: number): number {
  if (Number.isNaN(p) || p < 0 || p > 1) return NaN;
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  const q = p - 0.5;
  if (Math.abs(q) <= 0.425) {
    const r = 0.180625 - q * q;
    return (
      (q *
        (((((((2.5090809287301226727e3 * r + 3.3430575583588128105e4) * r + 6.7265770927008700853e4) * r +
          4.5921953931549871457e4) *
          r +
          1.3731693765509461125e4) *
          r +
          1.9715909503065514427e3) *
          r +
          1.3314166789178437745e2) *
          r +
          3.387132872796366608)) /
      (((((((5.226495278852854561e3 * r + 2.8729085735721942674e4) * r + 3.930789580009271061e4) * r +
        2.1213794301586595867e4) *
        r +
        5.3941960214247511077e3) *
        r +
        6.871870074920579083e2) *
        r +
        4.2313330701600911252e1) *
        r +
        1)
    );
  }
  let r = q < 0 ? p : 1 - p;
  r = Math.sqrt(-Math.log(r));
  let val: number;
  if (r <= 5) {
    r -= 1.6;
    val =
      (((((((7.7454501427834140764e-4 * r + 2.27238449892691845833e-2) * r + 2.4178072517745061177e-1) * r +
        1.27045825245236838258) *
        r +
        3.64784832476320460504) *
        r +
        5.7694972214606914055) *
        r +
        4.6303378461565452959) *
        r +
        1.42343711074968357734) /
      (((((((1.05075007164441684324e-9 * r + 5.475938084995344946e-4) * r + 1.51986665636164571966e-2) * r +
        1.4810397642748007459e-1) *
        r +
        6.8976733498510000455e-1) *
        r +
        1.6763848301838038494) *
        r +
        2.05319162663775882187) *
        r +
        1);
  } else {
    r -= 5;
    val =
      (((((((2.01033439929228813265e-7 * r + 2.71155556874348757815e-5) * r + 1.2426609473880784386e-3) * r +
        2.6532189526576123093e-2) *
        r +
        2.9656057182850489123e-1) *
        r +
        1.7848265399172913358) *
        r +
        5.4637849111641143699) *
        r +
        6.6579046435011037772) /
      (((((((2.04426310338993978564e-15 * r + 1.4215117583164458887e-7) * r + 1.8463183175100546818e-5) * r +
        7.868691311456132591e-4) *
        r +
        1.4875361290850614852e-2) *
        r +
        1.3692988092273580531e-1) *
        r +
        5.9983220655588793769e-1) *
        r +
        1);
  }
  return q < 0 ? -val : val;
}

/* ------------------------------------------------------------------------------------------ */
/* Student t, chi-square, F                                                                   */
/* ------------------------------------------------------------------------------------------ */

/** CDF of Student's t with `df` degrees of freedom (df may be non-integer). */
export function studentTCdf(t: number, df: number): number {
  if (Number.isNaN(t) || !(df > 0)) return NaN;
  if (t === Infinity) return 1;
  if (t === -Infinity) return 0;
  if (df > 1e10) return normalCdf(t);
  const t2 = t * t;
  // tail = P(T < −|t|) = ½·I_{df/(df+t²)}(df/2, ½); both arguments passed exactly so that
  // the incomplete beta returns whichever tail is small without cancellation.
  regIncBetaBoth(df / (df + t2), t2 / (df + t2), df / 2, 0.5, betaScratch);
  const tail = 0.5 * betaScratch[0];
  return t > 0 ? 1 - tail : tail;
}

/** Upper tail P(T > t) without cancellation. */
export function studentTSf(t: number, df: number): number {
  return studentTCdf(-t, df);
}

/** Quantile of Student's t. */
export function studentTQuantile(p: number, df: number): number {
  if (Number.isNaN(p) || !(df > 0) || p < 0 || p > 1) return NaN;
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  if (p === 0.5) return 0;
  if (df > 1e10) return normalQuantile(p);
  if (p > 0.5) return -studentTQuantile(1 - p, df);
  // now p < 0.5, t < 0
  if (df === 1) return -1 / Math.tan(Math.PI * p);
  if (df === 2) {
    return (2 * p - 1) / Math.sqrt(2 * p * (1 - p));
  }
  const pp = 2 * p; // two-sided tail probability, < 1
  if (pp < 0.5) {
    // tail: I_x(df/2, 1/2) = pp, x = df/(df+t²)
    const x = invRegIncBeta(pp, df / 2, 0.5);
    return -Math.sqrt((df * (1 - x)) / x);
  }
  // central: I_y(1/2, df/2) = 1 − pp, y = t²/(df+t²)
  const y = invRegIncBeta(1 - pp, 0.5, df / 2);
  return -Math.sqrt((df * y) / (1 - y));
}

/** CDF of the chi-square distribution. */
export function chiSquareCdf(x: number, df: number): number {
  if (Number.isNaN(x) || !(df > 0)) return NaN;
  if (x <= 0) return 0;
  return regIncGammaP(df / 2, x / 2);
}

/** Upper tail of the chi-square distribution (p-values). */
export function chiSquareSf(x: number, df: number): number {
  if (Number.isNaN(x) || !(df > 0)) return NaN;
  if (x <= 0) return 1;
  return regIncGammaQ(df / 2, x / 2);
}

/** Quantile of the chi-square distribution. */
export function chiSquareQuantile(p: number, df: number): number {
  return 2 * invRegIncGammaP(p, df / 2);
}

/** CDF of the F distribution. */
export function fCdf(x: number, d1: number, d2: number): number {
  if (Number.isNaN(x) || !(d1 > 0) || !(d2 > 0)) return NaN;
  if (x <= 0) return 0;
  if (x === Infinity) return 1;
  const dx = d1 * x;
  regIncBetaBoth(dx / (dx + d2), d2 / (dx + d2), d1 / 2, d2 / 2, betaScratch);
  return betaScratch[0];
}

/** Upper tail of the F distribution (p-values). */
export function fSf(x: number, d1: number, d2: number): number {
  if (Number.isNaN(x) || !(d1 > 0) || !(d2 > 0)) return NaN;
  if (x <= 0) return 1;
  if (x === Infinity) return 0;
  const dx = d1 * x;
  regIncBetaBoth(dx / (dx + d2), d2 / (dx + d2), d1 / 2, d2 / 2, betaScratch);
  return betaScratch[1];
}

/** Quantile of the F distribution. */
export function fQuantile(p: number, d1: number, d2: number): number {
  if (Number.isNaN(p) || !(d1 > 0) || !(d2 > 0) || p < 0 || p > 1) return NaN;
  if (p === 0) return 0;
  if (p === 1) return Infinity;
  if (p <= 0.5) {
    const x = invRegIncBeta(p, d1 / 2, d2 / 2);
    return (d2 * x) / (d1 * (1 - x));
  }
  // y = 1 − x solves I_y(d2/2, d1/2) = 1 − p, precise when x ≈ 1
  const y = invRegIncBeta(1 - p, d2 / 2, d1 / 2);
  return (d2 * (1 - y)) / (d1 * y);
}

/* ------------------------------------------------------------------------------------------ */
/* Misc helpers                                                                               */
/* ------------------------------------------------------------------------------------------ */

/** ln(n!) */
export function lnFactorial(n: number): number {
  if (n < 0) return NaN;
  if (n < 2) return 0;
  return lnGamma(n + 1);
}

/** ln C(n, k) */
export function lnChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  if (k === 0 || k === n) return 0;
  return lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1);
}

/** Euler–Mascheroni constant. */
export const EULER_GAMMA = 0.5772156649015329;

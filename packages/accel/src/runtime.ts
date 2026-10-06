/**
 * f64 run-time library used by the generated JS code, the IR interpreter and constant folding.
 * Semantics mirror HyperFormula (the spreadsheet engine of OpenRiskSim): errors are NaN, any
 * ±Infinity result is an error (#NUM!), "+"/"-" snap to 0 like HyperFormula's smart rounding and
 * comparisons use its 1e-13 relative epsilon.
 */
import type { FoldOp, OpName, VecFn } from "./ir";

const EPS = 1e-13;
const CMP_MOD = 1 + EPS;

/** Finite → itself; NaN/±Infinity → NaN (error). */
export function fin(x: number): number {
  return x - x === 0 ? x : NaN;
}

function add(a: number, b: number): number {
  const r = a + b;
  return Math.abs(r) < EPS * Math.abs(a) ? 0 : r - r === 0 ? r : NaN;
}

function sub(a: number, b: number): number {
  const r = a - b;
  return Math.abs(r) < EPS * Math.abs(a) ? 0 : r - r === 0 ? r : NaN;
}

function fadd(a: number, b: number): number {
  return fin(a + b);
}

function mul(a: number, b: number): number {
  return fin(a * b);
}

function div(a: number, b: number): number {
  return b === 0 ? NaN : fin(a / b);
}

function pow(a: number, b: number): number {
  // Math.pow(NaN, 0) === 1: errors must propagate.
  return a !== a || b !== b ? NaN : fin(Math.pow(a, b));
}

/** HyperFormula floatCmp: -1 / 0 / 1. */
function fcmp(l: number, r: number): number {
  if (r >= 0 && l * CMP_MOD >= r && l <= r * CMP_MOD) return 0;
  if (r <= 0 && l * CMP_MOD <= r && l >= r * CMP_MOD) return 0;
  return l > r ? 1 : -1;
}

function eq(a: number, b: number): number {
  return a !== a || b !== b ? NaN : fcmp(a, b) === 0 ? 1 : 0;
}
function ne(a: number, b: number): number {
  return a !== a || b !== b ? NaN : fcmp(a, b) !== 0 ? 1 : 0;
}
function lt(a: number, b: number): number {
  return a !== a || b !== b ? NaN : fcmp(a, b) < 0 ? 1 : 0;
}
function gt(a: number, b: number): number {
  return a !== a || b !== b ? NaN : fcmp(a, b) > 0 ? 1 : 0;
}
function le(a: number, b: number): number {
  return a !== a || b !== b ? NaN : fcmp(a, b) <= 0 ? 1 : 0;
}
function ge(a: number, b: number): number {
  return a !== a || b !== b ? NaN : fcmp(a, b) >= 0 ? 1 : 0;
}

function isnum(a: number): number {
  return a === a ? 1 : 0;
}

function not(a: number): number {
  return a !== a ? NaN : a === 0 ? 1 : 0;
}

function and(a: number, b: number): number {
  return a !== a || b !== b ? NaN : a !== 0 && b !== 0 ? 1 : 0;
}

function or(a: number, b: number): number {
  return a !== a || b !== b ? NaN : a !== 0 || b !== 0 ? 1 : 0;
}

function min(a: number, b: number): number {
  return Math.min(a, b);
}
function max(a: number, b: number): number {
  return Math.max(a, b);
}

function abs(a: number): number {
  return Math.abs(a);
}
function sqrt(a: number): number {
  return fin(Math.sqrt(a));
}
function exp(a: number): number {
  return fin(Math.exp(a));
}
function ln(a: number): number {
  return fin(Math.log(a));
}
function log10(a: number): number {
  return fin(Math.log10(a));
}
function log(a: number, b: number): number {
  if (a !== a || b !== b || a <= 0 || b <= 0) return NaN;
  return fin(Math.log(a) / Math.log(b));
}
function mod(a: number, b: number): number {
  return b === 0 ? NaN : fin(a % b);
}

function round(x: number, d: number): number {
  if (x !== x || d !== d) return NaN;
  const m = Math.pow(10, d);
  return fin(x < 0 ? -Math.round(-x * m) / m : Math.round(x * m) / m);
}
function roundup(x: number, d: number): number {
  if (x !== x || d !== d) return NaN;
  const m = Math.pow(10, d);
  return fin(x < 0 ? -Math.ceil(-x * m) / m : Math.ceil(x * m) / m);
}
function rounddown(x: number, d: number): number {
  if (x !== x || d !== d) return NaN;
  const m = Math.pow(10, d);
  return fin(x < 0 ? -Math.floor(-x * m) / m : Math.floor(x * m) / m);
}
function int(x: number): number {
  return x < 0 ? -Math.floor(-x) : Math.floor(x);
}
function sign(x: number): number {
  return x !== x ? NaN : x > 0 ? 1 : x < 0 ? -1 : 0;
}

function anyNaN5(a: number, b: number, c: number, d: number, e: number): boolean {
  return a !== a || b !== b || c !== c || d !== d || e !== e;
}

function pmt(rate: number, periods: number, present: number, future: number, type: number): number {
  if (anyNaN5(rate, periods, present, future, type)) return NaN;
  if (rate === 0) return fin((-present - future) / periods);
  const term = Math.pow(1 + rate, periods);
  return fin(((future * rate + present * rate * term) * (type ? 1 / (1 + rate) : 1)) / (1 - term));
}

function fvCore(rate: number, periods: number, payment: number, value: number, type: number): number {
  if (rate === 0) return -value - payment * periods;
  const term = Math.pow(1 + rate, periods);
  return (payment * (type ? 1 + rate : 1) * (1 - term)) / rate - value * term;
}

function fv(rate: number, periods: number, payment: number, value: number, type: number): number {
  if (anyNaN5(rate, periods, payment, value, type)) return NaN;
  return fin(fvCore(rate, periods, payment, value, type));
}

function pv(rate: number, periods: number, payment: number, future: number, type: number): number {
  if (anyNaN5(rate, periods, payment, future, type)) return NaN;
  const t = type ? 1 : 0;
  if (rate === -1) return NaN;
  if (rate === 0) return fin(-payment * periods - future);
  return fin(((1 - Math.pow(1 + rate, periods)) * payment * (1 + rate * t) / rate - future) / Math.pow(1 + rate, periods));
}

function nper(rate: number, payment: number, present: number, future: number, type: number): number {
  if (anyNaN5(rate, payment, present, future, type)) return NaN;
  if (rate === 0) {
    if (payment === 0) return NaN;
    return fin((-present - future) / payment);
  }
  if (type) payment *= 1 + rate;
  return fin(Math.log((payment - future * rate) / (present * rate + payment)) / Math.log(1 + rate));
}

function ors_normal(mean: number, sd: number): number {
  return mean !== mean || sd !== sd || sd < 0 ? NaN : mean;
}
function ors_lognormal(mean: number, sd: number): number {
  return mean !== mean || sd !== sd || !(mean > 0) || sd < 0 ? NaN : mean;
}
function ors_uniform(lo: number, hi: number): number {
  return lo <= hi ? fin((lo + hi) / 2) : NaN;
}
function ors_triangular(lo: number, mode: number, hi: number): number {
  return lo <= mode && mode <= hi ? fin((lo + mode + hi) / 3) : NaN;
}
function ors_pert(lo: number, mode: number, hi: number): number {
  return lo <= mode && mode <= hi ? fin((lo + 4 * mode + hi) / 6) : NaN;
}

/** Scalar operations by IR name. */
export const SCALAR_IMPL: Record<OpName, (...a: number[]) => number> = {
  add,
  sub,
  fadd,
  mul,
  div,
  pow,
  neg: (a) => -a,
  eq,
  ne,
  lt,
  gt,
  le,
  ge,
  isnum,
  not,
  min,
  max,
  abs,
  sqrt,
  exp,
  ln,
  log10,
  log,
  mod,
  round,
  roundup,
  rounddown,
  int,
  sign,
  pmt: pmt as (...a: number[]) => number,
  pv: pv as (...a: number[]) => number,
  fv: fv as (...a: number[]) => number,
  nper: nper as (...a: number[]) => number,
  ors_normal,
  ors_lognormal,
  ors_uniform,
  ors_triangular: ors_triangular as (...a: number[]) => number,
  ors_pert: ors_pert as (...a: number[]) => number,
};

export const FOLD_IMPL: Record<FoldOp, (a: number, b: number) => number> = {
  add,
  fadd,
  mul,
  min,
  max,
  and,
  or,
};

// ---------------------------------------------------------------------------------------------
// Vector functions. `v` holds the items in its first `n` slots.
// ---------------------------------------------------------------------------------------------

function anyNaN(v: Float64Array, n: number): boolean {
  for (let i = 0; i < n; i++) if (v[i] !== v[i]) return true;
  return false;
}

/** HyperFormula NPV (npvCore): Σ v_i/(1+r)^(i+1), evaluated backwards. */
function npv(v: Float64Array, n: number, rate: number): number {
  if (rate !== rate || anyNaN(v, n)) return NaN;
  let acc = 0;
  for (let i = n - 1; i >= 0; i--) {
    acc += v[i];
    if (rate === -1) {
      if (acc === 0) continue;
      return NaN;
    }
    acc /= 1 + rate;
  }
  return fin(acc);
}

/** HyperFormula IRR (irrCore): Newton–Raphson from `guess`, ε = 1e-10, 50 iterations. */
function irr(v: Float64Array, n: number, guess: number): number {
  if (guess !== guess || anyNaN(v, n)) return NaN;
  if (guess <= -1) return NaN;
  let pos = false;
  let neg = false;
  for (let i = 0; i < n; i++) {
    if (v[i] > 0) pos = true;
    else if (v[i] < 0) neg = true;
  }
  if (!pos || !neg) return NaN;
  const epsMax = 1e-10;
  let rate = guess;
  for (let iter = 0; iter < 50; iter++) {
    let f = 0;
    let df = 0;
    for (let i = 0; i < n; i++) {
      const factor = Math.pow(1 + rate, i);
      if (!isFinite(factor) || factor === 0) return NaN;
      f += v[i] / factor;
      if (i > 0) df -= (i * v[i]) / (factor * (1 + rate));
    }
    if (Math.abs(f) < epsMax) return fin(rate);
    if (Math.abs(df) < epsMax) return NaN;
    let next = rate - f / df;
    if (!isFinite(next)) return NaN;
    if (next <= -1) next = (rate - 1) / 2;
    if (Math.abs(next - rate) < epsMax) return fin(next);
    rate = next;
  }
  return NaN;
}

/** npvCore over a callback-provided sequence (used by HF MIRR). */
function npvSigned(v: Float64Array, n: number, rate: number, positive: boolean): number {
  let acc = 0;
  for (let i = n - 1; i >= 0; i--) {
    const x = v[i];
    acc += positive ? (x > 0 ? x : 0) : x < 0 ? x : 0;
    if (rate === -1) {
      if (acc === 0) continue;
      return NaN;
    }
    acc /= 1 + rate;
  }
  return acc;
}

/** HyperFormula MIRR. */
function mirr(v: Float64Array, n: number, frate: number, rrate: number): number {
  if (frate !== frate || rrate !== rrate || anyNaN(v, n)) return NaN;
  let pos = false;
  let neg = false;
  for (let i = 0; i < n; i++) {
    if (v[i] > 0) pos = true;
    else if (v[i] < 0) neg = true;
  }
  if (!pos || !neg) return NaN;
  const nom = npvSigned(v, n, rrate, true);
  const denom = npvSigned(v, n, frate, false);
  if (nom !== nom || denom !== denom) return NaN;
  return fin(Math.pow((-nom * Math.pow(1 + rrate, n)) / denom / (1 + frate), 1 / (n - 1)) - 1);
}

/** @openrisksim/finance mirr (ORS.MIRR). */
function orsMirr(v: Float64Array, n: number, financeRate: number, reinvestRate: number): number {
  if (financeRate !== financeRate || reinvestRate !== reinvestRate || anyNaN(v, n)) return NaN;
  if (n < 2) return NaN;
  let pvNeg = 0;
  let fvPos = 0;
  for (let t = 0; t < n; t++) {
    const c = v[t];
    if (c < 0) pvNeg += c / Math.pow(1 + financeRate, t);
    else fvPos += c * Math.pow(1 + reinvestRate, n - 1 - t);
  }
  if (pvNeg === 0 || fvPos === 0) return NaN;
  return fin(Math.pow(-fvPos / pvNeg, 1 / (n - 1)) - 1);
}

function paybackCore(v: Float64Array, n: number, rate: number | null): number {
  let cum = 0;
  let negative = false;
  for (let t = 0; t < n; t++) {
    const c = rate === null ? v[t] : v[t] / Math.pow(1 + rate, t);
    const prev = cum;
    cum += c;
    if (cum < 0) negative = true;
    else if (negative && prev < 0) return t - 1 + -prev / c;
  }
  return negative ? Infinity : 0;
}

/** @openrisksim/finance paybackPeriod (ORS.PAYBACK). */
function payback(v: Float64Array, n: number): number {
  if (anyNaN(v, n)) return NaN;
  return fin(paybackCore(v, n, null));
}

/** @openrisksim/finance discountedPaybackPeriod (ORS.DPAYBACK). */
function dpayback(v: Float64Array, n: number, rate: number): number {
  if (rate !== rate || anyNaN(v, n)) return NaN;
  return fin(paybackCore(v, n, rate));
}

/** @openrisksim/finance profitabilityIndex (ORS.PI). */
function pi(v: Float64Array, n: number, rate: number): number {
  if (rate !== rate || anyNaN(v, n)) return NaN;
  if (n === 0 || v[0] === 0) return NaN;
  let s = 0;
  let df = 1;
  const k = 1 / (1 + rate);
  for (let t = 0; t < n; t++) {
    s += v[t] * df;
    df *= k;
  }
  return fin((s - v[0]) / Math.abs(v[0]));
}

/** HyperFormula MEDIAN (sorts the scratch array in place). */
function median(v: Float64Array, n: number): number {
  if (n === 0 || anyNaN(v, n)) return NaN;
  const s = v.subarray(0, n).sort();
  return n % 2 === 0 ? (s[n / 2 - 1] + s[n / 2]) / 2 : s[Math.floor(n / 2)];
}

export const VEC_IMPL: Record<VecFn, (v: Float64Array, n: number, a?: number, b?: number) => number> = {
  npv: npv as (v: Float64Array, n: number, a?: number) => number,
  irr: irr as (v: Float64Array, n: number, a?: number) => number,
  mirr: mirr as (v: Float64Array, n: number, a?: number, b?: number) => number,
  ors_mirr: orsMirr as (v: Float64Array, n: number, a?: number, b?: number) => number,
  payback,
  dpayback: dpayback as (v: Float64Array, n: number, a?: number) => number,
  pi: pi as (v: Float64Array, n: number, a?: number) => number,
  median,
};

/** Everything the generated code needs, passed to `new Function`. */
export const RT = { fin, ...SCALAR_IMPL, and, or, vec: VEC_IMPL };

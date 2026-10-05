/**
 * Discounted cash-flow indicators. Cash flow arrays start at period 0.
 */
import { allRootsOnGrid, newton, rateGrid } from "./roots";

const DAY_MS = 86_400_000;

function hasSignChange(values: number[]): boolean {
  let pos = false;
  let neg = false;
  for (const v of values) {
    if (v > 0) pos = true;
    else if (v < 0) neg = true;
  }
  return pos && neg;
}

function scale(values: number[]): number {
  let s = 0;
  for (const v of values) s += Math.abs(v);
  return s;
}

/** NPV with the period-0 flow undiscounted: Σ CF_t / (1+r)^t. */
export function npv(rate: number, cashFlows: number[]): number {
  let s = 0;
  let df = 1;
  const k = 1 / (1 + rate);
  for (let t = 0; t < cashFlows.length; t++) {
    s += cashFlows[t] * df;
    df *= k;
  }
  return s;
}

/** Excel NPV semantics: the first value is discounted one period: Σ v_i / (1+r)^(i+1). */
export function excelNpv(rate: number, values: number[]): number {
  return npv(rate, values) / (1 + rate);
}

function npvDerivative(rate: number, cashFlows: number[]): number {
  let s = 0;
  for (let t = 1; t < cashFlows.length; t++) s -= (t * cashFlows[t]) / Math.pow(1 + rate, t + 1);
  return s;
}

/** Picks, among the roots found on the grid, the one closest to `guess`. */
function closestRoot(roots: number[], guess: number): number {
  if (roots.length === 0) return NaN;
  let best = roots[0];
  for (const r of roots) if (Math.abs(r - guess) < Math.abs(best - guess)) best = r;
  return best;
}

/**
 * Internal rate of return (Excel IRR). Newton–Raphson from `guess` (default 10%); if it fails,
 * scans (-0.99, 10] for sign changes and refines the root closest to `guess` with Brent's method.
 * NaN when the cash flows have no sign change or no root is found.
 */
export function irr(cashFlows: number[], guess = 0.1): number {
  if (cashFlows.length < 2 || !hasSignChange(cashFlows)) return NaN;
  const f = (r: number) => npv(r, cashFlows);
  const tol = 1e-9 * scale(cashFlows);
  const r0 = newton(f, (r) => npvDerivative(r, cashFlows), guess, -1);
  if (Number.isFinite(r0) && Math.abs(f(r0)) <= tol) return r0;
  return closestRoot(allRootsOnGrid(f, rateGrid()), guess);
}

/** All IRRs (sign-change roots of NPV) in (-0.99, 10], ascending. */
export function allIrrs(cashFlows: number[]): number[] {
  if (cashFlows.length < 2 || !hasSignChange(cashFlows)) return [];
  const roots = allRootsOnGrid((r) => npv(r, cashFlows), rateGrid());
  const out: number[] = [];
  for (const r of roots) if (out.length === 0 || Math.abs(r - out[out.length - 1]) > 1e-9) out.push(r);
  return out;
}

/**
 * Excel MIRR: negative flows discounted at `financeRate` to t0, positive flows compounded at
 * `reinvestRate` to the last period. NaN if there are no positive or no negative flows.
 */
export function mirr(cashFlows: number[], financeRate: number, reinvestRate: number): number {
  const n = cashFlows.length;
  if (n < 2) return NaN;
  let pvNeg = 0;
  let fvPos = 0;
  for (let t = 0; t < n; t++) {
    const c = cashFlows[t];
    if (c < 0) pvNeg += c / Math.pow(1 + financeRate, t);
    else fvPos += c * Math.pow(1 + reinvestRate, n - 1 - t);
  }
  if (pvNeg === 0 || fvPos === 0) return NaN;
  return Math.pow(-fvPos / pvNeg, 1 / (n - 1)) - 1;
}

function yearFractions(dates: Date[]): number[] {
  if (dates.length === 0) return [];
  const d0 = dates[0].getTime();
  // Rounded day count is robust to DST shifts; Excel uses (d_i − d_0)/365.
  return dates.map((d) => Math.round((d.getTime() - d0) / DAY_MS) / 365);
}

function xnpvFromYears(rate: number, cashFlows: number[], years: number[]): number {
  let s = 0;
  for (let i = 0; i < cashFlows.length; i++) s += cashFlows[i] / Math.pow(1 + rate, years[i]);
  return s;
}

/** Excel XNPV: Σ CF_i / (1+r)^((d_i − d_0)/365). */
export function xnpv(rate: number, cashFlows: number[], dates: Date[]): number {
  if (cashFlows.length !== dates.length) throw new Error("xnpv: cashFlows and dates must have the same length");
  return xnpvFromYears(rate, cashFlows, yearFractions(dates));
}

/** Excel XIRR (365-day convention). Newton from `guess` with grid + Brent fallback. */
export function xirr(cashFlows: number[], dates: Date[], guess = 0.1): number {
  if (cashFlows.length !== dates.length) throw new Error("xirr: cashFlows and dates must have the same length");
  if (cashFlows.length < 2 || !hasSignChange(cashFlows)) return NaN;
  const years = yearFractions(dates);
  const f = (r: number) => xnpvFromYears(r, cashFlows, years);
  const df = (r: number) => {
    let s = 0;
    for (let i = 0; i < cashFlows.length; i++) s -= (years[i] * cashFlows[i]) / Math.pow(1 + r, years[i] + 1);
    return s;
  };
  const tol = 1e-9 * scale(cashFlows);
  const r0 = newton(f, df, guess, -1);
  if (Number.isFinite(r0) && Math.abs(f(r0)) <= tol) return r0;
  return closestRoot(allRootsOnGrid(f, rateGrid()), guess);
}

/**
 * Simple payback: first period at which the cumulative cash flow, after having been negative,
 * becomes ≥ 0, with linear interpolation within that period (e.g. 2.5 = half-way through
 * year 3). 0 if the cumulative flow is never negative; Infinity if it is never recovered.
 */
export function paybackPeriod(cashFlows: number[]): number {
  let cum = 0;
  let negative = false;
  for (let t = 0; t < cashFlows.length; t++) {
    const prev = cum;
    cum += cashFlows[t];
    if (cum < 0) negative = true;
    else if (negative && prev < 0) return t - 1 + -prev / cashFlows[t];
  }
  return negative ? Infinity : 0;
}

/** Discounted payback: like {@link paybackPeriod} on CF_t/(1+r)^t. */
export function discountedPaybackPeriod(rate: number, cashFlows: number[]): number {
  return paybackPeriod(cashFlows.map((c, t) => c / Math.pow(1 + rate, t)));
}

/** PV of the flows after t0 divided by |initial investment| (= 1 + NPV/|CF0| when CF0 < 0). */
export function profitabilityIndex(rate: number, cashFlows: number[]): number {
  if (cashFlows.length === 0 || cashFlows[0] === 0) return NaN;
  return (npv(rate, cashFlows) - cashFlows[0]) / Math.abs(cashFlows[0]);
}

/** PV(benefits) / PV(costs); both arrays start at period 0. Costs may be given as positive or negative amounts. */
export function benefitCostRatio(rate: number, benefits: number[], costs: number[]): number {
  const pvc = Math.abs(npv(rate, costs));
  if (pvc === 0) return NaN;
  return npv(rate, benefits) / pvc;
}

/** Equivalent annual annuity (CAUE / VAE): NPV spread as a level annuity over n = cashFlows.length − 1 periods. */
export function equivalentAnnualAnnuity(rate: number, cashFlows: number[]): number {
  const n = cashFlows.length - 1;
  if (n <= 0) return NaN;
  const v = npv(rate, cashFlows);
  if (rate === 0) return v / n;
  return (v * rate) / (1 - Math.pow(1 + rate, -n));
}

export interface ProjectIndicators {
  npv: number;
  irr: number;
  mirr: number;
  payback: number;
  discountedPayback: number;
  profitabilityIndex: number;
  eaa: number;
}

/** All standard indicators at once. MIRR uses `rate` as finance rate and `reinvestRate` (default `rate`) as reinvestment rate. */
export function projectIndicators(cashFlows: number[], rate: number, reinvestRate?: number): ProjectIndicators {
  return {
    npv: npv(rate, cashFlows),
    irr: irr(cashFlows),
    mirr: mirr(cashFlows, rate, reinvestRate ?? rate),
    payback: paybackPeriod(cashFlows),
    discountedPayback: discountedPaybackPeriod(rate, cashFlows),
    profitabilityIndex: profitabilityIndex(rate, cashFlows),
    eaa: equivalentAnnualAnnuity(rate, cashFlows),
  };
}


/**
 * Time value of money (Excel-compatible sign conventions: money paid out is negative)
 * and rate helpers.
 */

/** Excel PMT(rate, nper, pv, [fv], [type]). */
export function pmt(rate: number, nper: number, pv: number, fv = 0, type: 0 | 1 = 0): number {
  if (rate === 0) return -(pv + fv) / nper;
  const g = Math.pow(1 + rate, nper);
  return (-(rate * (fv + pv * g)) / ((1 + rate * type) * (g - 1)));
}

/** Excel PV(rate, nper, pmt, [fv], [type]). */
export function pv(rate: number, nper: number, pmt: number, fv = 0, type: 0 | 1 = 0): number {
  if (rate === 0) return -(fv + pmt * nper);
  const g = Math.pow(1 + rate, nper);
  return -(fv + (pmt * (1 + rate * type) * (g - 1)) / rate) / g;
}

/** Excel FV(rate, nper, pmt, [pv], [type]). */
export function fv(rate: number, nper: number, pmt: number, pv = 0, type: 0 | 1 = 0): number {
  if (rate === 0) return -(pv + pmt * nper);
  const g = Math.pow(1 + rate, nper);
  return -(pv * g + (pmt * (1 + rate * type) * (g - 1)) / rate);
}

/** Excel NPER(rate, pmt, pv, [fv], [type]). NaN when no solution exists. */
export function nper(rate: number, pmt: number, pv: number, fv = 0, type: 0 | 1 = 0): number {
  if (rate === 0) return pmt === 0 ? NaN : -(pv + fv) / pmt;
  const a = pmt * (1 + rate * type);
  const num = a - fv * rate;
  const den = a + pv * rate;
  const ratio = num / den;
  if (!(ratio > 0)) return NaN;
  return Math.log(ratio) / Math.log(1 + rate);
}

/** Excel EFFECT: effective annual rate from a nominal rate compounded `periodsPerYear` times. */
export function effectiveRate(nominal: number, periodsPerYear: number): number {
  return Math.pow(1 + nominal / periodsPerYear, periodsPerYear) - 1;
}

/** Excel NOMINAL: nominal annual rate from an effective annual rate. */
export function nominalRate(effective: number, periodsPerYear: number): number {
  return periodsPerYear * (Math.pow(1 + effective, 1 / periodsPerYear) - 1);
}

/** Fisher equation: (1 + nominal) / (1 + inflation) − 1. */
export function realRate(nominal: number, inflation: number): number {
  return (1 + nominal) / (1 + inflation) - 1;
}

/** Weighted average cost of capital with after-tax cost of debt. `equity`/`debt` are amounts (market values). */
export function wacc(p: { equity: number; debt: number; costEquity: number; costDebt: number; taxRate: number }): number {
  const v = p.equity + p.debt;
  if (v === 0) return NaN;
  return (p.equity / v) * p.costEquity + (p.debt / v) * p.costDebt * (1 - p.taxRate);
}

/** CAPM cost of equity: rf + β(rm − rf) + country risk premium (common in Latin America). */
export function capm(p: { riskFree: number; beta: number; marketReturn: number; countryRisk?: number }): number {
  return p.riskFree + p.beta * (p.marketReturn - p.riskFree) + (p.countryRisk ?? 0);
}

/**
 * Loans (amortization schedules), depreciation, break-even and scenario analysis.
 */
import { brent } from "./roots";

export interface AmortizationRow {
  period: number;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
}

/**
 * Loan amortization table. Row 0 is the disbursement (balance = principal, zero payment),
 * rows 1..periods are the instalments.
 * - french: constant instalment (cuota constante)
 * - german: constant principal repayment (amortización constante)
 * - american: interest only, principal repaid at the end (bullet)
 */
export function amortizationSchedule(p: {
  principal: number;
  rate: number;
  periods: number;
  method: "french" | "german" | "american";
}): AmortizationRow[] {
  const { principal, rate, method } = p;
  const n = Math.max(0, Math.round(p.periods));
  const rows: AmortizationRow[] = [{ period: 0, payment: 0, interest: 0, principal: 0, balance: principal }];
  let balance = principal;
  const frenchPayment = n === 0 ? 0 : rate === 0 ? principal / n : (principal * rate) / (1 - Math.pow(1 + rate, -n));
  for (let t = 1; t <= n; t++) {
    const interest = balance * rate;
    let amort: number;
    if (method === "french") amort = t === n ? balance : frenchPayment - interest;
    else if (method === "german") amort = t === n ? balance : principal / n;
    else amort = t === n ? balance : 0;
    balance -= amort;
    if (t === n) balance = 0;
    rows.push({ period: t, payment: interest + amort, interest, principal: amort, balance });
  }
  return rows;
}

export type DepreciationMethod = "straightLine" | "decliningBalance" | "doubleDeclining" | "sumOfYears" | "units";

/**
 * Depreciation charge per period (periods 1..life; for "units" one per element of `units`).
 * - straightLine: (cost − salvage)/life (Excel SLN)
 * - decliningBalance: Excel DB (fixed rate 1 − (salvage/cost)^(1/life) rounded to 3 decimals, full first year)
 * - doubleDeclining: 2/life declining balance switching to straight line when that is larger
 *   (Excel VDB with factor 2), never below salvage, so the asset is fully depreciated to salvage
 * - sumOfYears: Excel SYD
 * - units: units-of-production, (cost − salvage)·units_t/Σunits
 */
export function depreciation(p: {
  cost: number;
  salvage: number;
  life: number;
  method: DepreciationMethod;
  units?: number[];
}): number[] {
  const { cost, salvage, method } = p;
  const base = cost - salvage;
  if (method === "units") {
    const units = p.units ?? [];
    const total = units.reduce((a, b) => a + b, 0);
    return units.map((u) => (total > 0 ? (base * u) / total : 0));
  }
  const life = Math.max(0, Math.round(p.life));
  const out: number[] = [];
  if (life === 0) return out;
  switch (method) {
    case "straightLine":
      for (let t = 1; t <= life; t++) out.push(base / life);
      return out;
    case "sumOfYears": {
      const syd = (life * (life + 1)) / 2;
      for (let t = 1; t <= life; t++) out.push((base * (life - t + 1)) / syd);
      return out;
    }
    case "decliningBalance": {
      const rate = cost > 0 && salvage > 0 ? Math.round((1 - Math.pow(salvage / cost, 1 / life)) * 1000) / 1000 : 1;
      let book = cost;
      for (let t = 1; t <= life; t++) {
        const d = book * rate;
        out.push(d);
        book -= d;
      }
      return out;
    }
    case "doubleDeclining": {
      let book = cost;
      for (let t = 1; t <= life; t++) {
        const remaining = life - t + 1;
        const ddb = (book * 2) / life;
        const sl = (book - salvage) / remaining;
        let d = Math.max(ddb, sl);
        d = Math.min(d, Math.max(0, book - salvage));
        out.push(d);
        book -= d;
      }
      return out;
    }
    default:
      throw new Error(`Unknown depreciation method: ${String(method)}`);
  }
}

/**
 * Generic break-even: x in [lo, hi] such that f(x) = target, by Brent's method.
 * NaN if f(lo) − target and f(hi) − target have the same sign.
 */
export function breakEven(f: (x: number) => number, target: number, lo: number, hi: number): number {
  return brent((x) => f(x) - target, lo, hi, 1e-12 * Math.max(1, Math.abs(lo), Math.abs(hi)));
}

/** Accounting break-even: Q* = F/(p − v), revenue = Q*·p. Infinity when price ≤ variable cost. */
export function accountingBreakEven(p: { fixedCosts: number; pricePerUnit: number; variableCostPerUnit: number }): {
  units: number;
  revenue: number;
} {
  const margin = p.pricePerUnit - p.variableCostPerUnit;
  if (margin <= 0) return { units: Infinity, revenue: Infinity };
  const units = p.fixedCosts / margin;
  return { units, revenue: units * p.pricePerUnit };
}

/**
 * Scenario analysis with probabilities (normalised if they don't add up to 1).
 * stdDev uses the population formula Σp(v − E)²; cv = stdDev/|expected|.
 */
export function scenarioAnalysis(s: { name: string; probability: number; value: number }[]): {
  expected: number;
  stdDev: number;
  cv: number;
} {
  const total = s.reduce((a, b) => a + b.probability, 0);
  if (s.length === 0 || !(total > 0)) return { expected: NaN, stdDev: NaN, cv: NaN };
  let e = 0;
  for (const x of s) e += (x.probability / total) * x.value;
  let v = 0;
  for (const x of s) v += (x.probability / total) * (x.value - e) ** 2;
  const sd = Math.sqrt(v);
  return { expected: e, stdDev: sd, cv: e === 0 ? NaN : sd / Math.abs(e) };
}

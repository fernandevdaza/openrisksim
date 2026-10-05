/**
 * Classic Latin-American project cash flow ("flujo de caja del proyecto") and, when financed,
 * the investor's / equity cash flow ("flujo de caja del inversionista").
 */
import type { I18nText } from "@openrisksim/core";
import { amortizationSchedule, depreciation } from "./assets";

export interface ProjectInputs {
  /** Number of operating years (columns 1..horizon; column 0 is the investment year). */
  horizon: number;
  /** Depreciable fixed investment at t0. */
  investment: number;
  /** Working capital invested at t0 and recovered in the last year. */
  workingCapital: number;
  /** Market (sale) value of the assets at the end of the horizon (before taxes). */
  salvageValue: number;
  /**
   * Per-year inputs for years 1..horizon (index 0 = year 1). Shorter arrays are padded with
   * their last value, so `[10]` means "10 every year".
   */
  units: number[];
  price: number[];
  /** Variable cost per unit. */
  variableCost: number[];
  fixedCosts: number[];
  depreciationMethod: "straightLine" | "doubleDeclining" | "sumOfYears";
  /** Depreciable life in years (depreciated to zero book value). */
  depreciableLife: number;
  taxRate: number;
  discountRate: number;
  loan?: { amount: number; rate: number; periods: number; method: "french" | "german" | "american" };
}

export interface ProjectCashFlowTable {
  rows: { key: string; label: I18nText; values: number[] }[];
  freeCashFlow: number[];
  equityCashFlow: number[] | null;
}

const LABELS: Record<string, I18nText> = {
  revenue: { es: "Ingresos", en: "Revenue" },
  variableCosts: { es: "Costos variables", en: "Variable costs" },
  fixedCosts: { es: "Costos fijos", en: "Fixed costs" },
  depreciation: { es: "Depreciación", en: "Depreciation" },
  ebt: { es: "Utilidad antes de impuestos", en: "Earnings before taxes" },
  taxes: { es: "Impuestos", en: "Taxes" },
  netIncome: { es: "Utilidad neta", en: "Net income" },
  depreciationAddBack: { es: "Más: depreciación", en: "Add back: depreciation" },
  investment: { es: "Inversión", en: "Investment" },
  workingCapital: { es: "Capital de trabajo", en: "Working capital" },
  salvageValue: { es: "Valor de salvamento", en: "Salvage value" },
  salvageTax: { es: "Impuesto sobre valor de salvamento", en: "Tax on salvage gain" },
  freeCashFlow: { es: "Flujo de caja libre", en: "Free cash flow" },
  loanProceeds: { es: "Préstamo", en: "Loan proceeds" },
  interest: { es: "Intereses", en: "Interest" },
  interestTaxShield: { es: "Escudo fiscal de intereses", en: "Interest tax shield" },
  principalRepayment: { es: "Amortización de la deuda", en: "Principal repayment" },
  equityCashFlow: { es: "Flujo de caja del inversionista", en: "Equity cash flow" },
};

function at(arr: number[], i: number): number {
  if (arr.length === 0) return 0;
  return arr[Math.min(i, arr.length - 1)];
}

/**
 * Taxes with a simple tax-loss carryforward (losses offset future taxable income, no expiry,
 * never a negative tax). Returns tax per period (index 0 = t0 → 0).
 */
function taxesWithCarryforward(taxable: number[], rate: number): number[] {
  let carry = 0;
  return taxable.map((x, t) => {
    if (t === 0) return 0;
    const base = x - carry;
    if (base > 0) {
      carry = 0;
      return base * rate;
    }
    carry = -base;
    return 0;
  });
}

/**
 * Builds the project cash-flow table. Every row has `horizon + 1` values (t = 0..horizon).
 * Costs, depreciation, taxes, investment and outflows are shown with negative sign, so:
 *  ebt = revenue + variableCosts + fixedCosts + depreciation
 *  netIncome = ebt + taxes
 *  freeCashFlow = netIncome + depreciationAddBack + investment + workingCapital + salvageValue + salvageTax
 *  equityCashFlow = freeCashFlow + loanProceeds + interest + interestTaxShield + principalRepayment
 * Salvage is taxed on the gain over book value (a loss yields a tax credit).
 * If the loan term exceeds the horizon, the outstanding balance is repaid in the last year.
 */
export function buildProjectCashFlow(inputs: ProjectInputs): ProjectCashFlowTable {
  const H = Math.max(1, Math.round(inputs.horizon));
  const T = H + 1;
  const zeros = () => new Array<number>(T).fill(0);
  const tax = inputs.taxRate;

  const revenue = zeros();
  const variableCosts = zeros();
  const fixedCosts = zeros();
  const dep = zeros();
  const depSchedule = depreciation({
    cost: inputs.investment,
    salvage: 0,
    life: inputs.depreciableLife,
    method: inputs.depreciationMethod,
  });
  let accumulatedDep = 0;
  for (let t = 1; t <= H; t++) {
    const q = at(inputs.units, t - 1);
    revenue[t] = q * at(inputs.price, t - 1);
    variableCosts[t] = -q * at(inputs.variableCost, t - 1);
    fixedCosts[t] = -at(inputs.fixedCosts, t - 1);
    const d = depSchedule[t - 1] ?? 0;
    dep[t] = -d;
    accumulatedDep += d;
  }
  const ebt = revenue.map((r, t) => r + variableCosts[t] + fixedCosts[t] + dep[t]);
  const taxesPos = taxesWithCarryforward(ebt, tax);
  const taxes = taxesPos.map((x) => 0 - x);
  const netIncome = ebt.map((e, t) => e + taxes[t]);
  const addBack = dep.map((d) => -d);
  const investment = zeros();
  investment[0] = -inputs.investment;
  const workingCapital = zeros();
  workingCapital[0] = -inputs.workingCapital;
  workingCapital[H] += inputs.workingCapital;
  const salvage = zeros();
  salvage[H] = inputs.salvageValue;
  const bookValue = Math.max(0, inputs.investment - accumulatedDep);
  const salvageTax = zeros();
  salvageTax[H] = -tax * (inputs.salvageValue - bookValue);
  const fcf = netIncome.map(
    (ni, t) => ni + addBack[t] + investment[t] + workingCapital[t] + salvage[t] + salvageTax[t],
  );

  const row = (key: string, values: number[]) => ({ key, label: LABELS[key], values });
  const rows = [
    row("revenue", revenue),
    row("variableCosts", variableCosts),
    row("fixedCosts", fixedCosts),
    row("depreciation", dep),
    row("ebt", ebt),
    row("taxes", taxes),
    row("netIncome", netIncome),
    row("depreciationAddBack", addBack),
    row("investment", investment),
    row("workingCapital", workingCapital),
    row("salvageValue", salvage),
    row("salvageTax", salvageTax),
    row("freeCashFlow", fcf),
  ];

  let equity: number[] | null = null;
  if (inputs.loan && inputs.loan.amount !== 0) {
    const sched = amortizationSchedule({
      principal: inputs.loan.amount,
      rate: inputs.loan.rate,
      periods: inputs.loan.periods,
      method: inputs.loan.method,
    });
    const proceeds = zeros();
    proceeds[0] = inputs.loan.amount;
    const interest = zeros();
    const principal = zeros();
    for (let t = 1; t <= H; t++) {
      const r = sched[t];
      if (!r) break;
      interest[t] = -r.interest;
      principal[t] = -r.principal;
    }
    // Balloon repayment of any balance outstanding at the end of the horizon.
    const outstanding = sched[Math.min(H, sched.length - 1)].balance;
    principal[H] -= outstanding;
    // Shield = taxes without debt − taxes with debt (same carryforward rules).
    const leveredTaxes = taxesWithCarryforward(
      ebt.map((e, t) => e + interest[t]),
      tax,
    );
    const shield = taxesPos.map((x, t) => x - leveredTaxes[t]);
    equity = fcf.map((f, t) => f + proceeds[t] + interest[t] + shield[t] + principal[t]);
    rows.push(
      row("loanProceeds", proceeds),
      row("interest", interest),
      row("interestTaxShield", shield),
      row("principalRepayment", principal),
      row("equityCashFlow", equity),
    );
  }
  return { rows, freeCashFlow: fcf, equityCashFlow: equity };
}

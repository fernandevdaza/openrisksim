/**
 * Builds the rows of a "Proyecto" sheet from the project-evaluator inputs, either with live
 * spreadsheet formulas (the student can then define assumptions on the parameter cells and a
 * forecast on the NPV cell) or with plain values.
 *
 * The formulas mirror `buildProjectCashFlow` from @openrisksim/finance exactly:
 * depreciation to zero book value (SL / double-declining switching to SL / SYD), taxes with a
 * tax-loss carryforward, working capital recovered in the last year, salvage taxed on the gain
 * over book value, loan with balloon repayment at the horizon and the interest tax shield computed
 * as (taxes without debt − taxes with debt).
 */
import type { Locale } from "./format";

export type SheetCell = number | string | null;

export interface ProjectSheetInputs {
  horizon: number;
  investment: number;
  workingCapital: number;
  salvageValue: number;
  units: number[];
  price: number[];
  variableCost: number[];
  fixedCosts: number[];
  depreciationMethod: "straightLine" | "doubleDeclining" | "sumOfYears";
  depreciableLife: number;
  taxRate: number;
  discountRate: number;
  loan?: { amount: number; rate: number; periods: number; method: "french" | "german" | "american" };
}

export interface ProjectSheetResult {
  rows: SheetCell[][];
  /** A1 addresses of key cells (for the hint shown after export). */
  cells: { npv: string; irr: string; equityNpv?: string; price: string; units: string };
}

export function colLetters(col: number): string {
  let n = col + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const L = {
  title: { es: "Evaluación de proyecto — flujo de caja", en: "Project evaluation — cash flow" },
  note: {
    es: "Las celdas de parámetros (columna B) y la tabla de datos por año son entradas: defina supuestos sobre ellas y un pronóstico sobre el VAN.",
    en: "Parameter cells (column B) and the per-year data table are inputs: define assumptions on them and a forecast on the NPV.",
  },
  params: { es: "Parámetros", en: "Parameters" },
  investment: { es: "Inversión inicial (activo depreciable)", en: "Initial investment (depreciable asset)" },
  workingCapital: { es: "Capital de trabajo", en: "Working capital" },
  salvageValue: { es: "Valor de salvamento (de mercado)", en: "Salvage (market) value" },
  life: { es: "Vida útil depreciable (años)", en: "Depreciable life (years)" },
  tax: { es: "Tasa de impuesto", en: "Tax rate" },
  rate: { es: "Tasa de descuento", en: "Discount rate" },
  depMethod: { es: "Método de depreciación", en: "Depreciation method" },
  loanAmount: { es: "Monto del préstamo", en: "Loan amount" },
  loanRate: { es: "Tasa del préstamo", en: "Loan rate" },
  loanPeriods: { es: "Plazo del préstamo (años)", en: "Loan term (years)" },
  loanMethod: { es: "Sistema de amortización", en: "Amortization method" },
  data: { es: "Datos por año", en: "Per-year data" },
  year: { es: "Año", en: "Year" },
  units: { es: "Unidades vendidas", en: "Units sold" },
  price: { es: "Precio unitario", en: "Unit price" },
  variableCost: { es: "Costo variable unitario", en: "Unit variable cost" },
  fixedCosts: { es: "Costos fijos", en: "Fixed costs" },
  cashFlow: { es: "Flujo de caja del proyecto", en: "Project cash flow" },
  revenue: { es: "Ingresos", en: "Revenue" },
  variableCosts: { es: "Costos variables", en: "Variable costs" },
  fixedCostsRow: { es: "Costos fijos", en: "Fixed costs" },
  depreciation: { es: "Depreciación", en: "Depreciation" },
  ebt: { es: "Utilidad antes de impuestos", en: "Earnings before taxes" },
  carry: { es: "Pérdida tributaria por compensar (aux.)", en: "Tax-loss carryforward (aux.)" },
  taxes: { es: "Impuestos", en: "Taxes" },
  netIncome: { es: "Utilidad neta", en: "Net income" },
  addBack: { es: "Más: depreciación", en: "Add back: depreciation" },
  investmentRow: { es: "Inversión", en: "Investment" },
  workingCapitalRow: { es: "Capital de trabajo", en: "Working capital" },
  salvageRow: { es: "Valor de salvamento", en: "Salvage value" },
  salvageTax: { es: "Impuesto sobre valor de salvamento", en: "Tax on salvage gain" },
  fcf: { es: "Flujo de caja libre", en: "Free cash flow" },
  financing: { es: "Financiamiento (flujo del inversionista)", en: "Financing (equity cash flow)" },
  balance: { es: "Saldo de la deuda (fin de año)", en: "Debt balance (end of year)" },
  proceeds: { es: "Préstamo", en: "Loan proceeds" },
  interest: { es: "Intereses", en: "Interest" },
  principal: { es: "Amortización de la deuda", en: "Principal repayment" },
  leveredEbt: { es: "UAI con deuda (aux.)", en: "EBT with debt (aux.)" },
  leveredCarry: { es: "Pérdida por compensar con deuda (aux.)", en: "Carryforward with debt (aux.)" },
  leveredTax: { es: "Impuestos con deuda (aux.)", en: "Taxes with debt (aux.)" },
  shield: { es: "Escudo fiscal de intereses", en: "Interest tax shield" },
  equity: { es: "Flujo de caja del inversionista", en: "Equity cash flow" },
  indicators: { es: "Indicadores", en: "Indicators" },
  npv: { es: "VAN", en: "NPV" },
  irr: { es: "TIR", en: "IRR" },
  mirr: { es: "TIRM", en: "MIRR" },
  payback: { es: "PRI (años)", en: "Payback (years)" },
  dpayback: { es: "PRI descontado (años)", en: "Discounted payback (years)" },
  pi: { es: "IR (índice de rentabilidad)", en: "PI (profitability index)" },
  eaa: { es: "VAE (valor anual equivalente)", en: "EAA (equivalent annual annuity)" },
  equityNpv: { es: "VAN del inversionista", en: "Equity NPV" },
  equityIrr: { es: "TIR del inversionista", en: "Equity IRR" },
} as const;

const DEP_NAMES = {
  straightLine: { es: "Línea recta", en: "Straight line" },
  doubleDeclining: { es: "Doble saldo decreciente", en: "Double declining balance" },
  sumOfYears: { es: "Suma de dígitos de los años", en: "Sum of years' digits" },
};
const LOAN_NAMES = {
  french: { es: "Francés (cuota constante)", en: "French (level payment)" },
  german: { es: "Alemán (amortización constante)", en: "German (level principal)" },
  american: { es: "Americano (bullet)", en: "American (bullet)" },
};

function at(arr: number[], i: number): number {
  if (arr.length === 0) return 0;
  return arr[Math.min(i, arr.length - 1)];
}

/** Rows (with formulas as "=..." strings) for the project sheet. Row 1 of the sheet = rows[0]. */
export function buildProjectSheet(inp: ProjectSheetInputs, locale: Locale): ProjectSheetResult {
  const H = Math.max(1, Math.round(inp.horizon));
  const tr = (k: keyof typeof L) => L[k][locale];
  const rows: SheetCell[][] = [];
  const rowOf: Record<string, number> = {};
  const add = (key: string | null, cells: SheetCell[]) => {
    rows.push(cells);
    if (key) rowOf[key] = rows.length; // 1-based sheet row
    return rows.length;
  };
  const col = (t: number) => colLetters(1 + t); // year t → column (B = year 0)
  const first = col(0);
  const last = col(H);
  const P = (key: string) => `$B$${rowOf[key]}`; // absolute parameter reference
  const r = (key: string) => rowOf[key];

  add(null, [tr("title")]);
  add(null, [tr("note")]);
  add(null, []);
  add(null, [tr("params")]);
  add("inv", [tr("investment"), inp.investment]);
  add("wc", [tr("workingCapital"), inp.workingCapital]);
  add("salv", [tr("salvageValue"), inp.salvageValue]);
  add("life", [tr("life"), inp.depreciableLife]);
  add("tax", [tr("tax"), inp.taxRate]);
  add("rate", [tr("rate"), inp.discountRate]);
  add(null, [tr("depMethod"), DEP_NAMES[inp.depreciationMethod][locale]]);
  const loan = inp.loan && inp.loan.amount !== 0 ? inp.loan : undefined;
  if (loan) {
    add("lAmt", [tr("loanAmount"), loan.amount]);
    add("lRate", [tr("loanRate"), loan.rate]);
    add("lN", [tr("loanPeriods"), loan.periods]);
    add(null, [tr("loanMethod"), LOAN_NAMES[loan.method][locale]]);
  }
  add(null, []);

  const years = Array.from({ length: H + 1 }, (_, t) => t);
  add(null, [tr("data")]);
  add("yIn", [tr("year"), ...years]);
  const perYear = (key: string, label: string, arr: number[]) => add(key, [label, null, ...years.slice(1).map((t) => at(arr, t - 1))]);
  perYear("units", tr("units"), inp.units);
  perYear("price", tr("price"), inp.price);
  perYear("vc", tr("variableCost"), inp.variableCost);
  perYear("fc", tr("fixedCosts"), inp.fixedCosts);
  add(null, []);

  add(null, [tr("cashFlow")]);
  add("y", [tr("year"), ...years]);
  const Y = (t: number) => `${col(t)}$${r("y")}`; // year number in header (relative column)
  /** Formula row: year 0 value + per-year formula builder. */
  const fRow = (key: string, label: string, f: (t: number) => SheetCell) => add(key, [label, ...years.map(f)]);
  const c = (key: string, t: number) => `${col(t)}${r(key)}`;

  // these rows are referenced before being defined only through rowOf after creation → order matters
  fRow("rev", tr("revenue"), (t) => (t === 0 ? 0 : `=${c("units", t)}*${c("price", t)}`));
  fRow("vcr", tr("variableCosts"), (t) => (t === 0 ? 0 : `=-${c("units", t)}*${c("vc", t)}`));
  fRow("fcr", tr("fixedCostsRow"), (t) => (t === 0 ? 0 : `=-${c("fc", t)}`));
  const depRowIndex = rows.length + 1;
  const depCell = (t: number) => `${col(t)}${depRowIndex}`;
  // book value at the start of year t = investment + Σ(previous depreciation, negative)
  const book = (t: number) => `(${P("inv")}+SUM($${first}${depRowIndex}:${depCell(t - 1)}))`;
  fRow("dep", tr("depreciation"), (t) => {
    if (t === 0) return 0;
    const life = `ROUND(${P("life")},0)`;
    switch (inp.depreciationMethod) {
      case "straightLine":
        return `=-IF(${Y(t)}<=${life},${P("inv")}/${life},0)`;
      case "sumOfYears":
        return `=-IF(${Y(t)}<=${life},${P("inv")}*(${life}-${Y(t)}+1)/(${life}*(${life}+1)/2),0)`;
      case "doubleDeclining":
        return `=-IF(${Y(t)}<=${life},MIN(MAX(${book(t)}*2/${life},${book(t)}/(${life}-${Y(t)}+1)),MAX(0,${book(t)})),0)`;
    }
  });
  fRow("ebt", tr("ebt"), (t) => `=SUM(${c("rev", t)}:${c("dep", t)})`);
  // carryforward: carry_t = MAX(0, carry_{t-1} − ebt_t); tax_t = MAX(0, ebt_t − carry_{t-1})·τ
  const carryRow = rows.length + 1;
  fRow("carry", tr("carry"), (t) => (t === 0 ? 0 : `=MAX(0,${col(t - 1)}${carryRow}-${c("ebt", t)})`));
  fRow("taxes", tr("taxes"), (t) => (t === 0 ? 0 : `=-MAX(0,${c("ebt", t)}-${col(t - 1)}${carryRow})*${P("tax")}`));
  fRow("ni", tr("netIncome"), (t) => `=${c("ebt", t)}+${c("taxes", t)}`);
  fRow("addBack", tr("addBack"), (t) => `=-${c("dep", t)}`);
  fRow("invr", tr("investmentRow"), (t) => (t === 0 ? `=-${P("inv")}` : 0));
  fRow("wcr", tr("workingCapitalRow"), (t) => (t === 0 ? `=-${P("wc")}` : t === H ? `=${P("wc")}` : 0));
  fRow("salvr", tr("salvageRow"), (t) => (t === H ? `=${P("salv")}` : 0));
  fRow("salvTax", tr("salvageTax"), (t) =>
    t === H ? `=-${P("tax")}*(${P("salv")}-MAX(0,${P("inv")}+SUM($${col(1)}$${r("dep")}:$${last}$${r("dep")})))` : 0,
  );
  fRow("fcf", tr("fcf"), (t) => `=${c("ni", t)}+SUM(${c("addBack", t)}:${c("salvTax", t)})`);

  if (loan) {
    add(null, []);
    add(null, [tr("financing")]);
    const balRow = rows.length + 1;
    const amortRow = balRow + 3; // balance, proceeds, interest, principal
    const n = `ROUND(${P("lN")},0)`;
    const rate = P("lRate");
    const amt = P("lAmt");
    const prevBal = (t: number) => `${col(t - 1)}${balRow}`;
    fRow("bal", tr("balance"), (t) => (t === 0 ? `=${amt}` : `=${prevBal(t)}+${col(t)}${amortRow}`));
    fRow("proc", tr("proceeds"), (t) => (t === 0 ? `=${amt}` : 0));
    fRow("int", tr("interest"), (t) => (t === 0 ? 0 : `=-${prevBal(t)}*${rate}`));
    fRow("prin", tr("principal"), (t) => {
      if (t === 0) return 0;
      const sched =
        loan.method === "french"
          ? `IF(${rate}=0,${amt}/${n},${amt}*${rate}/(1-(1+${rate})^(-${n})))-${prevBal(t)}*${rate}`
          : loan.method === "german"
            ? `${amt}/${n}`
            : "0";
      // last instalment or horizon end (balloon) repays the whole outstanding balance
      return t === H ? `=-IF(${Y(t)}>${n},0,${prevBal(t)})` : `=-IF(${Y(t)}>${n},0,IF(${Y(t)}=${n},${prevBal(t)},${sched}))`;
    });
    fRow("lebt", tr("leveredEbt"), (t) => `=${c("ebt", t)}+${c("int", t)}`);
    const lCarryRow = rows.length + 1;
    fRow("lcarry", tr("leveredCarry"), (t) => (t === 0 ? 0 : `=MAX(0,${col(t - 1)}${lCarryRow}-${c("lebt", t)})`));
    fRow("ltax", tr("leveredTax"), (t) => (t === 0 ? 0 : `=MAX(0,${c("lebt", t)}-${col(t - 1)}${lCarryRow})*${P("tax")}`));
    fRow("shield", tr("shield"), (t) => `=-${c("taxes", t)}-${c("ltax", t)}`);
    fRow("eq", tr("equity"), (t) => `=${c("fcf", t)}+${c("proc", t)}+${c("int", t)}+${c("shield", t)}+${c("prin", t)}`);
  }

  add(null, []);
  add(null, [tr("indicators")]);
  const range = (key: string) => `${first}${r(key)}:${last}${r(key)}`;
  const tail = (key: string) => `${col(1)}${r(key)}:${last}${r(key)}`;
  const rateRef = P("rate");
  add("npv", [tr("npv"), `=${first}${r("fcf")}+NPV(${rateRef},${tail("fcf")})`]);
  add("irr", [tr("irr"), `=IRR(${range("fcf")})`]);
  add(null, [tr("mirr"), `=MIRR(${range("fcf")},${rateRef},${rateRef})`]);
  add(null, [tr("payback"), `=ORS.PAYBACK(${range("fcf")})`]);
  add(null, [tr("dpayback"), `=ORS.DPAYBACK(${rateRef},${range("fcf")})`]);
  add(null, [tr("pi"), `=NPV(${rateRef},${tail("fcf")})/ABS(${first}${r("fcf")})`]);
  add(null, [tr("eaa"), `=PMT(${rateRef},${H},-B${r("npv")})`]);
  if (loan) {
    add("enpv", [tr("equityNpv"), `=${first}${r("eq")}+NPV(${rateRef},${tail("eq")})`]);
    add(null, [tr("equityIrr"), `=IRR(${range("eq")})`]);
  }
  return {
    rows,
    cells: {
      npv: `B${r("npv")}`,
      irr: `B${r("irr")}`,
      equityNpv: loan ? `B${r("enpv")}` : undefined,
      price: `${col(1)}${r("price")}`,
      units: `${col(1)}${r("units")}`,
    },
  };
}

/** Values-only version: the cash-flow table as computed by the finance package. */
export function buildProjectValuesSheet(
  table: { rows: { label: { es: string; en: string }; values: number[] }[] },
  indicators: { label: string; value: number }[],
  locale: Locale,
): SheetCell[][] {
  const H = (table.rows[0]?.values.length ?? 1) - 1;
  const years = Array.from({ length: H + 1 }, (_, t) => t);
  const out: SheetCell[][] = [[L.title[locale]], [], [L.year[locale], ...years]];
  for (const row of table.rows) out.push([row.label[locale], ...row.values.map((v) => (Number.isFinite(v) ? v : null))]);
  out.push([], [L.indicators[locale]]);
  for (const ind of indicators) out.push([ind.label, Number.isFinite(ind.value) ? ind.value : null]);
  return out;
}

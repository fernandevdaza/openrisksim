/**
 * Example workbooks, built programmatically (formulas + a pre-defined RiskModel).
 * Spanish-first labels with English translations.
 */
import { DEFAULT_SETTINGS } from "@openrisksim/core";
import type {
  AssumptionDef,
  CorrelationDef,
  DecisionVariableDef,
  DistributionSpec,
  ForecastDef,
  I18nText,
  RiskModel,
} from "@openrisksim/core";
import { colToLetters, parseA1 } from "./address";
import { SpreadsheetEngine } from "./engine";
import type { CellData, CellStyle, SheetData, WorkbookData } from "./types";

// ---------------------------------------------------------------------------------------------
// Tiny sheet builder
// ---------------------------------------------------------------------------------------------

const FMT = {
  money: "#,##0",
  money2: "#,##0.00",
  pct: "0.0%",
  num: "#,##0",
  dec: "0.00",
};

const TITLE: CellStyle = { bold: true, color: "#1F3864" };
const HEADER: CellStyle = { bold: true, bg: "#D9E1F2" };
const SECTION: CellStyle = { bold: true, color: "#1F3864" };
const INPUT: CellStyle = { bg: "#FFF2CC" };
const OUTPUT: CellStyle = { bold: true, bg: "#E2EFDA" };

class SheetBuilder {
  readonly cells: Record<string, CellData> = {};
  readonly merges: string[] = [];
  constructor(readonly name: string, readonly colWidths: Record<number, number> = {}) {}

  text(addr: string, text: string, s?: CellStyle): this {
    this.cells[addr] = { v: text, t: "s", ...(s ? { s } : {}) };
    return this;
  }

  num(addr: string, v: number, z?: string, s?: CellStyle): this {
    this.cells[addr] = { v, t: "n", ...(z ? { z } : {}), ...(s ? { s } : {}) };
    return this;
  }

  f(addr: string, formula: string, z?: string, s?: CellStyle): this {
    this.cells[addr] = { f: formula, ...(z ? { z } : {}), ...(s ? { s } : {}) };
    return this;
  }

  /** Label in column A and a numeric input in column B. */
  input(row: number, label: string, v: number, z?: string): this {
    this.text(`A${row}`, label);
    return this.num(`B${row}`, v, z, INPUT);
  }

  build(): SheetData {
    let rows = 1;
    let cols = 1;
    for (const k of Object.keys(this.cells)) {
      const p = parseA1(k);
      rows = Math.max(rows, p.row + 1);
      cols = Math.max(cols, p.col + 1);
    }
    const sheet: SheetData = { name: this.name, rows, cols, cells: this.cells };
    if (Object.keys(this.colWidths).length) sheet.colWidths = this.colWidths;
    if (this.merges.length) sheet.merges = this.merges;
    return sheet;
  }
}

function settings(trials = 5000) {
  return { ...DEFAULT_SETTINGS, trials, seed: 12345 };
}

function assumption(id: string, name: string, sheet: string, address: string, distribution: DistributionSpec): AssumptionDef {
  return { id, name, cell: { sheet, address }, distribution, enabled: true };
}

function forecast(id: string, name: string, sheet: string, address: string, format?: ForecastDef["format"]): ForecastDef {
  const f: ForecastDef = { id, name, cell: { sheet, address } };
  if (format) f.format = format;
  return f;
}

function decision(id: string, name: string, sheet: string, address: string, type: DecisionVariableDef["type"], lower: number, upper: number, step?: number): DecisionVariableDef {
  const d: DecisionVariableDef = { id, name, cell: { sheet, address }, type, lower, upper };
  if (step !== undefined) d.step = step;
  return d;
}

function model(parts: { assumptions: AssumptionDef[]; forecasts: ForecastDef[]; decisions?: DecisionVariableDef[]; correlations?: CorrelationDef[]; trials?: number }): RiskModel {
  return {
    version: 1,
    assumptions: parts.assumptions,
    forecasts: parts.forecasts,
    decisions: parts.decisions ?? [],
    correlations: parts.correlations ?? [],
    settings: settings(parts.trials),
  };
}

/** Run the raw workbook through the formula engine so every formula cell carries a cached value. */
function finalize(sheets: SheetData[], m: RiskModel, fileName: string): WorkbookData {
  const raw: WorkbookData = { sheets, model: m, fileName };
  const engine = SpreadsheetEngine.fromWorkbook(raw);
  try {
    const wb = engine.toWorkbookData(m);
    wb.fileName = fileName;
    return wb;
  } finally {
    engine.destroy();
  }
}

// ---------------------------------------------------------------------------------------------
// 1. Project evaluation
// ---------------------------------------------------------------------------------------------

function buildProject(): WorkbookData {
  const S = "Proyecto";
  const b = new SheetBuilder(S, { 0: 44, 1: 14, 2: 13, 3: 13, 4: 13, 5: 13, 6: 13 });
  b.text("A1", "Evaluación de proyecto de inversión / Project evaluation", TITLE);
  b.text("A2", "Celdas amarillas: entradas. Verde: supuestos (inciertos). Azul: pronósticos.");
  b.text("A3", "Entradas / Inputs", SECTION);
  b.input(4, "Unidades vendidas año 1 / Units sold year 1", 10000, FMT.num);
  b.input(5, "Crecimiento anual de unidades / Unit growth", 0.05, FMT.pct);
  b.input(6, "Precio unitario / Unit price", 26, FMT.money2);
  b.input(7, "Costo variable unitario / Unit variable cost", 12, FMT.money2);
  b.input(8, "Costos fijos anuales / Annual fixed costs", 60000, FMT.money);
  b.input(9, "Inversión inicial / Initial investment", 250000, FMT.money);
  b.input(10, "Vida útil (años) / Useful life (years)", 5, FMT.num);
  b.input(11, "Valor de rescate / Salvage value", 25000, FMT.money);
  b.input(12, "Tasa de impuesto / Tax rate", 0.25, FMT.pct);
  b.input(13, "Capital de trabajo (% de ventas) / Working capital (% of sales)", 0.1, FMT.pct);
  b.input(14, "Tasa de descuento / Discount rate", 0.12, FMT.pct);
  b.input(15, "Inflación de precios y costos / Inflation", 0.03, FMT.pct);

  const H = 17; // header row
  b.text(`A${H}`, "Flujo de caja / Cash flow", HEADER);
  const cols = ["B", "C", "D", "E", "F", "G"]; // years 0..5
  cols.forEach((c, i) => b.num(`${c}${H}`, i, "0", HEADER));
  const years = cols.slice(1);
  const labels: [number, string][] = [
    [18, "Unidades / Units"],
    [19, "Precio / Price"],
    [20, "Ingresos / Revenue"],
    [21, "Costos variables / Variable costs"],
    [22, "Costos fijos / Fixed costs"],
    [23, "Depreciación / Depreciation"],
    [24, "Utilidad antes de impuestos / EBT"],
    [25, "Impuestos / Taxes"],
    [26, "Utilidad neta / Net income"],
    [27, "(+) Depreciación / Depreciation add-back"],
    [28, "Inversión y rescate / Investment & salvage"],
    [29, "Capital de trabajo / Working capital"],
    [30, "Flujo de caja libre / Free cash flow"],
    [31, "Flujo acumulado / Cumulative cash flow"],
  ];
  for (const [r, l] of labels) b.text(`A${r}`, l, r === 30 ? { bold: true } : undefined);
  years.forEach((c, i) => {
    const prev = cols[i];
    const next = cols[i + 2];
    b.f(`${c}18`, i === 0 ? "$B$4" : `${prev}18*(1+$B$5)`, FMT.num);
    b.f(`${c}19`, i === 0 ? "$B$6" : `${prev}19*(1+$B$15)`, FMT.money2);
    b.f(`${c}20`, `${c}18*${c}19`, FMT.money);
    b.f(`${c}21`, `-${c}18*$B$7*(1+$B$15)^(${c}$17-1)`, FMT.money);
    b.f(`${c}22`, `-$B$8*(1+$B$15)^(${c}$17-1)`, FMT.money);
    b.f(`${c}23`, `-IF(${c}$17<=$B$10,($B$9-$B$11)/$B$10,0)`, FMT.money);
    b.f(`${c}24`, `SUM(${c}20:${c}23)`, FMT.money);
    b.f(`${c}25`, `-MAX(0,${c}24)*$B$12`, FMT.money);
    b.f(`${c}26`, `${c}24+${c}25`, FMT.money);
    b.f(`${c}27`, `-${c}23`, FMT.money);
    b.f(`${c}28`, c === "G" ? "$B$11" : "0", FMT.money);
    // working capital: requirement = % of next year's revenue, recovered at the end
    b.f(`${c}29`, next ? `-$B$13*(${next}20-${c}20)` : `$B$13*${c}20`, FMT.money);
    b.f(`${c}30`, `${c}26+${c}27+${c}28+${c}29`, FMT.money, { bold: true });
    b.f(`${c}31`, `${prev}31+${c}30`, FMT.money);
  });
  b.f("B28", "-$B$9", FMT.money);
  b.f("B29", "-$B$13*C20", FMT.money);
  b.f("B30", "B28+B29", FMT.money, { bold: true });
  b.f("B31", "B30", FMT.money);

  b.text("A33", "Indicadores / Indicators", SECTION);
  b.text("A34", "VAN / NPV");
  b.f("B34", "B30+NPV($B$14,C30:G30)", FMT.money, OUTPUT);
  b.text("A35", "TIR / IRR");
  b.f("B35", "IRR(B30:G30)", FMT.pct, OUTPUT);
  b.text("A36", "Periodo de recuperación (años) / Payback (years)");
  b.f("B36", 'IF(G31<0,"> 5",COUNTIF(C31:G31,"<0")+(-INDEX(B31:G31,1,COUNTIF(C31:G31,"<0")+1))/INDEX(C30:G30,1,COUNTIF(C31:G31,"<0")+1))', FMT.dec, OUTPUT);
  b.text("A37", "Índice de rentabilidad / Profitability index");
  b.f("B37", "NPV($B$14,C30:G30)/-B30", FMT.dec, OUTPUT);
  b.text("A38", "VAN como anualidad / Equivalent annual annuity");
  b.f("B38", "-PMT($B$14,$B$10,B34)", FMT.money, OUTPUT);

  const m = model({
    assumptions: [
      assumption("a_units", "Unidades vendidas año 1", S, "B4", { id: "normal", params: { mean: 10000, stdDev: 1500 }, truncate: { min: 0 } }),
      assumption("a_price", "Precio unitario", S, "B6", { id: "normal", params: { mean: 26, stdDev: 2 }, truncate: { min: 0 } }),
      assumption("a_varcost", "Costo variable unitario", S, "B7", { id: "pert", params: { min: 10.5, mode: 12, max: 15 } }),
      assumption("a_invest", "Inversión inicial", S, "B9", { id: "triangular", params: { min: 220000, mode: 250000, max: 310000 } }),
      assumption("a_rate", "Tasa de descuento", S, "B14", { id: "uniform", params: { min: 0.1, max: 0.14 } }),
    ],
    forecasts: [
      forecast("f_npv", "VAN", S, "B34", "currency"),
      forecast("f_irr", "TIR", S, "B35", "percent"),
    ],
    correlations: [{ a: "a_price", b: "a_units", rho: -0.5 }],
  });
  return finalize([b.build()], m, "evaluacion-proyecto.xlsx");
}

// ---------------------------------------------------------------------------------------------
// 2. Inventory / newsvendor
// ---------------------------------------------------------------------------------------------

function buildInventory(): WorkbookData {
  const S = "Inventario";
  const b = new SheetBuilder(S, { 0: 46, 1: 14 });
  b.text("A1", "Inventario: problema del vendedor de periódicos / Newsvendor", TITLE);
  b.text("A3", "Entradas / Inputs", SECTION);
  b.input(4, "Demanda del periodo / Demand", 100, FMT.num);
  b.input(5, "Precio de venta / Selling price", 50, FMT.money2);
  b.input(6, "Costo unitario de compra / Unit cost", 30, FMT.money2);
  b.input(7, "Valor de rescate por unidad sobrante / Salvage per unsold unit", 10, FMT.money2);
  b.input(8, "Costo por faltante (pérdida de imagen) / Shortage penalty", 5, FMT.money2);
  b.text("A10", "Decisión / Decision", SECTION);
  b.input(11, "Cantidad a pedir / Order quantity", 100, FMT.num);
  b.text("A13", "Resultados / Results", SECTION);
  b.text("A14", "Unidades vendidas / Units sold");
  b.f("B14", "MIN(B4,B11)", FMT.num);
  b.text("A15", "Unidades sobrantes / Leftover units");
  b.f("B15", "MAX(B11-B4,0)", FMT.num);
  b.text("A16", "Demanda insatisfecha / Unmet demand");
  b.f("B16", "MAX(B4-B11,0)", FMT.num);
  b.text("A17", "Ingresos por ventas / Sales revenue");
  b.f("B17", "B14*B5", FMT.money);
  b.text("A18", "Costo de compra / Purchase cost");
  b.f("B18", "-B11*B6", FMT.money);
  b.text("A19", "Ingreso por rescate / Salvage income");
  b.f("B19", "B15*B7", FMT.money);
  b.text("A20", "Penalización por faltante / Shortage penalty");
  b.f("B20", "-B16*B8", FMT.money);
  b.text("A21", "Utilidad / Profit");
  b.f("B21", "SUM(B17:B20)", FMT.money, OUTPUT);
  b.text("A22", "Nivel de servicio / Fill rate");
  b.f("B22", "IF(B4=0,1,B14/B4)", FMT.pct, OUTPUT);
  b.text("A24", "Cantidad crítica (fractil) / Critical ratio");
  b.f("B24", "(B5-B6+B8)/(B5-B7+B8)", FMT.pct);

  const m = model({
    assumptions: [assumption("a_demand", "Demanda", S, "B4", { id: "poisson", params: { lambda: 100 } })],
    forecasts: [forecast("f_profit", "Utilidad", S, "B21", "currency"), forecast("f_fill", "Nivel de servicio", S, "B22", "percent")],
    decisions: [decision("d_order", "Cantidad a pedir", S, "B11", "integer", 60, 140)],
  });
  return finalize([b.build()], m, "inventario-newsvendor.xlsx");
}

// ---------------------------------------------------------------------------------------------
// 3. Investment portfolio
// ---------------------------------------------------------------------------------------------

function buildPortfolio(): WorkbookData {
  const S = "Cartera";
  const b = new SheetBuilder(S, { 0: 34, 1: 14, 2: 14, 3: 16, 4: 12, 5: 14, 6: 14 });
  b.text("A1", "Cartera de inversión / Investment portfolio", TITLE);
  b.text("A3", "Capital invertido / Invested capital");
  b.num("B3", 100000, FMT.money, INPUT);
  const headers = [
    "Activo / Asset",
    "Retorno esperado / Expected return",
    "Volatilidad / Volatility",
    "Factor simulado (1+r) / Simulated factor",
    "Peso / Weight",
    "Retorno / Return",
    "Contribución / Contribution",
  ];
  headers.forEach((h, i) => b.text(`${colToLetters(i)}5`, h, HEADER));
  const assets: [string, number, number][] = [
    ["Acciones locales / Local equity", 0.11, 0.2],
    ["Acciones internacionales / Global equity", 0.09, 0.16],
    ["Bonos corporativos / Corporate bonds", 0.055, 0.06],
    ["Depósitos a plazo / Term deposits", 0.03, 0.005],
  ];
  const weights = [0.3, 0.25, 0.3, 0.15];
  assets.forEach(([name, mu, sd], i) => {
    const r = 6 + i;
    b.text(`A${r}`, name);
    b.num(`B${r}`, mu, FMT.pct, INPUT);
    b.num(`C${r}`, sd, FMT.pct, INPUT);
    b.f(`D${r}`, `1+B${r}`, "0.0000");
    b.num(`E${r}`, weights[i], FMT.pct, INPUT);
    b.f(`F${r}`, `D${r}-1`, FMT.pct);
    b.f(`G${r}`, `E${r}*F${r}/$E$10`, FMT.pct);
  });
  b.text("A10", "Total", { bold: true });
  b.f("E10", "SUM(E6:E9)", FMT.pct, { bold: true });
  b.f("G10", "SUM(G6:G9)", FMT.pct, { bold: true });
  b.text("A12", "Resultados / Results", SECTION);
  b.text("A13", "Retorno de la cartera / Portfolio return");
  b.f("B13", "SUMPRODUCT(E6:E9,F6:F9)/E10", FMT.pct, OUTPUT);
  b.text("A14", "Valor final / Ending value");
  b.f("B14", "B3*(1+B13)", FMT.money, OUTPUT);
  b.text("A15", "Ganancia / Gain");
  b.f("B15", "B14-B3", FMT.money, OUTPUT);
  b.text("A16", "Retorno esperado (determinístico) / Expected return");
  b.f("B16", "SUMPRODUCT(E6:E9,B6:B9)/E10", FMT.pct);
  b.text("A17", "Volatilidad sin correlación / Volatility (uncorrelated)");
  b.f("B17", "SQRT(SUMPRODUCT(E6:E9,E6:E9,C6:C9,C6:C9))/E10", FMT.pct);

  // Factor cells D6:D9 hold formulas (=1+B) → the evaluator overrides them during simulation.
  const m = model({
    assumptions: [
      assumption("a_eq_local", "Acciones locales (1+r)", S, "D6", { id: "lognormal", params: { mean: 1.11, stdDev: 0.2 } }),
      assumption("a_eq_global", "Acciones internacionales (1+r)", S, "D7", { id: "lognormal", params: { mean: 1.09, stdDev: 0.16 } }),
      assumption("a_bonds", "Bonos corporativos (1+r)", S, "D8", { id: "normal", params: { mean: 1.055, stdDev: 0.06 } }),
      assumption("a_deposits", "Depósitos a plazo (1+r)", S, "D9", { id: "normal", params: { mean: 1.03, stdDev: 0.005 } }),
    ],
    forecasts: [
      forecast("f_return", "Retorno de la cartera", S, "B13", "percent"),
      forecast("f_value", "Valor final", S, "B14", "currency"),
    ],
    decisions: [
      decision("d_w1", "Peso acciones locales", S, "E6", "continuous", 0, 1),
      decision("d_w2", "Peso acciones internacionales", S, "E7", "continuous", 0, 1),
      decision("d_w3", "Peso bonos", S, "E8", "continuous", 0, 1),
      decision("d_w4", "Peso depósitos", S, "E9", "continuous", 0, 1),
    ],
    correlations: [
      { a: "a_eq_local", b: "a_eq_global", rho: 0.6 },
      { a: "a_eq_local", b: "a_bonds", rho: -0.2 },
    ],
  });
  return finalize([b.build()], m, "cartera-inversion.xlsx");
}

// ---------------------------------------------------------------------------------------------
// 4. Product launch with discrete events
// ---------------------------------------------------------------------------------------------

function buildLaunch(): WorkbookData {
  const S = "Lanzamiento";
  const b = new SheetBuilder(S, { 0: 50, 1: 14, 2: 13, 3: 13, 4: 13, 5: 13 });
  b.text("A1", "Lanzamiento de producto / Product launch", TITLE);
  b.text("A3", "Entradas / Inputs", SECTION);
  b.input(4, "Aprobación regulatoria (1 = sí) / Regulatory approval (1 = yes)", 1, "0");
  b.input(5, "Costo de desarrollo / Development cost", 500000, FMT.money);
  b.input(6, "Distribuidores que aceptan (de 20) / Distributors signing (of 20)", 8, "0");
  b.input(7, "Unidades por distribuidor (año 1) / Units per distributor (year 1)", 2500, FMT.num);
  b.input(8, "Precio unitario / Unit price", 40, FMT.money2);
  b.input(9, "Costo variable unitario / Unit variable cost", 22, FMT.money2);
  b.input(10, "Crecimiento anual / Annual growth", 0.06, FMT.pct);
  b.input(11, "Costo de lanzamiento comercial / Commercial launch cost", 150000, FMT.money);
  b.input(12, "Tasa de descuento / Discount rate", 0.1, FMT.pct);
  b.input(13, "Tasa de impuesto / Tax rate", 0.25, FMT.pct);

  b.text("A15", "Año / Year", HEADER);
  const cols = ["B", "C", "D", "E", "F"]; // years 0..4
  cols.forEach((c, i) => b.num(`${c}15`, i, "0", HEADER));
  b.text("A16", "Unidades / Units");
  b.text("A17", "Margen de contribución / Contribution margin");
  b.text("A18", "Impuestos / Taxes");
  b.text("A19", "Inversión / Investment");
  b.text("A20", "Flujo de caja / Cash flow", { bold: true });
  b.num("B16", 0, FMT.num);
  b.num("B17", 0, FMT.money);
  b.num("B18", 0, FMT.money);
  b.f("B19", "-B5-IF(B4>=1,B11,0)", FMT.money);
  cols.slice(1).forEach((c, i) => {
    const prev = cols[i];
    b.f(`${c}16`, i === 0 ? "IF($B$4>=1,$B$6*$B$7,0)" : `${prev}16*(1+$B$10)`, FMT.num);
    b.f(`${c}17`, `${c}16*($B$8-$B$9)`, FMT.money);
    b.f(`${c}18`, `-MAX(0,${c}17)*$B$13`, FMT.money);
    b.num(`${c}19`, 0, FMT.money);
  });
  cols.forEach((c) => b.f(`${c}20`, `SUM(${c}17:${c}19)`, FMT.money, { bold: true }));

  b.text("A22", "Indicadores / Indicators", SECTION);
  b.text("A23", "VAN / NPV");
  b.f("B23", "B20+NPV(B12,C20:F20)", FMT.money, OUTPUT);
  b.text("A24", "¿Proyecto exitoso? (VAN > 0) / Success (NPV > 0)");
  b.f("B24", "IF(B23>0,1,0)", "0", OUTPUT);
  b.text("A25", "Valor presente de los márgenes / PV of margins");
  b.f("B25", "NPV(B12,C17:F17)", FMT.money);

  const m = model({
    assumptions: [
      assumption("a_approval", "Aprobación regulatoria", S, "B4", { id: "bernoulli", params: { p: 0.7 } }),
      assumption("a_devcost", "Costo de desarrollo", S, "B5", { id: "triangular", params: { min: 400000, mode: 500000, max: 700000 } }),
      assumption("a_distributors", "Distribuidores que aceptan", S, "B6", { id: "binomial", params: { n: 20, p: 0.4 } }),
      assumption("a_units", "Unidades por distribuidor", S, "B7", { id: "normal", params: { mean: 2500, stdDev: 500 }, truncate: { min: 0 } }),
      assumption("a_price", "Precio unitario", S, "B8", { id: "pert", params: { min: 34, mode: 40, max: 44 } }),
    ],
    forecasts: [forecast("f_npv", "VAN del lanzamiento", S, "B23", "currency"), forecast("f_success", "Éxito (VAN > 0)", S, "B24", "number")],
  });
  return finalize([b.build()], m, "lanzamiento-producto.xlsx");
}

// ---------------------------------------------------------------------------------------------
// 5. Loan / equity-holder cash flow
// ---------------------------------------------------------------------------------------------

function buildLoan(): WorkbookData {
  const S = "Préstamo";
  const b = new SheetBuilder(S, { 0: 46, 1: 14, 2: 13, 3: 13, 4: 13, 5: 13, 6: 13 });
  b.text("A1", "Flujo del inversionista con préstamo / Equity cash flow with a loan", TITLE);
  b.text("A3", "Entradas / Inputs", SECTION);
  b.input(4, "Inversión total / Total investment", 500000, FMT.money);
  b.input(5, "Porcentaje financiado / Debt share", 0.6, FMT.pct);
  b.input(6, "Tasa base (referencial) / Base rate", 0.08, FMT.pct);
  b.input(7, "Margen del banco (spread) / Bank spread", 0.03, FMT.pct);
  b.input(8, "Plazo (años) / Term (years)", 5, "0");
  b.input(9, "EBITDA año 1 / EBITDA year 1", 160000, FMT.money);
  b.input(10, "Crecimiento del EBITDA / EBITDA growth", 0.03, FMT.pct);
  b.input(11, "Tasa de impuesto / Tax rate", 0.25, FMT.pct);
  b.input(12, "Costo del capital propio / Cost of equity", 0.15, FMT.pct);
  b.text("A13", "Monto del préstamo / Loan amount");
  b.f("B13", "B4*B5", FMT.money);
  b.text("A14", "Tasa del préstamo / Loan rate");
  b.f("B14", "B6+B7", FMT.pct);
  b.text("A15", "Cuota (sistema francés) / Payment (French)");
  b.f("B15", "PMT(B14,B8,-B13)", FMT.money);

  b.text("A17", "Año / Year", HEADER);
  const cols = ["B", "C", "D", "E", "F", "G"]; // years 0..5
  cols.forEach((c, i) => b.num(`${c}17`, i, "0", HEADER));
  const rows: [number, string][] = [
    [18, "Saldo inicial / Opening balance"],
    [19, "Interés / Interest"],
    [20, "Amortización / Principal"],
    [21, "Saldo final / Closing balance"],
    [22, "EBITDA"],
    [23, "Depreciación / Depreciation"],
    [24, "Utilidad antes de impuestos / EBT"],
    [25, "Impuestos / Taxes"],
    [26, "Flujo del inversionista / Equity cash flow"],
    [27, "Cobertura del servicio de deuda (DSCR)"],
  ];
  for (const [r, l] of rows) b.text(`A${r}`, l, r === 26 ? { bold: true } : undefined);
  b.f("B21", "B13", FMT.money);
  b.f("B26", "-(B4-B13)", FMT.money, { bold: true });
  cols.slice(1).forEach((c, i) => {
    const prev = cols[i];
    b.f(`${c}18`, `${prev}21`, FMT.money);
    b.f(`${c}19`, `${c}18*$B$14`, FMT.money);
    b.f(`${c}20`, `IF(${c}$17<=$B$8,$B$15-${c}19,0)`, FMT.money);
    b.f(`${c}21`, `${c}18-${c}20`, FMT.money);
    b.f(`${c}22`, i === 0 ? "$B$9" : `${prev}22*(1+$B$10)`, FMT.money);
    b.f(`${c}23`, "$B$4/5", FMT.money);
    b.f(`${c}24`, `${c}22-${c}23-${c}19`, FMT.money);
    b.f(`${c}25`, `-MAX(0,${c}24)*$B$11`, FMT.money);
    b.f(`${c}26`, `${c}22+${c}25-${c}19-${c}20`, FMT.money, { bold: true });
    b.f(`${c}27`, `IF((${c}19+${c}20)>0,${c}22/(${c}19+${c}20),0)`, FMT.dec);
  });

  b.text("A29", "Indicadores / Indicators", SECTION);
  b.text("A30", "VAN del inversionista / Equity NPV");
  b.f("B30", "B26+NPV(B12,C26:G26)", FMT.money, OUTPUT);
  b.text("A31", "TIR del inversionista / Equity IRR");
  b.f("B31", "IRR(B26:G26)", FMT.pct, OUTPUT);
  b.text("A32", "DSCR mínimo / Minimum DSCR");
  b.f("B32", "MIN(C27:G27)", FMT.dec, OUTPUT);
  b.text("A33", "Intereses totales pagados / Total interest paid");
  b.f("B33", "SUM(C19:G19)", FMT.money);

  const m = model({
    assumptions: [
      assumption("a_base_rate", "Tasa base", S, "B6", { id: "normal", params: { mean: 0.08, stdDev: 0.015 }, truncate: { min: 0.02, max: 0.16 } }),
      assumption("a_ebitda", "EBITDA año 1", S, "B9", { id: "normal", params: { mean: 160000, stdDev: 25000 } }),
      assumption("a_growth", "Crecimiento del EBITDA", S, "B10", { id: "triangular", params: { min: -0.02, mode: 0.03, max: 0.07 } }),
    ],
    forecasts: [
      forecast("f_equity_npv", "VAN del inversionista", S, "B30", "currency"),
      forecast("f_equity_irr", "TIR del inversionista", S, "B31", "percent"),
      forecast("f_dscr", "DSCR mínimo", S, "B32", "number"),
    ],
    correlations: [{ a: "a_base_rate", b: "a_ebitda", rho: -0.3 }],
  });
  return finalize([b.build()], m, "prestamo-inversionista.xlsx");
}

export const EXAMPLES: { id: string; name: I18nText; description: I18nText; build: () => WorkbookData }[] = [
  {
    id: "project",
    name: { es: "Evaluación de proyecto", en: "Project evaluation" },
    description: {
      es: "Flujo de caja a 5 años (unidades, precio, costos, depreciación lineal, impuestos, capital de trabajo, rescate) con VAN, TIR y periodo de recuperación. Precio y unidades correlacionados negativamente.",
      en: "5-year project cash flow (units, price, costs, straight-line depreciation, taxes, working capital, salvage) with NPV, IRR and payback. Price and units negatively correlated.",
    },
    build: buildProject,
  },
  {
    id: "inventory",
    name: { es: "Inventario (vendedor de periódicos)", en: "Inventory (newsvendor)" },
    description: {
      es: "Demanda Poisson; decisión: cantidad a pedir; pronósticos: utilidad y nivel de servicio.",
      en: "Poisson demand; decision: order quantity; forecasts: profit and fill rate.",
    },
    build: buildInventory,
  },
  {
    id: "portfolio",
    name: { es: "Cartera de inversión", en: "Investment portfolio" },
    description: {
      es: "Cuatro activos con retornos normales/lognormales correlacionados; pesos como variables de decisión; pronósticos: retorno y valor final.",
      en: "Four assets with correlated normal/lognormal returns; weights as decision variables; forecasts: return and ending value.",
    },
    build: buildPortfolio,
  },
  {
    id: "launch",
    name: { es: "Lanzamiento de producto", en: "Product launch" },
    description: {
      es: "Eventos discretos: aprobación regulatoria (Bernoulli) y número de distribuidores (binomial); pronóstico: VAN y probabilidad de éxito.",
      en: "Discrete events: regulatory approval (Bernoulli) and number of distributors (binomial); forecasts: NPV and probability of success.",
    },
    build: buildLaunch,
  },
  {
    id: "loan",
    name: { es: "Préstamo y flujo del inversionista", en: "Loan & equity cash flow" },
    description: {
      es: "Proyecto financiado con deuda a tasa variable (incertidumbre en la tasa base); pronósticos: VAN y TIR del inversionista y DSCR mínimo.",
      en: "Debt-financed project with a floating rate (uncertain base rate); forecasts: equity NPV, equity IRR and minimum DSCR.",
    },
    build: buildLoan,
  },
];

/** Convenience: build an example by id. */
export function buildExample(id: string): WorkbookData {
  const ex = EXAMPLES.find((e) => e.id === id);
  if (!ex) throw new Error(`Unknown example: ${id}`);
  return ex.build();
}

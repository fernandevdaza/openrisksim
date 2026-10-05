/**
 * The live-formula project sheet must reproduce exactly what @openrisksim/finance computes.
 * We evaluate the generated formulas with the real spreadsheet engine and compare.
 */
import { describe, expect, it } from "vitest";
import { buildProjectCashFlow, projectIndicators } from "@openrisksim/finance";
import { SpreadsheetEngine } from "@openrisksim/workbook";
import { buildProjectSheet, buildProjectValuesSheet, colLetters, type ProjectSheetInputs } from "./projectSheet";

const BASE: ProjectSheetInputs = {
  horizon: 5,
  investment: 100000,
  workingCapital: 15000,
  salvageValue: 20000,
  units: [10000, 11000, 12000, 12500, 13000],
  price: [12, 12, 12.5, 12.5, 13],
  variableCost: [6, 6, 6.2, 6.2, 6.4],
  fixedCosts: [25000, 25000, 26000, 26000, 27000],
  depreciationMethod: "straightLine",
  depreciableLife: 5,
  taxRate: 0.25,
  discountRate: 0.12,
};

function evaluate(inputs: ProjectSheetInputs) {
  const sheet = buildProjectSheet(inputs, "es");
  const engine = SpreadsheetEngine.fromWorkbook({ sheets: [{ name: "Proyecto", rows: 120, cols: 60, cells: {} }], model: null });
  engine.setRangeValues("Proyecto", "A1", sheet.rows);
  // labels may repeat between the input table and the cash flow ("Costos fijos"): search after the cash-flow title
  const cfStart = sheet.rows.findIndex((r) => r[0] === "Flujo de caja del proyecto");
  const rowOfLabel = (label: string) => sheet.rows.findIndex((r, i) => i > cfStart && r[0] === label) + 1;
  const num = (address: string) => {
    const v = engine.getValue({ sheet: "Proyecto", address });
    if (typeof v !== "number") throw new Error(`${address} = ${JSON.stringify(v)}`);
    return v;
  };
  const rowValues = (label: string, H: number) => {
    const r = rowOfLabel(label);
    expect(r).toBeGreaterThan(0);
    return Array.from({ length: H + 1 }, (_, t) => num(`${colLetters(1 + t)}${r}`));
  };
  return { sheet, num, rowValues };
}

function check(inputs: ProjectSheetInputs) {
  const H = inputs.horizon;
  const table = buildProjectCashFlow(inputs);
  const { sheet, num, rowValues } = evaluate(inputs);
  for (const row of table.rows) {
    const got = rowValues(row.label.es, H);
    row.values.forEach((v, t) => expect(got[t], `${row.key}[${t}]`).toBeCloseTo(v, 6));
  }
  const ind = projectIndicators(table.freeCashFlow, inputs.discountRate);
  expect(num(sheet.cells.npv)).toBeCloseTo(ind.npv, 6);
  expect(num(sheet.cells.irr)).toBeCloseTo(ind.irr, 6);
  if (table.equityCashFlow && sheet.cells.equityNpv) {
    const eq = projectIndicators(table.equityCashFlow, inputs.discountRate);
    expect(num(sheet.cells.equityNpv)).toBeCloseTo(eq.npv, 6);
  }
  return { sheet, num };
}

describe("buildProjectSheet (live formulas)", () => {
  it("matches the finance package — straight line", () => {
    const { sheet, num } = check(BASE);
    // other indicators
    const ind = projectIndicators(buildProjectCashFlow(BASE).freeCashFlow, BASE.discountRate);
    const r = sheet.rows.findIndex((x) => x[0] === "TIRM") + 1;
    expect(num(`B${r}`)).toBeCloseTo(ind.mirr, 6);
    const pi = sheet.rows.findIndex((x) => String(x[0]).startsWith("IR ")) + 1;
    expect(num(`B${pi}`)).toBeCloseTo(ind.profitabilityIndex, 6);
    const eaa = sheet.rows.findIndex((x) => String(x[0]).startsWith("VAE")) + 1;
    expect(num(`B${eaa}`)).toBeCloseTo(ind.eaa, 6);
    const pb = sheet.rows.findIndex((x) => x[0] === "PRI (años)") + 1;
    expect(num(`B${pb}`)).toBeCloseTo(ind.payback, 6);
    const dpb = sheet.rows.findIndex((x) => x[0] === "PRI descontado (años)") + 1;
    expect(num(`B${dpb}`)).toBeCloseTo(ind.discountedPayback, 6);
  });
  it("matches with double declining and sum-of-years, life ≠ horizon, losses carried forward", () => {
    check({ ...BASE, depreciationMethod: "doubleDeclining", depreciableLife: 4 });
    check({ ...BASE, depreciationMethod: "sumOfYears", depreciableLife: 7, horizon: 6 });
    // early losses → tax-loss carryforward
    check({ ...BASE, units: [2000, 6000, 15000], horizon: 4, salvageValue: 0 });
  });
  it("matches with every loan method, including balloon repayment at the horizon", () => {
    check({ ...BASE, loan: { amount: 60000, rate: 0.1, periods: 5, method: "french" } });
    check({ ...BASE, loan: { amount: 60000, rate: 0.09, periods: 4, method: "german" } });
    check({ ...BASE, loan: { amount: 60000, rate: 0.08, periods: 3, method: "american" } });
    check({ ...BASE, loan: { amount: 60000, rate: 0.1, periods: 8, method: "french" } });
    check({ ...BASE, loan: { amount: 60000, rate: 0, periods: 5, method: "french" } });
  });
  it("points the hint cells to the NPV and the year-1 inputs", () => {
    const { sheet } = evaluate(BASE);
    expect(sheet.cells.price).toMatch(/^C\d+$/);
    expect(sheet.cells.npv).toMatch(/^B\d+$/);
  });
});

describe("buildProjectValuesSheet", () => {
  it("writes labels, years and indicators", () => {
    const table = buildProjectCashFlow(BASE);
    const rows = buildProjectValuesSheet(table, [{ label: "VAN", value: 123 }], "en");
    expect(rows[2]).toEqual(["Year", 0, 1, 2, 3, 4, 5]);
    expect(rows[3][0]).toBe("Revenue");
    expect(rows[rows.length - 1]).toEqual(["VAN", 123]);
  });
});

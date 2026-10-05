import { describe, expect, it } from "vitest";
import {
  accountingBreakEven,
  allIrrs,
  amortizationSchedule,
  benefitCostRatio,
  breakEven,
  buildProjectCashFlow,
  capm,
  depreciation,
  discountedPaybackPeriod,
  effectiveRate,
  equivalentAnnualAnnuity,
  excelNpv,
  fv,
  irr,
  mirr,
  nominalRate,
  nper,
  npv,
  paybackPeriod,
  pmt,
  profitabilityIndex,
  projectIndicators,
  pv,
  realRate,
  scenarioAnalysis,
  wacc,
  xirr,
  xnpv,
  type ProjectInputs,
} from "./index";

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe("time value of money (Excel reference values)", () => {
  it("PMT", () => {
    expect(pmt(0.1 / 12, 360, 100000)).toBeCloseTo(-877.5715700888, 8);
    expect(pmt(0.08 / 12, 10, 10000)).toBeCloseTo(-1037.0320893, 6);
    expect(pmt(0.08 / 12, 10, 10000, 0, 1)).toBeCloseTo(-1030.1643271, 6);
    expect(pmt(0.06 / 12, 18 * 12, 0, 50000)).toBeCloseTo(-129.0811609, 6);
    expect(pmt(0, 10, 1000)).toBeCloseTo(-100, 12);
  });
  it("PV / FV / NPER", () => {
    expect(pv(0.08 / 12, 12 * 20, 500, 0, 0)).toBeCloseTo(-59777.14585, 4);
    expect(fv(0.06 / 12, 10, -200, -500, 1)).toBeCloseTo(2581.403374, 5);
    expect(fv(0.12 / 12, 12, -1000)).toBeCloseTo(12682.50301, 5);
    expect(nper(0.12 / 12, -100, -1000, 10000, 1)).toBeCloseTo(59.67386567, 7);
    expect(nper(0.12 / 12, -100, -1000, 10000)).toBeCloseTo(60.08212285, 7);
    expect(nper(0.12 / 12, -100, -1000)).toBeCloseTo(-9.57859404, 7);
    // round trip
    const p = pmt(0.07, 15, 25000, 1000, 1);
    expect(pv(0.07, 15, p, 1000, 1)).toBeCloseTo(25000, 8);
    expect(nper(0.07, p, 25000, 1000, 1)).toBeCloseTo(15, 9);
  });
  it("EFFECT / NOMINAL / Fisher / WACC / CAPM", () => {
    expect(effectiveRate(0.0525, 4)).toBeCloseTo(0.053542667, 9);
    expect(nominalRate(0.053543, 4)).toBeCloseTo(0.0525003199, 9);
    expect(nominalRate(effectiveRate(0.18, 12), 12)).toBeCloseTo(0.18, 12);
    expect(realRate(0.1, 0.05)).toBeCloseTo(1.1 / 1.05 - 1, 14);
    expect(wacc({ equity: 60, debt: 40, costEquity: 0.15, costDebt: 0.1, taxRate: 0.3 })).toBeCloseTo(0.6 * 0.15 + 0.4 * 0.07, 14);
    expect(capm({ riskFree: 0.04, beta: 1.2, marketReturn: 0.1, countryRisk: 0.03 })).toBeCloseTo(0.142, 14);
  });
});

describe("discounted cash flow", () => {
  it("NPV vs Excel NPV", () => {
    expect(excelNpv(0.1, [-10000, 3000, 4200, 6800])).toBeCloseTo(1188.443412, 5);
    expect(excelNpv(0.08, [8000, 9200, 10000, 12000, 14500]) - 40000).toBeCloseTo(1922.061555, 5);
    expect(npv(0.1, [-100, 110])).toBeCloseTo(0, 12);
    expect(npv(0.1, [-10000, 3000, 4200, 6800])).toBeCloseTo(1188.443412 * 1.1, 4);
  });
  it("IRR (Excel examples)", () => {
    expect(irr([-100, 39, 59, 55, 20])).toBeCloseTo(0.280948421, 8);
    expect(irr([-70000, 12000, 15000, 18000, 21000, 26000])).toBeCloseTo(0.086630948, 8);
    expect(irr([-70000, 12000, 15000, 18000, 21000])).toBeCloseTo(-0.021244848, 8);
    expect(irr([-70000, 12000, 15000], -0.1)).toBeCloseTo(-0.4435069413, 9);
    expect(irr([100, 200])).toBeNaN();
    expect(irr([-100, -200])).toBeNaN();
  });
  it("IRR falls back when Newton diverges", () => {
    // Newton from a terrible guess still finds the root via the grid scan.
    expect(irr([-100, 39, 59, 55, 20], 50)).toBeCloseTo(0.280948421, 8);
    // Long horizon with huge early outflow.
    const cf = [-1e6, ...new Array(30).fill(90000)];
    expect(npv(irr(cf), cf)).toBeCloseTo(0, 4);
  });
  it("allIrrs finds multiple roots", () => {
    // (1+r)^-1 roots at 10% and 20%: -100 + 230/(1+r) - 132/(1+r)^2
    const roots = allIrrs([-100, 230, -132]);
    expect(roots).toHaveLength(2);
    expect(roots[0]).toBeCloseTo(0.1, 9);
    expect(roots[1]).toBeCloseTo(0.2, 9);
    expect(allIrrs([-100, 39, 59, 55, 20])).toHaveLength(1);
  });
  it("MIRR (Excel examples)", () => {
    const cf = [-120000, 39000, 30000, 21000, 37000, 46000];
    expect(mirr(cf, 0.1, 0.12)).toBeCloseTo(0.1260941304, 9);
    expect(mirr(cf, 0.1, 0.14)).toBeCloseTo(0.1347591108, 9);
    expect(mirr(cf.slice(0, 4), 0.1, 0.12)).toBeCloseTo(-0.0480446552, 9);
  });
  it("XNPV / XIRR (Excel examples)", () => {
    const values = [-10000, 2750, 4250, 3250, 2750];
    const dates = [
      new Date(2008, 0, 1),
      new Date(2008, 2, 1),
      new Date(2008, 9, 30),
      new Date(2009, 1, 15),
      new Date(2009, 3, 1),
    ];
    expect(xnpv(0.09, values, dates)).toBeCloseTo(2086.647602, 5);
    expect(xirr(values, dates)).toBeCloseTo(0.373362535, 8);
  });
  it("payback periods", () => {
    expect(paybackPeriod([-1000, 300, 400, 500])).toBeCloseTo(2.6, 12);
    expect(paybackPeriod([-1000, 500, 500])).toBeCloseTo(2, 12);
    expect(paybackPeriod([-1000, 100, 100])).toBe(Infinity);
    expect(paybackPeriod([100, 100])).toBe(0);
    const d = discountedPaybackPeriod(0.1, [-1000, 500, 500, 500]);
    // discounted: 454.545, 413.223 (cum -132.23), 375.657
    expect(d).toBeCloseTo(2 + 132.2314 / 375.6574, 4);
  });
  it("PI, B/C, EAA, indicators", () => {
    const cf = [-1000, 500, 500, 500];
    const v = npv(0.1, cf);
    expect(profitabilityIndex(0.1, cf)).toBeCloseTo(1 + v / 1000, 12);
    expect(benefitCostRatio(0.1, [0, 500, 500, 500], [1000, 0, 0, 0])).toBeCloseTo(1 + v / 1000, 12);
    expect(equivalentAnnualAnnuity(0.1, cf)).toBeCloseTo(-pmt(0.1, 3, v), 10);
    const ind = projectIndicators(cf, 0.1);
    expect(ind.npv).toBeCloseTo(v, 12);
    expect(npv(ind.irr, cf)).toBeCloseTo(0, 8);
    expect(ind.mirr).toBeCloseTo(mirr(cf, 0.1, 0.1), 12);
    expect(ind.payback).toBeCloseTo(2, 12);
  });
});

describe("loans & depreciation", () => {
  it("french schedule", () => {
    const s = amortizationSchedule({ principal: 100000, rate: 0.1 / 12, periods: 360, method: "french" });
    expect(s).toHaveLength(361);
    expect(s[0].balance).toBe(100000);
    expect(s[1].payment).toBeCloseTo(877.5715700888, 8);
    expect(s[1].interest).toBeCloseTo(833.333333, 5);
    expect(s[360].balance).toBe(0);
    expect(sum(s.map((r) => r.principal))).toBeCloseTo(100000, 6);
    for (const r of s.slice(1)) expect(r.payment).toBeCloseTo(877.5715700888, 6);
  });
  it("german & american schedules", () => {
    const g = amortizationSchedule({ principal: 1000, rate: 0.1, periods: 4, method: "german" });
    expect(g.map((r) => r.principal).slice(1)).toEqual([250, 250, 250, 250]);
    expect(g.map((r) => r.interest).slice(1)).toEqual([100, 75, 50, 25].map((x) => expect.closeTo(x, 10)));
    expect(g[4].balance).toBe(0);
    const a = amortizationSchedule({ principal: 1000, rate: 0.1, periods: 3, method: "american" });
    expect(a.map((r) => r.payment).slice(1)).toEqual([100, 100, 1100].map((x) => expect.closeTo(x, 10)));
    expect(a[3].balance).toBe(0);
  });
  it("depreciation methods (Excel SLN / SYD / DB / VDB)", () => {
    expect(depreciation({ cost: 30000, salvage: 7500, life: 10, method: "straightLine" })[0]).toBeCloseTo(2250, 10);
    const syd = depreciation({ cost: 30000, salvage: 7500, life: 10, method: "sumOfYears" });
    expect(syd[0]).toBeCloseTo(4090.909091, 5);
    expect(syd[9]).toBeCloseTo(409.0909091, 6);
    const db = depreciation({ cost: 1000000, salvage: 100000, life: 6, method: "decliningBalance" });
    expect(db[0]).toBeCloseTo(319000, 6);
    expect(db[1]).toBeCloseTo(217239, 6);
    const ddb = depreciation({ cost: 2400, salvage: 300, life: 10, method: "doubleDeclining" });
    expect(ddb[0]).toBeCloseTo(480, 10);
    expect(ddb[1]).toBeCloseTo(384, 10);
    expect(sum(ddb)).toBeCloseTo(2100, 8); // fully depreciated to salvage (VDB switch)
    const units = depreciation({ cost: 1100, salvage: 100, life: 0, method: "units", units: [100, 300, 600] });
    expect(units).toEqual([100, 300, 600].map((x) => expect.closeTo(x, 10)));
  });
});

describe("break-even & scenarios", () => {
  it("Brent break-even", () => {
    expect(breakEven((x) => x * x, 2, 0, 5)).toBeCloseTo(Math.SQRT2, 10);
    const cf = (price: number) => npv(0.12, [-1000, ...new Array(5).fill(price * 100 - 150)]);
    const p = breakEven(cf, 0, 0, 100);
    expect(cf(p)).toBeCloseTo(0, 6);
    expect(breakEven((x) => x, 10, 0, 5)).toBeNaN();
  });
  it("accounting break-even", () => {
    expect(accountingBreakEven({ fixedCosts: 10000, pricePerUnit: 50, variableCostPerUnit: 30 })).toEqual({ units: 500, revenue: 25000 });
    expect(accountingBreakEven({ fixedCosts: 10, pricePerUnit: 5, variableCostPerUnit: 6 }).units).toBe(Infinity);
  });
  it("scenario analysis", () => {
    const r = scenarioAnalysis([
      { name: "pessimistic", probability: 0.25, value: -100 },
      { name: "base", probability: 0.5, value: 200 },
      { name: "optimistic", probability: 0.25, value: 400 },
    ]);
    expect(r.expected).toBeCloseTo(175, 12);
    const v = 0.25 * 275 ** 2 + 0.5 * 25 ** 2 + 0.25 * 225 ** 2;
    expect(r.stdDev).toBeCloseTo(Math.sqrt(v), 10);
    expect(r.cv).toBeCloseTo(Math.sqrt(v) / 175, 10);
  });
});

describe("project cash flow", () => {
  const base: ProjectInputs = {
    horizon: 5,
    investment: 100000,
    workingCapital: 20000,
    salvageValue: 30000,
    units: [1000, 1100, 1200, 1300, 1400],
    price: [100],
    variableCost: [40],
    fixedCosts: [20000],
    depreciationMethod: "straightLine",
    depreciableLife: 10,
    taxRate: 0.3,
    discountRate: 0.12,
  };
  const rowOf = (t: ReturnType<typeof buildProjectCashFlow>, key: string) => t.rows.find((r) => r.key === key)!.values;

  it("rows satisfy the accounting identities", () => {
    const t = buildProjectCashFlow(base);
    expect(t.equityCashFlow).toBeNull();
    for (const r of t.rows) expect(r.values).toHaveLength(6);
    expect(t.rows[0].label.es).toBe("Ingresos");
    const g = (k: string) => rowOf(t, k);
    for (let i = 0; i <= 5; i++) {
      expect(g("ebt")[i]).toBeCloseTo(g("revenue")[i] + g("variableCosts")[i] + g("fixedCosts")[i] + g("depreciation")[i], 8);
      expect(g("netIncome")[i]).toBeCloseTo(g("ebt")[i] + g("taxes")[i], 8);
      const fcf =
        g("netIncome")[i] + g("depreciationAddBack")[i] + g("investment")[i] + g("workingCapital")[i] + g("salvageValue")[i] + g("salvageTax")[i];
      expect(t.freeCashFlow[i]).toBeCloseTo(fcf, 8);
      expect(g("taxes")[i]).toBeLessThanOrEqual(0);
    }
    // Year 1: revenue 100000, VC 40000, FC 20000, dep 10000 → EBT 30000, tax 9000, NI 21000, FCF 31000
    expect(t.freeCashFlow[1]).toBeCloseTo(31000, 8);
    expect(t.freeCashFlow[0]).toBeCloseTo(-120000, 8);
    // Book value at year 5 = 50000; salvage 30000 → loss 20000 → tax credit 6000. WC recovered.
    expect(g("salvageTax")[5]).toBeCloseTo(6000, 8);
    expect(sum(g("workingCapital"))).toBeCloseTo(0, 8);
    // Year 5: EBT = 140000 − 56000 − 20000 − 10000 = 54000 → NI 37800 + 10000 + 20000 + 30000 + 6000
    expect(t.freeCashFlow[5]).toBeCloseTo(103800, 8);
  });

  it("tax-loss carryforward: no negative taxes, losses offset later profits", () => {
    const t = buildProjectCashFlow({ ...base, units: [100, 2000], horizon: 2, depreciableLife: 2 });
    const ebt = rowOf(t, "ebt");
    const taxes = rowOf(t, "taxes");
    // Year 1: 10000 − 4000 − 20000 − 50000 = −64000 → tax 0; year 2: 200000 − 80000 − 20000 − 50000 = 50000 → loss absorbs all
    expect(ebt[1]).toBeCloseTo(-64000, 8);
    expect(taxes[1]).toBe(0);
    expect(ebt[2]).toBeCloseTo(50000, 8);
    expect(taxes[2]).toBeCloseTo(0, 8);
    const t2 = buildProjectCashFlow({ ...base, units: [100, 3000], horizon: 2, depreciableLife: 2 });
    // year 2 EBT = 300000 − 120000 − 20000 − 50000 = 110000 → taxable 46000 → tax 13800
    expect(rowOf(t2, "taxes")[2]).toBeCloseTo(-13800, 8);
  });

  it("equity cash flow with loan: balances to zero, tax shield, NPV identity", () => {
    for (const method of ["french", "german", "american"] as const) {
      const t = buildProjectCashFlow({ ...base, loan: { amount: 60000, rate: 0.1, periods: 5, method } });
      const eq = t.equityCashFlow!;
      expect(eq).not.toBeNull();
      expect(sum(rowOf(t, "principalRepayment"))).toBeCloseTo(-60000, 6);
      expect(eq[0]).toBeCloseTo(t.freeCashFlow[0] + 60000, 8);
      const shield = rowOf(t, "interestTaxShield");
      const interest = rowOf(t, "interest");
      // Project is profitable every year, so shield = tax × interest.
      for (let i = 1; i <= 5; i++) expect(shield[i]).toBeCloseTo(-0.3 * interest[i], 8);
      for (let i = 0; i <= 5; i++) {
        expect(eq[i]).toBeCloseTo(
          t.freeCashFlow[i] + rowOf(t, "loanProceeds")[i] + interest[i] + shield[i] + rowOf(t, "principalRepayment")[i],
          8,
        );
      }
      // Debt flows discounted at the after-tax cost of debt have zero NPV → NPV(equity) = NPV(FCF) at kd(1−t).
      const kd = 0.1 * 0.7;
      expect(npv(kd, eq)).toBeCloseTo(npv(kd, t.freeCashFlow), 6);
    }
  });

  it("loan longer than horizon is repaid at the end", () => {
    const t = buildProjectCashFlow({ ...base, loan: { amount: 50000, rate: 0.08, periods: 10, method: "french" } });
    expect(sum(rowOf(t, "principalRepayment"))).toBeCloseTo(-50000, 6);
  });

  it("indicators on the free cash flow", () => {
    const t = buildProjectCashFlow(base);
    const ind = projectIndicators(t.freeCashFlow, base.discountRate);
    expect(ind.npv).toBeGreaterThan(0);
    expect(ind.irr).toBeGreaterThan(0.12);
    expect(ind.payback).toBeGreaterThan(2);
    expect(ind.payback).toBeLessThan(5);
  });
});

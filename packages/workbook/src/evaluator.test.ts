import { describe, expect, it } from "vitest";
import { emptyModel } from "@openrisksim/core";
import type { RiskModel } from "@openrisksim/core";
import { colToLetters } from "./address";
import { SpreadsheetEngine } from "./engine";
import { createWorkbookEvaluator } from "./evaluator";
import type { CellData, WorkbookData } from "./types";

const S = "Flujo de caja";

function npvWorkbook(): WorkbookData {
  return {
    model: null,
    sheets: [
      {
        name: S,
        rows: 3,
        cols: 6,
        cells: {
          A1: { v: 0.1 }, // rate (assumption)
          B1: { v: -1000 }, // investment (assumption)
          C1: { v: 400 }, // year-1 flow (assumption)
          D1: { f: "C1" },
          E1: { v: 400 },
          F1: { f: "B1+NPV(A1,C1,D1*0+400,E1)" },
          G1: { f: "IRR((B1,C1,E1,E1))" },
          A2: { f: "ORS.NORMAL(10,2)" },
          B2: { f: "A2*2" },
          C2: { v: 3 }, // decision
          D2: { f: "C2*B2" },
          E2: { f: 'IF(A1>0.5,"x",1/A1)' },
        },
      },
    ],
  };
}

function npvModel(): RiskModel {
  const m = emptyModel();
  const a = (id: string, address: string) => ({ id, name: id, cell: { sheet: S, address }, enabled: true, distribution: { id: "normal" as const, params: { mean: 0, stdDev: 1 } } });
  m.assumptions = [a("rate", "A1"), a("inv", "B1"), { ...a("off", "E1"), enabled: false }, a("cf1", "C1"), a("fx", "A2")];
  m.forecasts = [
    { id: "npv", name: "NPV", cell: { sheet: S, address: "F1" } },
    { id: "d2", name: "D2", cell: { sheet: S, address: "D2" } },
    { id: "e2", name: "E2", cell: { sheet: S, address: "E2" } },
  ];
  return m;
}

const handNpv = (r: number, inv: number, cf1: number) => inv + cf1 / (1 + r) + 400 / (1 + r) ** 2 + 400 / (1 + r) ** 3;

describe("createWorkbookEvaluator", () => {
  it("matches a hand-computed NPV, maps errors/text to NaN and restores cells", () => {
    const engine = SpreadsheetEngine.fromWorkbook(npvWorkbook());
    const ev = createWorkbookEvaluator(engine, npvModel(), { decisions: [{ ref: { sheet: S, address: "C2" }, value: 5 }] });
    expect(Array.from(ev.baseInputs())).toEqual([0.1, -1000, 400, 10]);
    const out = ev.evaluate(new Float64Array([0.08, -1200, 500, 7]));
    expect(out[0]).toBeCloseTo(handNpv(0.08, -1200, 500), 9);
    expect(out[1]).toBe(5 * 14);
    expect(out[2]).toBeCloseTo(1 / 0.08, 12);
    const out2 = ev.evaluate(new Float64Array([0.9, -1000, 400, 10]));
    expect(out2[0]).toBeCloseTo(handNpv(0.9, -1000, 400), 9);
    expect(Number.isNaN(out2[2])).toBe(true); // text → NaN
    const out3 = ev.evaluate(new Float64Array([0, -1000, 400, 10]));
    expect(out3[0]).toBeCloseTo(handNpv(0, -1000, 400), 9);
    ev.dispose();
    expect(engine.getFormula({ sheet: S, address: "A2" })).toBe("=ORS.NORMAL(10,2)");
    expect(engine.getValue({ sheet: S, address: "C2" })).toBe(3);
    expect(engine.getValue({ sheet: S, address: "F1" })).toBeCloseTo(handNpv(0.1, -1000, 400), 9);
    expect(() => ev.evaluate(new Float64Array(4))).toThrow();
    engine.destroy();
  });

  it("does not pollute undo history or fire change events during trials", () => {
    const engine = SpreadsheetEngine.fromWorkbook(npvWorkbook());
    engine.setCell({ sheet: S, address: "E1" }, 500);
    let events = 0;
    engine.onChange(() => events++);
    const ev = createWorkbookEvaluator(engine, npvModel());
    for (let i = 0; i < 50; i++) ev.evaluate(new Float64Array([0.05 + i / 1000, -1000, 400, 10]));
    ev.dispose();
    expect(events).toBe(0);
    expect(engine.getValue({ sheet: S, address: "A1" })).toBe(0.1);
    engine.undo();
    expect(engine.getValue({ sheet: S, address: "E1" })).toBe(400);
    engine.redo();
    expect(engine.getValue({ sheet: S, address: "E1" })).toBe(500);
    engine.destroy();
  });

  it("is fast on a ~200-formula project model", () => {
    // 20-year project: 10 formula rows × 20 columns = 200 formulas + NPV/IRR.
    const cells: Record<string, CellData> = {
      A1: { v: 1000 }, A2: { v: 25 }, A3: { v: 12 }, A4: { v: 5000 }, A5: { v: 0.1 }, A6: { v: 0.03 }, A7: { v: 0.25 }, A8: { v: 60000 },
    };
    const years = 20;
    for (let y = 0; y < years; y++) {
      const c = colToLetters(2 + y);
      const p = colToLetters(1 + y);
      cells[`${c}1`] = { f: y === 0 ? "$A$1" : `${p}1*(1+$A$6)` };
      cells[`${c}2`] = { f: y === 0 ? "$A$2" : `${p}2*(1+$A$6/2)` };
      cells[`${c}3`] = { f: `${c}1*${c}2` };
      cells[`${c}4`] = { f: `-${c}1*$A$3` };
      cells[`${c}5`] = { f: `-$A$4` };
      cells[`${c}6`] = { f: `-$A$8/${years}` };
      cells[`${c}7`] = { f: `SUM(${c}3:${c}6)` };
      cells[`${c}8`] = { f: `-MAX(0,${c}7)*$A$7` };
      cells[`${c}9`] = { f: `${c}7+${c}8-${c}6` };
      cells[`${c}10`] = { f: `${c}9/(1+$A$5)^${y + 1}` };
    }
    const last = colToLetters(1 + years);
    cells.A12 = { f: `-A8+SUM(C10:${last}10)` };
    cells.A13 = { f: `-A8+NPV(A5,C9:${last}9)` };
    const engine = SpreadsheetEngine.fromWorkbook({ model: null, sheets: [{ name: "P", rows: 13, cols: 22, cells }] });
    const m = emptyModel();
    ["A1", "A2", "A3", "A4", "A5"].forEach((address, i) =>
      m.assumptions.push({ id: `a${i}`, name: address, cell: { sheet: "P", address }, enabled: true, distribution: { id: "fixed", params: { value: 0 } } }),
    );
    m.forecasts = [
      { id: "f1", name: "npv", cell: { sheet: "P", address: "A12" } },
      { id: "f2", name: "npv2", cell: { sheet: "P", address: "A13" } },
    ];
    const ev = createWorkbookEvaluator(engine, m);
    const inputs = new Float64Array(5);
    const base = ev.baseInputs();
    const N = 3000;
    // warm-up
    for (let i = 0; i < 200; i++) ev.evaluate(base);
    const t0 = performance.now();
    let check = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < 5; j++) inputs[j] = base[j] * (0.9 + 0.2 * ((i * 7 + j * 13) % 100) / 100);
      const out = ev.evaluate(inputs);
      check += out[0] - out[1];
    }
    const ms = performance.now() - t0;
    const rate = (N / ms) * 1000;
    console.log(`[evaluator] ${N} trials in ${ms.toFixed(0)} ms → ${rate.toFixed(0)} trials/s (200-formula model)`);
    expect(Math.abs(check)).toBeLessThan(1e-3 * N);
    expect(rate).toBeGreaterThan(1000);
    ev.dispose();
    engine.destroy();
  });
});

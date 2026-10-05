import { afterEach, describe, expect, it } from "vitest";
import { HyperFormula } from "hyperformula";
import { SpreadsheetEngine } from "./engine";
import type { WorkbookData } from "./types";

const wb = (): WorkbookData => ({
  model: null,
  fileName: "t.xlsx",
  sheets: [
    {
      name: "Evaluación",
      rows: 5,
      cols: 3,
      colWidths: { 0: 20 },
      merges: ["A5:C5"],
      cells: {
        A1: { v: 5, t: "n", z: "0.00", s: { bold: true } },
        B1: { f: "A1*2", v: 10, t: "n" },
        C1: { v: "12", t: "s" },
        A2: { v: "=not a formula", t: "s" },
        B2: { f: "1/0" },
        C2: { f: "DATE(2024,1,1)" },
      },
    },
    { name: "Hoja 2", rows: 1, cols: 1, cells: { A1: { f: "Evaluación!B1+'Evaluación'!A1" } } },
  ],
});

let engine: SpreadsheetEngine | null = null;
afterEach(() => {
  engine?.destroy();
  engine = null;
});

describe("SpreadsheetEngine", () => {
  it("evaluates formulas across sheets with spaces/accents and keeps strings as text", () => {
    engine = SpreadsheetEngine.fromWorkbook(wb());
    expect(engine.sheetNames()).toEqual(["Evaluación", "Hoja 2"]);
    expect(engine.getValue({ sheet: "Evaluación", address: "B1" })).toBe(10);
    expect(engine.getValue({ sheet: "Hoja 2", address: "A1" })).toBe(15);
    expect(engine.getValue({ sheet: "Evaluación", address: "C1" })).toBe("12");
    expect(engine.getValue({ sheet: "Evaluación", address: "A2" })).toBe("=not a formula");
    expect(engine.getValue({ sheet: "Evaluación", address: "B2" })).toEqual({ error: "#DIV/0!" });
    expect(engine.getValue({ sheet: "Evaluación", address: "C2" })).toBe(45292); // Excel serial
    expect(engine.getValue({ sheet: "Evaluación", address: "D9" })).toBeNull();
    expect(engine.getFormula({ sheet: "Evaluación", address: "B1" })).toBe("=A1*2");
    expect(engine.getFormula({ sheet: "Evaluación", address: "A1" })).toBeNull();
  });

  it("sets cells, ranges, emits change events and supports undo/redo", () => {
    engine = SpreadsheetEngine.fromWorkbook(wb());
    const changes: string[][] = [];
    const off = engine.onChange((refs) => changes.push(refs.map((r) => `${r.sheet}!${r.address}`)));
    engine.setCell({ sheet: "Evaluación", address: "a1" }, 7);
    expect(engine.getValue({ sheet: "Hoja 2", address: "A1" })).toBe(21);
    expect(changes.at(-1)).toEqual(expect.arrayContaining(["Evaluación!A1", "Evaluación!B1", "Hoja 2!A1"]));
    engine.setCell({ sheet: "Evaluación", address: "C3" }, "=SUM(A1:B1)");
    expect(engine.getValue({ sheet: "Evaluación", address: "C3" })).toBe(21);
    engine.undo();
    expect(engine.getValue({ sheet: "Evaluación", address: "C3" })).toBeNull();
    engine.undo();
    expect(engine.getValue({ sheet: "Evaluación", address: "A1" })).toBe(5);
    engine.redo();
    expect(engine.getValue({ sheet: "Evaluación", address: "A1" })).toBe(7);
    engine.setRangeValues("Evaluación", "D1", [[1, 2], [3, "=D1+E1+D2"]]);
    expect(engine.getRangeValues("Evaluación", "D1:E2")).toEqual([[1, 2], [3, 6]]);
    expect(engine.getRangeValues("Evaluación", "B2")).toEqual([["#DIV/0!"]]);
    off();
    const n = changes.length;
    engine.setCell({ sheet: "Evaluación", address: "A1" }, 1);
    expect(changes.length).toBe(n);
  });

  it("adds sheets and serialises back to WorkbookData keeping formats", () => {
    engine = SpreadsheetEngine.fromWorkbook(wb());
    engine.addSheet("Informe nuevo");
    engine.addSheet("Informe nuevo"); // no-op
    engine.setRangeValues("Informe nuevo", "B2", [["x", 1]]);
    const out = engine.toWorkbookData(null);
    expect(out.fileName).toBe("t.xlsx");
    expect(out.sheets.map((s) => s.name)).toEqual(["Evaluación", "Hoja 2", "Informe nuevo"]);
    const s = out.sheets[0];
    expect(s.cells.A1).toEqual({ v: 5, t: "n", z: "0.00", s: { bold: true } });
    expect(s.cells.B1).toEqual({ f: "A1*2", v: 10, t: "n" });
    expect(s.cells.C1).toEqual({ v: "12", t: "s" });
    expect(s.cells.B2).toEqual({ f: "1/0", v: "#DIV/0!", t: "e" });
    expect(s.colWidths).toEqual({ 0: 20 });
    expect(s.merges).toEqual(["A5:C5"]);
    expect(s.rows).toBe(5);
    expect(out.sheets[1].cells.A1.f).toBe("Evaluación!B1+Evaluación!A1");
    expect(out.sheets[2].cells.C2).toEqual({ v: 1, t: "n" });
    // round trip through a second engine gives the same values
    const e2 = SpreadsheetEngine.fromWorkbook(out);
    expect(e2.getValue({ sheet: "Hoja 2", address: "A1" })).toBe(15);
    expect(e2.getValue({ sheet: "Evaluación", address: "C1" })).toBe("12");
    e2.destroy();
  });

  it("does not serialise spilled array values as constants", () => {
    engine = SpreadsheetEngine.fromWorkbook({ model: null, sheets: [{ name: "S", rows: 1, cols: 1, cells: { A1: { f: "SEQUENCE(3)" }, B1: { f: "SUM(A1:A3)" } } }] });
    expect(engine.getValue({ sheet: "S", address: "A3" })).toBe(3);
    const out = engine.toWorkbookData(null);
    expect(out.sheets[0].cells.A2).toBeUndefined();
    const e2 = SpreadsheetEngine.fromWorkbook(out);
    expect(e2.getValue({ sheet: "S", address: "B1" })).toBe(6);
    e2.destroy();
  });

  it("supports defined names", () => {
    const w = wb();
    w.names = { Tasa: "Evaluación!$A$1" };
    w.sheets[0].cells.C4 = { f: "Tasa*100" };
    engine = SpreadsheetEngine.fromWorkbook(w);
    expect(engine.getValue({ sheet: "Evaluación", address: "C4" })).toBe(500);
    expect(engine.toWorkbookData(null).names).toEqual({ Tasa: "Evaluación!$A$1" });
  });
});

describe("ORS functions", () => {
  it("distribution functions return the mean and validate parameters", () => {
    engine = SpreadsheetEngine.fromWorkbook({
      model: null,
      sheets: [
        {
          name: "S",
          rows: 1,
          cols: 1,
          cells: {
            A1: { f: "ORS.NORMAL(10,2)" },
            A2: { f: "ORS.TRIANGULAR(1,2,6)" },
            A3: { f: "ORS.UNIFORM(2,4)" },
            A4: { f: "ORS.PERT(1,4,13)" },
            A5: { f: "ORS.LOGNORMAL(5,1)" },
            A6: { f: "ORS.TRIANGULAR(3,2,1)" },
            A7: { f: "ors.normal(1,-1)" },
            B1: { v: -100 }, B2: { v: 30 }, B3: { v: 40 }, B4: { v: 50 }, B5: { v: 60 },
            C1: { f: "ORS.PAYBACK(B1:B5)" },
            C2: { f: "ORS.DPAYBACK(0.1,B1:B5)" },
            C3: { f: "ORS.PI(0.1,B1:B5)" },
            C4: { f: "ORS.MIRR(B1:B5,0.1,0.12)" },
            C5: { f: "MIRR(B1:B5,0.1,0.12)" },
            C6: { f: "ORS.PAYBACK(B1:B2)" },
          },
        },
      ],
    });
    const v = (a: string) => engine!.getValue({ sheet: "S", address: a });
    expect(v("A1")).toBe(10);
    expect(v("A2")).toBe(3);
    expect(v("A3")).toBe(3);
    expect(v("A4")).toBe(5);
    expect(v("A5")).toBe(5);
    expect(v("A6")).toEqual({ error: "#NUM!" });
    expect(v("A7")).toEqual({ error: "#NUM!" });
    expect(v("C1")).toBeCloseTo(2 + 30 / 50, 8);
    expect(v("C2") as number).toBeGreaterThan(2.6);
    const pvIn = 30 / 1.1 + 40 / 1.21 + 50 / 1.331 + 60 / 1.4641;
    expect(v("C3")).toBeCloseTo(pvIn / 100, 6);
    expect(v("C4") as number).toBeCloseTo(v("C5") as number, 8);
    expect(v("C6")).toEqual({ error: "#NUM!" });
  });

  it("registers Spanish translations", () => {
    expect(HyperFormula.getRegisteredFunctionNames("esES")).toEqual(expect.arrayContaining(["ORS.UNIFORME", "ORS.TIRM"]));
  });
});

describe("detectRiskFunctions", () => {
  it("turns literal ORS distribution calls into assumptions", async () => {
    const { detectRiskFunctions } = await import("./riskFunctions");
    const found = detectRiskFunctions({
      model: null,
      sheets: [{ name: "Mi hoja", rows: 1, cols: 3, cells: { A1: { f: "ORS.TRIANGULAR(1, 2.5, 4)" }, B1: { f: "ORS.NORMAL(A1,2)" }, C1: { f: "ors.uniform(-1,1e2)" } } }],
    });
    expect(found.map((a) => [a.cell.address, a.distribution])).toEqual([
      ["A1", { id: "triangular", params: { min: 1, mode: 2.5, max: 4 } }],
      ["C1", { id: "uniform", params: { min: -1, max: 100 } }],
    ]);
  });
});

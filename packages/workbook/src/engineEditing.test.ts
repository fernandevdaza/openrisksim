import { afterEach, describe, expect, it } from "vitest";
import { SpreadsheetEngine } from "./engine";
import { HF_FUNCTION_NAMES_ES, registeredFunctionNames } from "./functionNames";
import type { WorkbookData } from "./types";

const wb = (): WorkbookData => ({
  model: null,
  sheets: [
    { name: "Hoja 1", rows: 6, cols: 3, cells: { A1: { v: 1 }, A2: { v: 2 }, A3: { v: 3 }, B1: { f: "A1*2" }, C1: { f: "$A$1+A1" } } },
    { name: "Datos", rows: 1, cols: 2, cells: { A1: { f: "'Hoja 1'!A1+1" } } },
  ],
});

let engine: SpreadsheetEngine | null = null;
afterEach(() => {
  engine?.destroy();
  engine = null;
});
const v = (sheet: string, address: string) => engine!.getValue({ sheet, address });
const f = (sheet: string, address: string) => engine!.getFormula({ sheet, address });

describe("SpreadsheetEngine editing helpers", () => {
  it("fills formulas with relative references shifted and absolute ones kept", () => {
    engine = SpreadsheetEngine.fromWorkbook(wb());
    const data = engine.fillData("Hoja 1", "B1:C1", "B2:C3");
    expect(data).toEqual([
      ["=A2*2", "=$A$1+A2"],
      ["=A3*2", "=$A$1+A3"],
    ]);
    engine.batch(() => engine!.setRangeRaw("Hoja 1", "B2", data));
    expect(v("Hoja 1", "B3")).toBe(6);
    expect(v("Hoja 1", "C3")).toBe(4);
    engine.undo(); // one step
    expect(v("Hoja 1", "B2")).toBeNull();
    expect(v("Hoja 1", "B3")).toBeNull();
  });

  it("serialises ranges keeping forced text", () => {
    engine = SpreadsheetEngine.fromWorkbook({ model: null, sheets: [{ name: "S", rows: 1, cols: 2, cells: { A1: { v: "12", t: "s" }, B1: { f: "A1&\"x\"" } } }] });
    expect(engine.getRangeSerialized("S", "A1:B1")).toEqual([["'12", '=A1&"x"']]);
  });

  it("copies/pastes across sheets with adjustment and moves cells updating dependents", () => {
    engine = SpreadsheetEngine.fromWorkbook(wb());
    engine.copyPaste("Hoja 1", "B1", "Datos", "C3");
    expect(f("Datos", "C3")).toBe("=B3*2");
    expect(engine.moveRange("Hoja 1", "A1", "Hoja 1", "E1")).toBe(true);
    expect(f("Hoja 1", "B1")).toBe("=E1*2");
    expect(f("Datos", "A1")).toBe("='Hoja 1'!E1+1");
    expect(v("Datos", "A1")).toBe(2);
  });

  it("validates and calculates formulas without writing them", () => {
    engine = SpreadsheetEngine.fromWorkbook(wb());
    expect(engine.validateFormula("=SUM(A1:A3)")).toBe(true);
    expect(engine.validateFormula("=SUM(A1:A3")).toBe(false);
    expect(engine.validateFormula("=1+")).toBe(false);
    expect(engine.calculate("=SUM(A1:A3)", "Hoja 1")).toBe(6);
    expect(engine.calculate("=A1:A2", "Hoja 1")).toEqual([[1], [2]]);
    expect(engine.calculate("=1/0", "Hoja 1")).toEqual({ error: "#DIV/0!" });
  });

  it("reports error details", () => {
    engine = SpreadsheetEngine.fromWorkbook(wb());
    engine.setCell({ sheet: "Hoja 1", address: "D1" }, "=FOO(1)");
    expect(engine.cellError({ sheet: "Hoja 1", address: "D1" })).toMatchObject({ value: "#NAME?", type: "NAME" });
    expect(engine.cellError({ sheet: "Hoja 1", address: "A1" })).toBeNull();
  });

  it("lists precedents and dependents (through ranges)", () => {
    engine = SpreadsheetEngine.fromWorkbook(wb());
    engine.setCell({ sheet: "Hoja 1", address: "D1" }, "=SUM(A1:A3)");
    expect(engine.precedents({ sheet: "Hoja 1", address: "D1" })).toEqual([{ sheet: "Hoja 1", range: "A1:A3" }]);
    const deps = engine.dependents({ sheet: "Hoja 1", address: "A1" }).map((d) => `${d.sheet}!${d.range}`).sort();
    expect(deps).toEqual(["Datos!A1", "Hoja 1!B1", "Hoja 1!C1", "Hoja 1!D1"]);
  });

  it("adds, renames and removes defined names (kept in toWorkbookData)", () => {
    engine = SpreadsheetEngine.fromWorkbook(wb());
    engine.setName("Tasa", "'Hoja 1'!$A$2");
    expect(engine.calculate("=Tasa*10", "Datos")).toBe(20);
    expect(engine.listNames()).toEqual([{ name: "Tasa", formula: "='Hoja 1'!$A$2" }]);
    engine.setName("Tasa", "='Hoja 1'!$A$3");
    expect(engine.calculate("=Tasa", "Datos")).toBe(3);
    expect(engine.toWorkbookData(null).names).toEqual({ Tasa: "'Hoja 1'!$A$3" });
    expect(() => engine!.setName("A1", "=1")).toThrow();
    engine.removeName("tasa");
    expect(engine.listNames()).toEqual([]);
    expect(engine.toWorkbookData(null).names).toEqual({});
  });

  it("exposes engine function names and their Spanish translations", () => {
    const names = registeredFunctionNames();
    expect(names).toEqual(expect.arrayContaining(["SUM", "NPV", "ORS.NORMAL"]));
    expect(HF_FUNCTION_NAMES_ES.NPV).toBe("VNA");
    expect(HF_FUNCTION_NAMES_ES["ORS.MIRR"]).toBe("ORS.TIRM");
  });
});

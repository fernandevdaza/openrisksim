import { describe, expect, it } from "vitest";
import {
  cellToNumber,
  flattenNumbers,
  formatRangeRef,
  autoColumnWidths,
  growthSeries,
  hstackColumns,
  linspace,
  matrixToColumns,
  parseLocaleNumber,
  parseNumberList,
  parseRangeRef,
  parseTable,
  resizeArray,
  topLeftCell,
  uniqueSheetName,
} from "./parse";

describe("parseLocaleNumber", () => {
  it("handles es and en formats", () => {
    expect(parseLocaleNumber("1,5")).toBe(1.5);
    expect(parseLocaleNumber("1.5")).toBe(1.5);
    expect(parseLocaleNumber("1.234,56")).toBeCloseTo(1234.56);
    expect(parseLocaleNumber("1,234.56")).toBeCloseTo(1234.56);
    expect(parseLocaleNumber("1.234.567")).toBe(1234567);
    expect(parseLocaleNumber("1,234,567")).toBe(1234567);
    expect(parseLocaleNumber("-3")).toBe(-3);
    expect(parseLocaleNumber("−3,5")).toBe(-3.5);
    expect(parseLocaleNumber("1e3")).toBe(1000);
  });
  it("handles percent, currency and accounting negatives", () => {
    expect(parseLocaleNumber("12%")).toBeCloseTo(0.12);
    expect(parseLocaleNumber("12,5 %")).toBeCloseTo(0.125);
    expect(parseLocaleNumber("$1.000,50")).toBe(1000.5);
    expect(parseLocaleNumber("1.000")).toBe(1); // a single dot is a decimal point
    expect(parseLocaleNumber("(100)")).toBe(-100);
    expect(parseLocaleNumber("S/ 25,40")).toBeCloseTo(25.4);
  });
  it("rejects text", () => {
    expect(parseLocaleNumber("abc")).toBeNaN();
    expect(parseLocaleNumber("")).toBeNaN();
    expect(parseLocaleNumber("1,2,3")).toBeNaN();
  });
});

describe("parseNumberList", () => {
  it("reads the documented example", () => {
    expect(parseNumberList("1,5\n2;3")).toEqual([1.5, 2, 3]);
  });
  it("accepts tabs, spaces, headers and comma lists", () => {
    expect(parseNumberList("Ventas\n10\t20\n30")).toEqual([10, 20, 30]);
    expect(parseNumberList("1,2,3")).toEqual([1, 2, 3]);
    expect(parseNumberList("1, 2, 3")).toEqual([1, 2, 3]);
    expect(parseNumberList("-1000\r\n300,5\r\n")).toEqual([-1000, 300.5]);
    expect(parseNumberList("")).toEqual([]);
  });
});

describe("tables and columns", () => {
  it("parses tab and semicolon separated tables", () => {
    expect(parseTable("a\tb\n1\t2\n")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseTable("1;2\n3;4")).toEqual([["1", "2"], ["3", "4"]]);
  });
  it("converts cell values", () => {
    expect(cellToNumber(3)).toBe(3);
    expect(cellToNumber("2,5")).toBe(2.5);
    expect(cellToNumber(null)).toBeNaN();
    expect(cellToNumber({ error: "#DIV/0!" })).toBeNaN();
    expect(flattenNumbers([[1, "x"], [null, "2"], [true, 3]])).toEqual([1, 2, 3]);
  });
  it("detects headers and drops incomplete rows", () => {
    const r = matrixToColumns([["Precio", "Ventas"], [10, 100], [11, null], [12, "120"]]);
    expect(r.names).toEqual(["Precio", "Ventas"]);
    expect(r.columns).toEqual([[10, 12], [100, 120]]);
    expect(r.dropped).toBe(1);
    const nh = matrixToColumns([[1, 2], [3, 4]], "auto", "X");
    expect(nh.names).toEqual(["X1", "X2"]);
  });
  it("stacks Y and X ranges with joint listwise deletion", () => {
    const y = [["Ventas"], [100], [110], [null], [130]];
    const x = [["Precio", "Publicidad"], [10, 1], [11, 2], [12, 3], [13, "?"]];
    const r = hstackColumns([y, x], "auto", ["Y", "X"]);
    expect(r.names).toEqual(["Ventas", "Precio", "Publicidad"]);
    expect(r.columns).toEqual([[100, 110], [10, 11], [1, 2]]);
    expect(r.dropped).toBe(2);
    const noHeader = hstackColumns([[[1], [2], [3]], [[4, 5], [6, 7], [8, 9]]], false, ["Y", "X"]);
    expect(noHeader.names).toEqual(["Y", "X2", "X3"]);
  });
});

describe("range references", () => {
  it("parses and formats", () => {
    expect(parseRangeRef("Hoja1!B2:B40")).toEqual({ sheet: "Hoja1", range: "B2:B40" });
    expect(parseRangeRef("'Mi hoja'!$b$2")).toEqual({ sheet: "Mi hoja", range: "B2" });
    expect(parseRangeRef("c5")).toEqual({ sheet: null, range: "C5" });
    expect(parseRangeRef("Hoja1!xyz")).toBeNull();
    expect(formatRangeRef("Hoja1", "A1:A9")).toBe("Hoja1!A1:A9");
    expect(formatRangeRef("Mi hoja", "A1")).toBe("'Mi hoja'!A1");
    expect(formatRangeRef("Año", "A1")).toBe("Año!A1");
    expect(topLeftCell("b2:d9")).toBe("B2");
  });
  it("builds unique sheet names", () => {
    expect(uniqueSheetName("Tornado", ["Hoja1"])).toBe("Tornado");
    expect(uniqueSheetName("Tornado", ["tornado", "Tornado (2)"])).toBe("Tornado (3)");
    expect(uniqueSheetName("a/b:c", [])).toBe("a b c");
    expect(uniqueSheetName("x".repeat(40), []).length).toBe(31);
  });
});

describe("array helpers", () => {
  it("linspace, resize and growth", () => {
    expect(linspace(0, 1, 5)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(linspace(3, 9, 1)).toEqual([3]);
    expect(resizeArray([1, 2], 4)).toEqual([1, 2, 2, 2]);
    expect(resizeArray([1, 2, 3], 2)).toEqual([1, 2]);
    expect(resizeArray([], 2, 7)).toEqual([7, 7]);
    const g = growthSeries(100, 0.1, 3);
    expect(g[0]).toBe(100);
    expect(g[2]).toBeCloseTo(121);
  });
});

describe("autoColumnWidths", () => {
  it("widens label columns, ignoring titles and formulas", () => {
    const w = autoColumnWidths([["A very long title that should be ignored"], ["Utilidad antes de impuestos", 1, "=SUM(B1:B9)"], ["x", 2, "ok"]]);
    expect(w[0]).toBe(27 * 7 + 16);
    expect(w[1]).toBe(0);
    expect(w[2]).toBe(0);
  });
});

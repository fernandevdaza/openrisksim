import { describe, expect, it } from "vitest";
import { colToLetters, lettersToCol, parseA1, parseRange, quoteSheetName, toA1, translateFormula } from "./address";

describe("address helpers", () => {
  it("converts columns both ways", () => {
    expect(colToLetters(0)).toBe("A");
    expect(colToLetters(25)).toBe("Z");
    expect(colToLetters(26)).toBe("AA");
    expect(colToLetters(701)).toBe("ZZ");
    expect(colToLetters(702)).toBe("AAA");
    expect(colToLetters(16383)).toBe("XFD");
    for (const c of [0, 1, 25, 26, 51, 52, 701, 702, 16383]) expect(lettersToCol(colToLetters(c))).toBe(c);
    expect(lettersToCol("ab")).toBe(27);
  });

  it("parses A1 with $ and lowercase", () => {
    expect(parseA1("A1")).toEqual({ row: 0, col: 0 });
    expect(parseA1("$b$7")).toEqual({ row: 6, col: 1 });
    expect(parseA1("aa10")).toEqual({ row: 9, col: 26 });
    expect(parseA1("XFD1048576")).toEqual({ row: 1048575, col: 16383 });
    expect(() => parseA1("A0")).toThrow();
    expect(() => parseA1("1A")).toThrow();
    expect(toA1(6, 1)).toBe("B7");
    expect(toA1(0, 27)).toBe("AB1");
  });

  it("parses ranges (normalised, with sheet prefix)", () => {
    expect(parseRange("B2:D9")).toEqual({ start: { row: 1, col: 1 }, end: { row: 8, col: 3 } });
    expect(parseRange("D9:B2")).toEqual({ start: { row: 1, col: 1 }, end: { row: 8, col: 3 } });
    expect(parseRange("C3")).toEqual({ start: { row: 2, col: 2 }, end: { row: 2, col: 2 } });
    expect(parseRange("'My sheet'!$A$1:$b$2")).toEqual({ start: { row: 0, col: 0 }, end: { row: 1, col: 1 } });
  });

  it("quotes sheet names when needed", () => {
    expect(quoteSheetName("Hoja1")).toBe("Hoja1");
    expect(quoteSheetName("Evaluación")).toBe("Evaluación");
    expect(quoteSheetName("My sheet")).toBe("'My sheet'");
    expect(quoteSheetName("O'Brien")).toBe("'O''Brien'");
  });

  it("translates relative references of shared formulas", () => {
    expect(translateFormula("A1*$B$1+B$2+$C3", 2, 1)).toBe("B3*$B$1+C$2+$C5");
    expect(translateFormula('SUM(A1:A3)&"A1"', 1, 0)).toBe('SUM(A2:A4)&"A1"');
    expect(translateFormula("'Sheet A1'!A1+Hoja2!B2", 1, 1)).toBe("'Sheet A1'!B2+Hoja2!C3");
    expect(translateFormula("LOG10(A1)+ATAN2(B1,1)", 1, 0)).toBe("LOG10(A2)+ATAN2(B2,1)");
    expect(translateFormula("SUM(A:A)+SUM(1:1)", 1, 1)).toBe("SUM(B:B)+SUM(2:2)");
    expect(translateFormula("A1+1.5E3", 1, 0)).toBe("A2+1.5E3");
    expect(translateFormula("A1", -1, 0)).toBe("#REF!");
  });
});

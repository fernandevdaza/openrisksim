import { describe, expect, it } from "vitest";
import { boundsToRange, colLetters, lettersToCol, parseAddress, parseRangeBounds, parseTsv, splitSheetRef, toTsv, addressesIn } from "./a1";

describe("A1 helpers", () => {
  it("columns", () => {
    expect(colLetters(0)).toBe("A");
    expect(colLetters(25)).toBe("Z");
    expect(colLetters(26)).toBe("AA");
    expect(colLetters(701)).toBe("ZZ");
    expect(colLetters(702)).toBe("AAA");
    expect(lettersToCol("AA")).toBe(26);
    expect(lettersToCol("a")).toBe(0);
    expect(lettersToCol("1")).toBe(-1);
  });
  it("addresses and ranges", () => {
    expect(parseAddress("$B$7")).toEqual({ row: 6, col: 1 });
    expect(parseAddress("B0")).toBeNull();
    expect(parseRangeBounds("D9:B2")).toEqual({ r0: 1, c0: 1, r1: 8, c1: 3 });
    expect(boundsToRange({ r0: 1, c0: 1, r1: 1, c1: 1 })).toBe("B2");
    expect(boundsToRange({ r0: 1, c0: 1, r1: 8, c1: 3 })).toBe("B2:D9");
    expect(addressesIn({ r0: 0, c0: 0, r1: 1, c1: 1 })).toEqual(["A1", "B1", "A2", "B2"]);
  });
  it("sheet refs", () => {
    expect(splitSheetRef("'Hoja 1'!$b$2:c3")).toEqual({ sheet: "Hoja 1", range: "B2:C3" });
    expect(splitSheetRef("b5")).toEqual({ sheet: null, range: "B5" });
  });
  it("TSV round trip", () => {
    const m = [["a", "1,5"], ["x\ty", 'say "hi"']];
    expect(parseTsv(toTsv(m))).toEqual(m);
    expect(parseTsv("1\t2\r\n3\t4\r\n")).toEqual([["1", "2"], ["3", "4"]]);
  });
});

import { translateFormulaToEnglish } from "./formulaI18n";
describe("formula translation", () => {
  it("maps Spanish function names", () => {
    expect(translateFormulaToEnglish("=SUMA(A1:A3)+vna(B1,C2:C9)")).toBe("=SUM(A1:A3)+NPV(B1,C2:C9)");
    expect(translateFormulaToEnglish('=SI(A1>0,"SUMA(x)",Y(B1,C1))')).toBe('=IF(A1>0,"SUMA(x)",AND(B1,C1))');
    expect(translateFormulaToEnglish("=Y5*2")).toBe("=Y5*2");
  });
});

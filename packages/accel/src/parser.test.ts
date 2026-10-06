import { describe, expect, it } from "vitest";
import { astToString, parseFormula } from "./parser";

const p = (f: string) => astToString(parseFormula(f));

describe("formula parser", () => {
  it("numbers, strings, booleans and errors", () => {
    expect(p("=1E-3")).toBe("0.001");
    expect(p("=.5")).toBe("0.5");
    expect(p("=2.5e2")).toBe("250");
    expect(p('="a""b"')).toBe('"a\\"b"');
    expect(p("=TRUE")).toBe("TRUE");
    expect(p("=false")).toBe("FALSE");
    expect(p("=#DIV/0!")).toBe("#DIV/0!");
    expect(p("=#n/a")).toBe("#N/A");
  });

  it("Excel precedence: unary minus binds tighter than ^", () => {
    expect(p("=-2^2")).toBe("((-2)^2)");
    expect(p("=2^-2")).toBe("(2^(-2))");
    expect(p("=2*-3^2")).toBe("(2*((-3)^2))");
    expect(p("=-A1^2")).toBe("((-A1)^2)");
  });

  it("percent binds tighter than ^, and ^ is left-associative", () => {
    expect(p("=2^3%")).toBe("(2^(3%))");
    expect(p("=50%*2")).toBe("((50%)*2)");
    expect(p("=2^3^2")).toBe("((2^3)^2)");
    expect(p("=-5%")).toBe("((-5)%)");
  });

  it("arithmetic, concatenation and comparison levels", () => {
    expect(p("=1+2*3")).toBe("(1+(2*3))");
    expect(p("=(1+2)*3")).toBe("((1+2)*3)");
    expect(p("=1-2-3")).toBe("((1-2)-3)");
    expect(p('=1+2&"x"')).toBe('((1+2)&"x")');
    expect(p("=A1+1>=B2*2")).toBe("((A1+1)>=(B2*2))");
    expect(p("=1<>2")).toBe("(1<>2)");
    expect(p("=A1<=B1")).toBe("(A1<=B1)");
  });

  it("references: absolute, ranges and sheets", () => {
    expect(p("=$B$4*(1+B$5)")).toBe("(B4*(1+B5))");
    expect(p("=SUM(C20:C23)")).toBe("SUM(C20:C23)");
    expect(p("=SUM(G1:C3)")).toBe("SUM(C1:G3)");
    expect(p("='Hoja uno'!A1+'It''s'!B2")).toBe("('Hoja uno'!A1+'It's'!B2)");
    expect(p("=Préstamo!B4")).toBe("'Préstamo'!B4");
    expect(p("=Ñame!A1:B2")).toBe("'Ñame'!A1:B2");
    expect(p("='Año 2024'!$A$1:$A$9")).toBe("'Año 2024'!A1:A9");
    expect(p("=Sheet1!A1:Sheet1!B2")).toBe("'Sheet1'!A1:B2");
  });

  it("function calls (case-insensitive, prefixes stripped, empty args)", () => {
    expect(p("=sum(1,2)")).toBe("SUM(1,2)");
    expect(p("=_xlfn.STDEV.S(A1:A3)")).toBe("STDEV.S(A1:A3)");
    expect(p("=_xlfn._xlws.SORT(A1:A3)")).toBe("SORT(A1:A3)");
    expect(p("=ORS.NORMAL(10, 2)")).toBe("ORS.NORMAL(10,2)");
    expect(p("=IF(A1,,2)")).toBe("IF(A1,,2)");
    expect(p("=PI()")).toBe("PI()");
    expect(p("=NPV($B$14,C30:G30)")).toBe("NPV(B14,C30:G30)");
  });

  it("names", () => {
    expect(parseFormula("=Rate*2")).toEqual({ t: "bin", op: "*", a: { t: "name", name: "Rate" }, b: { t: "num", v: 2 } });
  });

  it("rejects unsupported syntax", () => {
    expect(() => parseFormula("=SUM(A:A)")).toThrow(/Whole-column/);
    expect(() => parseFormula("=SUM(1:3)")).toThrow(/Whole-column/);
    expect(() => parseFormula("=SUM({1,2})")).toThrow(/Array constants/);
    expect(() => parseFormula("=1+")).toThrow();
    expect(() => parseFormula("=(1+2")).toThrow();
    expect(() => parseFormula('="abc')).toThrow();
  });
});

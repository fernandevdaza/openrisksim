import { describe, expect, it } from "vitest";
import { registeredFunctionNames } from "@openrisksim/workbook";
import { canonicalFunctionName, localFunctionName, localizeError, toDisplayFormula, toEngineFormula } from "./formulaI18n";
import { FUNCTION_CATALOG } from "./functionCatalog";

describe("formula localisation", () => {
  it("shows engine formulas in Spanish", () => {
    expect(toDisplayFormula("=NPV(B1,C2:C9)+IRR(C1:C9)", "es")).toBe("=VNA(B1;C2:C9)+TIR(C1:C9)");
    expect(toDisplayFormula('=IF(A1>0.5,"a,b;c",TRUE)', "es")).toBe('=SI(A1>0,5;"a,b;c";VERDADERO)');
    expect(toDisplayFormula("=STDEV.S('Hoja 2'!A1:A9)*1.5E+3", "es")).toBe("=DESVEST.M('Hoja 2'!A1:A9)*1,5E+3");
    expect(toDisplayFormula("=_xlfn.NORM.INV(0.95,0,1)", "es")).toBe("=INV.NORM(0,95;0;1)");
    expect(toDisplayFormula("=IFERROR(1/0,#N/A)", "es")).toBe("=SI.ERROR(1/0;#N/D)");
    expect(toDisplayFormula("=NPV(B1,C2:C9)", "en")).toBe("=NPV(B1,C2:C9)");
    expect(toDisplayFormula("={1,2;3,4}", "es")).toBe("={1,2;3,4}");
  });

  it("parses Spanish input into engine syntax", () => {
    expect(toEngineFormula("=SUMA(A1:A3;2,5)", "es")).toBe("=SUM(A1:A3,2.5)");
    expect(toEngineFormula("=vna(B1;C2:C9)", "es")).toBe("=NPV(B1,C2:C9)");
    expect(toEngineFormula("=SI(A1>0;\"x;y\";FALSO)", "es")).toBe('=IF(A1>0,"x;y",FALSE)');
    expect(toEngineFormula("=SUM(A1;A2)", "es")).toBe("=SUM(A1,A2)"); // English names accepted
    expect(toEngineFormula("=_xlfn.STDEV.S(A1:A3)", "en")).toBe("=STDEV.S(A1:A3)");
    expect(toEngineFormula("=Y(A1;O(B1;C1))", "es")).toBe("=AND(A1,OR(B1,C1))");
    expect(toEngineFormula("=Hoja1!A1*1.5", "es")).toBe("=Hoja1!A1*1.5");
    expect(toEngineFormula("=SI.ERROR(A1;#N/D)", "es")).toBe("=IFERROR(A1,#N/A)");
    expect(toEngineFormula("=DÍAS(A1;B1)+AÑO(A1)", "es")).toBe("=DAYS(A1,B1)+YEAR(A1)");
    expect(toEngineFormula("hola, mundo", "es")).toBe("hola, mundo");
  });

  it("round-trips es ↔ en", () => {
    const formulas = [
      "=NPV($B$14,C30:G30)+B30",
      '=IF(AND(A1>=0.25,B2<>"x, y; z"),VLOOKUP(A1,\'Hoja 2\'!$A$1:$C$9,3,FALSE),-1.5E-3)',
      "=SUMPRODUCT(A1:A5,B1:B5)/SUM(B1:B5)",
      "=ORS.TRIANGULAR(1,2.5,4)+ORS.MIRR(A1:A5,0.1,0.12)",
      "=EOMONTH(TODAY(),1)-DATE(2024,1,31)",
      "=Tasa*Evaluación!B1",
      "=COUNTIFS(A:A,\">0\",B:B,\"<=10\")",
    ];
    for (const f of formulas) expect(toEngineFormula(toDisplayFormula(f, "es"), "es")).toBe(f);
    for (const f of formulas) expect(toEngineFormula(toDisplayFormula(f, "en"), "en")).toBe(f);
  });

  it("knows canonical and local names", () => {
    expect(canonicalFunctionName("buscarv")).toBe("VLOOKUP");
    expect(canonicalFunctionName("_xlfn.STDEV.S")).toBe("STDEV.S");
    expect(canonicalFunctionName("NOEXISTE")).toBeNull();
    expect(localFunctionName("XOR", "es")).toBe("XO");
    expect(localFunctionName("TEXTJOIN", "es")).toBe("UNIRCADENAS");
    expect(localizeError("#DIV/0!", "es")).toBe("#¡DIV/0!");
    expect(localizeError("#N/A", "en")).toBe("#N/A");
  });
});

describe("function catalog", () => {
  const registered = new Set(registeredFunctionNames());
  it("only lists functions the engine supports", () => {
    const missing = FUNCTION_CATALOG.filter((f) => !registered.has(f.en)).map((f) => f.en);
    expect(missing).toEqual([]);
    expect(FUNCTION_CATALOG.length).toBeGreaterThanOrEqual(120);
  });
  it("has unique names and no Spanish name that is another English function", () => {
    const en = FUNCTION_CATALOG.map((f) => f.en);
    const es = FUNCTION_CATALOG.map((f) => f.es);
    expect(new Set(en).size).toBe(en.length);
    expect(new Set(es).size).toBe(es.length);
    for (const f of FUNCTION_CATALOG) if (f.es !== f.en) expect(registered.has(f.es), f.es).toBe(false);
  });
  it("has descriptions and well-formed arguments", () => {
    for (const f of FUNCTION_CATALOG) {
      expect(f.d.es && f.d.en, f.en).toBeTruthy();
      const firstRep = f.args.findIndex((a) => a.rep);
      if (firstRep >= 0) expect(f.args.slice(firstRep).every((a) => a.rep), f.en).toBe(true);
      for (const a of f.args) expect(a.d.es && a.d.en && a.es && a.en, `${f.en}.${a.en}`).toBeTruthy();
    }
  });
});

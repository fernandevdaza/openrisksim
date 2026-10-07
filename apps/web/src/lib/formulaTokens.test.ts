import { describe, expect, it } from "vitest";
import { boundsRefText, caretContext, cycleReference, formulaRefs, missingParens, quoteSheet, tokenize } from "./formulaTokens";

const types = (f: string, l: "es" | "en" = "en") => tokenize(f, l).filter((t) => t.type !== "ws").map((t) => `${t.type}:${t.text}`);

describe("tokenize", () => {
  it("splits English formulas", () => {
    expect(types('=SUM(A1:B2,$C$3)*1.5&"a,b"')).toEqual([
      "eq:=", "func:SUM", "lparen:(", "ref:A1:B2", "sep:,", "ref:$C$3", "rparen:)", "op:*", "number:1.5", "op:&", 'string:"a,b"',
    ]);
  });

  it("splits Spanish formulas (decimal comma, ; separator)", () => {
    expect(types('=SUMA(A1;2,5;"x;y")', "es")).toEqual(["eq:=", "func:SUMA", "lparen:(", "ref:A1", "sep:;", "number:2,5", "sep:;", 'string:"x;y"', "rparen:)"]);
    // a comma after a reference is still a separator
    expect(types("=SUMA(A1,B2)", "es")).toEqual(["eq:=", "func:SUMA", "lparen:(", "ref:A1", "sep:,", "ref:B2", "rparen:)"]);
  });

  it("recognises sheet references, whole rows/columns and functions that look like cells", () => {
    const toks = tokenize("='Hoja 2'!C5+Evaluación!$B$1:B3+A:A+3:5+LOG10(100)+Tasa", "en");
    const refs = toks.filter((t) => t.type === "ref");
    expect(refs.map((t) => [t.text, t.ref!.sheet, t.ref!.kind])).toEqual([
      ["'Hoja 2'!C5", "Hoja 2", "cell"],
      ["Evaluación!$B$1:B3", "Evaluación", "range"],
      ["A:A", null, "cols"],
      ["3:5", null, "rows"],
    ]);
    expect(toks.find((t) => t.type === "func")?.text).toBe("LOG10");
    expect(toks.at(-1)).toMatchObject({ type: "name", text: "Tasa" });
  });

  it("handles errors, booleans, arrays and unterminated strings", () => {
    expect(types("=SI(A1;VERDADERO;#¡DIV/0!)", "es")).toEqual(["eq:=", "func:SI", "lparen:(", "ref:A1", "sep:;", "bool:VERDADERO", "sep:;", "error:#¡DIV/0!", "rparen:)"]);
    expect(types("={1,2;3,4}", "es")).toEqual(["eq:=", "lbrace:{", "number:1", "arraysep:,", "number:2", "arraysep:;", "number:3", "arraysep:,", "number:4", "rbrace:}"]);
    expect(types('="abc')).toEqual(["eq:=", 'string:"abc']);
  });
});

describe("formulaRefs", () => {
  it("assigns one colour per distinct reference", () => {
    const refs = formulaRefs("=A1+B2:B4*a1+Hoja2!A1", "en");
    expect(refs.map((r) => [r.text, r.color])).toEqual([
      ["A1", 0],
      ["B2:B4", 1],
      ["a1", 0],
      ["Hoja2!A1", 2],
    ]);
    expect(refs[1].bounds).toEqual({ r0: 1, c0: 1, r1: 3, c1: 1 });
  });
});

describe("F4 cycling", () => {
  const cycle = (f: string, caret: number) => cycleReference(f, caret, "es")?.text;
  it("cycles A1 → $A$1 → A$1 → $A1 → A1", () => {
    expect(cycle("=A1", 3)).toBe("=$A$1");
    expect(cycle("=$A$1", 5)).toBe("=A$1");
    expect(cycle("=A$1", 4)).toBe("=$A1");
    expect(cycle("=$A1", 4)).toBe("=A1");
  });
  it("works on ranges, sheet references and with the caret inside the reference", () => {
    expect(cycle("=SUMA(B4:B9)", 8)).toBe("=SUMA($B$4:$B$9)");
    expect(cycle("=SUMA('Hoja 2'!B4:B9;1)", 18)).toBe("=SUMA('Hoja 2'!$B$4:$B$9;1)");
    expect(cycle("=A:A", 4)).toBe("=$A:$A");
    expect(cycle("=1+2", 3)).toBeUndefined();
    const r = cycleReference("=A1+B2", 6, "en");
    expect(r).toEqual({ text: "=A1+$B$2", start: 4, end: 8 });
  });
});

describe("caretContext", () => {
  it("knows the function and argument the caret is in", () => {
    expect(caretContext("=VNA(B1;C2:C9", 8, "es").fn).toEqual({ name: "VNA", start: 1, argIndex: 1 });
    expect(caretContext("=SI(A1>0;SUMA(B1;B2);", 18, "es").fn).toMatchObject({ name: "SUMA", argIndex: 1 });
    expect(caretContext("=SI(A1>0;SUMA(B1;B2);", 21, "es").fn).toMatchObject({ name: "SI", argIndex: 2 });
    expect(caretContext("=SUM((A1+B1),", 13, "en").fn).toMatchObject({ name: "SUM", argIndex: 1 });
    expect(caretContext('=SI(A1;"a;b"', 11, "es").fn).toMatchObject({ name: "SI", argIndex: 1 });
    expect(caretContext("=_xlfn.STDEV.S(", 15, "en").fn).toMatchObject({ name: "STDEV.S" });
  });

  it("detects where a reference can be inserted (point mode)", () => {
    const can = (f: string, c = f.length) => caretContext(f, c, "es").canInsertRef;
    expect(can("=")).toBe(true);
    expect(can("=SUMA(")).toBe(true);
    expect(can("=SUMA(A1;")).toBe(true);
    expect(can("=A1+")).toBe(true);
    expect(can("=SUMA( ")).toBe(true);
    expect(can("=SUMA()", 6)).toBe(true);
    expect(can("=A1")).toBe(false);
    expect(can("=5%")).toBe(false);
    expect(can("=SUMA")).toBe(false);
    expect(can('="a', 3)).toBe(false);
    expect(can("=A1", 1)).toBe(false);
    expect(can("A1+")).toBe(false);
  });

  it("finds the identifier being typed for autocomplete", () => {
    expect(caretContext("=SU", 3, "es").ident).toEqual({ text: "SU", start: 1, end: 3 });
    expect(caretContext("=A1+vn", 6, "es").ident?.text).toBe("vn");
    expect(caretContext("=SUMA(A", 7, "es").ident?.text).toBe("A");
    expect(caretContext("=SUMAR.", 7, "es").ident?.text).toBe("SUMAR.");
    expect(caretContext("=SUMA(", 6, "es").ident).toBeNull();
    expect(caretContext('="SU', 4, "es").ident).toBeNull();
    expect(caretContext("=Hoja1!A", 8, "es").ident).toBeNull();
  });
});

describe("helpers", () => {
  it("quotes sheet names and builds reference text", () => {
    expect(quoteSheet("Hoja1")).toBe("Hoja1");
    expect(quoteSheet("Hoja 2")).toBe("'Hoja 2'");
    expect(quoteSheet("Año")).toBe("Año");
    expect(quoteSheet("A1")).toBe("'A1'");
    expect(quoteSheet("It's")).toBe("'It''s'");
    expect(boundsRefText({ r0: 3, c0: 1, r1: 8, c1: 1 })).toBe("B4:B9");
    expect(boundsRefText({ r0: 4, c0: 2, r1: 4, c1: 2 }, "Hoja 2")).toBe("'Hoja 2'!C5");
  });
  it("counts missing closing parentheses", () => {
    expect(missingParens("=SUMA(A1;MAX(B1", "es")).toBe(2);
    expect(missingParens('=SUMA(")"', "es")).toBe(1);
  });
});

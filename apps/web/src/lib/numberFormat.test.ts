import { describe, expect, it } from "vitest";
import { formatCellValue, formatNumber, parseLocaleNumber, parseUserInput } from "./numberFormat";

const en = (v: number, f?: string) => formatNumber(v, f, "en").text;
const es = (v: number, f?: string) => formatNumber(v, f, "es").text;

describe("formatNumber", () => {
  it("general", () => {
    expect(en(1234.5)).toBe("1234.5");
    expect(es(1234.5)).toBe("1234,5");
    expect(en(1 / 3)).toBe("0.3333333333");
    expect(en(0)).toBe("0");
    expect(en(1.5e12)).toBe("1.5E+12");
  });
  it("fixed decimals and grouping", () => {
    expect(en(1234.567, "0.00")).toBe("1234.57");
    expect(en(1234.567, "#,##0")).toBe("1,235");
    expect(es(1234567.891, "#,##0.00")).toBe("1.234.567,89");
    expect(en(-1234.5, "#,##0.00")).toBe("-1,234.50");
    expect(en(0.5, "0")).toBe("1");
    expect(en(0.25, "#.00")).toBe(".25");
  });
  it("percent", () => {
    expect(en(0.1234, "0%")).toBe("12%");
    expect(en(0.1234, "0.0%")).toBe("12.3%");
    expect(es(0.1234, "0.00%")).toBe("12,34%");
  });
  it("currency and sections", () => {
    expect(en(1234.5, "$#,##0.00")).toBe("$1,234.50");
    expect(en(-1234.5, "$#,##0.00;($#,##0.00)")).toBe("($1,234.50)");
    expect(formatNumber(-5, "#,##0;[Red]-#,##0", "en")).toEqual({ text: "-5", color: "#dc2626" });
    expect(en(1500, '[$€-2] #,##0')).toBe("€ 1,500");
    expect(en(0, '#,##0;-#,##0;"-"')).toBe("-");
    expect(en(1234.5, '_($* #,##0.00_);_($* (#,##0.00);_($* "-"??_);_(@_)').trim()).toBe("$1,234.50");
    expect(en(-1234.5, '_($* #,##0.00_);_($* (#,##0.00);_($* "-"??_);_(@_)').trim()).toBe("$(1,234.50)");
  });
  it("scaling and scientific", () => {
    expect(en(1234567, "#,##0,")).toBe("1,235");
    expect(en(12345, "0.00E+00")).toBe("1.23E+04");
    expect(en(0.00012, "0.0E+00")).toBe("1.2E-04");
  });
  it("dates", () => {
    // 45292 = 2024-01-01
    expect(en(45292, "yyyy-mm-dd")).toBe("2024-01-01");
    expect(es(45292, "dd/mm/yyyy")).toBe("01/01/2024");
    expect(es(45292, "m/d/yyyy")).toBe("1/1/2024");
    expect(en(45292.5, "hh:mm")).toBe("12:00");
    expect(es(45323, "mmm-yy")).toBe("feb-24");
  });
});

describe("formatCellValue", () => {
  it("handles non-numbers", () => {
    expect(formatCellValue("abc", undefined, "en")).toEqual({ text: "abc", align: "left" });
    expect(formatCellValue(true, undefined, "es").text).toBe("VERDADERO");
    expect(formatCellValue({ error: "#DIV/0!" }, undefined, "en").text).toBe("#DIV/0!");
    expect(formatCellValue(null, "0.00", "en").text).toBe("");
    expect(formatCellValue(3, "0.00", "en")).toEqual({ text: "3.00", align: "right", color: undefined });
  });
});

describe("parse user input", () => {
  it("parses locale numbers", () => {
    expect(parseLocaleNumber("1,5", "es")).toBe(1.5);
    expect(parseLocaleNumber("1.5", "es")).toBe(1.5);
    expect(parseLocaleNumber("1.234,5", "es")).toBe(1234.5);
    expect(parseLocaleNumber("1,234.5", "en")).toBe(1234.5);
    expect(parseLocaleNumber("15%", "en")).toBe(0.15);
    expect(parseLocaleNumber("abc", "en")).toBeNull();
    expect(parseLocaleNumber("-2e3", "en")).toBe(-2000);
  });
  it("keeps formulas and text", () => {
    expect(parseUserInput("=SUM(A1:A3)", "es")).toBe("=SUM(A1:A3)");
    expect(parseUserInput("Ventas", "es")).toBe("Ventas");
    expect(parseUserInput("  ", "es")).toBeNull();
    expect(parseUserInput("12,5%", "es")).toBe(0.125);
  });
});

import { formatGeneralFit } from "./numberFormat";
describe("formatGeneralFit", () => {
  it("drops decimals to fit like Excel", () => {
    const sep = { decimal: ",", group: "." };
    expect(formatGeneralFit(103.38293829, sep, 8)).toBe("103,3829");
    expect(formatGeneralFit(5169.1469, sep, 6)).toBe("5169,1");
    expect(formatGeneralFit(123456789, sep, 6)).toBe("1E+08");
    expect(formatGeneralFit(123456789, sep, 7)).toBe("1,2E+08");
    expect(formatGeneralFit(12, sep, 6)).toBe("12");
  });
});

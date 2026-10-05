import { describe, expect, it } from "vitest";
import { autoDigits, fmt, fmtAuto, fmtCompact, fmtP, fmtPct, fmtPeriods } from "./format";

describe("number formatting", () => {
  it("uses es grouping and decimal comma", () => {
    expect(fmt(1234.56, 2, "es")).toBe("1.234,56");
    expect(fmt(1234567.891, 2, "es")).toBe("1.234.567,89");
    expect(fmt(1234.5, 2, "en")).toBe("1,234.5");
    expect(fmt(0.5, 2, "es", true)).toBe("0,50");
    expect(fmt(-0.0001, 2, "es")).toBe("0");
  });
  it("handles special values", () => {
    expect(fmt(NaN)).toBe("—");
    expect(fmt(null)).toBe("—");
    expect(fmt(Infinity)).toBe("∞");
    expect(fmt(-Infinity)).toBe("−∞");
  });
  it("formats percentages and p-values", () => {
    expect(fmtPct(0.1234, 1, "es")).toBe("12,3 %");
    expect(fmtPct(0.1234, 1, "en")).toBe("12.3%");
    expect(fmtP(0.0001, "es")).toBe("< 0,001");
    expect(fmtP(0.04567, "en")).toBe("0.0457");
  });
  it("chooses digits automatically", () => {
    expect(autoDigits(12345)).toBe(0);
    expect(autoDigits(12.3)).toBe(2);
    expect(autoDigits(0.05)).toBe(4);
    expect(fmtAuto(12345.678, "es")).toBe("12.346");
    expect(fmtPeriods(Infinity, "es")).toBe("No se recupera");
    expect(fmtPeriods(2.5, "en")).toBe("2.50");
    expect(fmtCompact(2500000, "es")).toBe("2,5 M");
  });
});

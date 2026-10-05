import { describe, expect, it } from "vitest";
import { detectDecimalSeparator, parseLocaleNumber, readCsv } from "./csv";

describe("readCsv", () => {
  it("parses ; delimited data with decimal commas", async () => {
    const wb = await readCsv("Año;Ventas;Margen\n2023;1.234,56;12,5%\n2024;2.000,1;10%\n", "ventas.csv");
    const s = wb.sheets[0];
    expect(s.name).toBe("ventas");
    expect(s.rows).toBe(3);
    expect(s.cols).toBe(3);
    expect(s.cells.A1).toEqual({ v: "Año", t: "s" });
    expect(s.cells.B2.v).toBeCloseTo(1234.56, 10);
    expect(s.cells.C2.v).toBeCloseTo(0.125, 10);
    expect(s.cells.B3.v).toBeCloseTo(2000.1, 10);
    expect(s.cells.A3.v).toBe(2024);
    expect(wb.model).toBeNull();
  });

  it("parses , delimited data with thousands separators", async () => {
    const wb = await readCsv('name,value\nA,"1,234.5"\nB,-0.25\nC,TRUE\n');
    const s = wb.sheets[0];
    expect(s.cells.B2.v).toBeCloseTo(1234.5);
    expect(s.cells.B3.v).toBe(-0.25);
    expect(s.cells.B4).toEqual({ v: true, t: "b" });
  });

  it("parses tab-delimited data", async () => {
    const wb = await readCsv("x\ty\n1,5\t2,25\n3,75\t4\n");
    const s = wb.sheets[0];
    expect(s.cells.A2.v).toBe(1.5);
    expect(s.cells.B2.v).toBe(2.25);
    expect(s.cells.A3.v).toBe(3.75);
  });

  it("detects decimal separators", () => {
    expect(detectDecimalSeparator(["1.234,56", "7,5"], ",")).toBe(",");
    expect(detectDecimalSeparator(["1,234.56", "7.5"], ",")).toBe(".");
    expect(detectDecimalSeparator(["12"], ";")).toBe(",");
    expect(parseLocaleNumber("1.234.567,8", ",")).toBeCloseTo(1234567.8);
    expect(parseLocaleNumber("1,234,567.8", ".")).toBeCloseTo(1234567.8);
    expect(parseLocaleNumber("12,34,5", ",")).toBeNull();
    expect(parseLocaleNumber("abc", ".")).toBeNull();
    expect(parseLocaleNumber("$ 1,000", ".")).toBe(1000);
    expect(parseLocaleNumber("(50)", ".")).toBe(-50);
  });
});

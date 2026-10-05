import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { emptyModel } from "@openrisksim/core";
import type { RiskModel } from "@openrisksim/core";
import { addExcelPrefixes, readXlsx, stripExcelPrefixes, writeXlsx } from "./xlsx";
import type { WorkbookData } from "./types";

async function excelBuffer(build: (wb: ExcelJS.Workbook) => void): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  const buf = (await wb.xlsx.writeBuffer()) as unknown as Uint8Array;
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function bigModel(): RiskModel {
  const m = emptyModel();
  for (let i = 0; i < 400; i++) {
    m.assumptions.push({
      id: `a${i}`,
      name: `Supuesto número ${i} — con un nombre largo para superar el límite de 32767 caracteres por celda`,
      cell: { sheet: "Mi Evaluación", address: `B${i + 1}` },
      distribution: { id: "normal", params: { mean: i, stdDev: 1 + i / 10 } },
      enabled: true,
    });
  }
  m.forecasts.push({ id: "f1", name: "VAN", cell: { sheet: "Mi Evaluación", address: "C1" }, format: "currency" });
  return m;
}

describe("readXlsx (files produced by ExcelJS)", () => {
  it("reads values, formulas, shared formulas, dates, rich text, errors, styles, merges, widths", async () => {
    const buf = await excelBuffer((wb) => {
      const ws = wb.addWorksheet("Datos y fórmulas");
      ws.getCell("A1").value = "Título";
      ws.getCell("A1").font = { bold: true, italic: true, color: { argb: "FFFF0000" } };
      ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
      ws.getCell("A1").alignment = { horizontal: "center" };
      ws.mergeCells("A1:C1");
      ws.getCell("A2").value = 1;
      ws.getCell("A3").value = 2;
      ws.getCell("A4").value = 3;
      ws.fillFormula("B2:B4", "A2*2+$A$2", [3, 5, 7]);
      ws.getCell("C2").value = new Date(Date.UTC(2024, 0, 1));
      ws.getCell("C2").numFmt = "yyyy-mm-dd";
      ws.getCell("C3").value = { richText: [{ text: "Hola " }, { text: "mundo", font: { bold: true } }] };
      ws.getCell("C4").value = { error: "#DIV/0!" } as ExcelJS.CellErrorValue;
      ws.getCell("D2").value = { formula: "_xlfn.STDEV.S(A2:A4)", result: 1 };
      ws.getCell("D3").value = { formula: "1/0", result: { error: "#DIV/0!" } } as ExcelJS.CellFormulaValue;
      ws.getCell("D4").value = 0.256;
      ws.getCell("D4").numFmt = "0.0%";
      ws.getColumn(1).width = 30;
      const hidden = wb.addWorksheet("Oculta", { state: "hidden" });
      hidden.getCell("A1").value = 42;
      const unused = wb.addWorksheet("Oculta2", { state: "hidden" });
      unused.getCell("A1").value = 1;
      ws.getCell("E2").value = { formula: "Oculta!A1+1", result: 43 };
    });
    const wb = await readXlsx(buf, "test.xlsx");
    expect(wb.fileName).toBe("test.xlsx");
    expect(wb.model).toBeNull();
    expect(wb.sheets.map((s) => s.name)).toEqual(["Datos y fórmulas", "Oculta"]);
    const s = wb.sheets[0];
    expect(s.cells.A1.v).toBe("Título");
    expect(s.cells.A1.s).toEqual({ bold: true, italic: true, color: "#FF0000", bg: "#FFFF00", align: "center" });
    expect(s.merges).toEqual(["A1:C1"]);
    expect(s.cells.B1).toBeUndefined();
    expect(s.cells.B2).toMatchObject({ f: "A2*2+$A$2", v: 3, t: "n" });
    expect(s.cells.B3).toMatchObject({ f: "A3*2+$A$2", v: 5 });
    expect(s.cells.B4).toMatchObject({ f: "A4*2+$A$2", v: 7 });
    expect(s.cells.C2.v).toBe(45292);
    expect(s.cells.C2.z).toBe("yyyy-mm-dd");
    expect(s.cells.C3).toEqual({ v: "Hola mundo", t: "s" });
    expect(s.cells.C4).toEqual({ v: "#DIV/0!", t: "e" });
    expect(s.cells.D2.f).toBe("STDEV.S(A2:A4)");
    expect(s.cells.D3).toMatchObject({ f: "1/0", v: "#DIV/0!", t: "e" });
    expect(s.cells.D4).toEqual({ v: 0.256, t: "n", z: "0.0%" });
    expect(s.colWidths?.[0]).toBe(30);
    expect(s.rows).toBe(4);
    expect(s.cols).toBe(5);
  });
});

describe("writeXlsx → readXlsx round trip", () => {
  it("preserves formulas, values, styles, merges, widths and a large model", async () => {
    const model = bigModel();
    const wb: WorkbookData = {
      fileName: "x.xlsx",
      model,
      sheets: [
        {
          name: "Mi Evaluación",
          rows: 4,
          cols: 3,
          colWidths: { 0: 25, 2: 12 },
          merges: ["A4:C4"],
          cells: {
            A1: { v: "Precio", t: "s", s: { bold: true } },
            B1: { v: 10.5, t: "n", z: "#,##0.00", s: { bg: "#FFF2CC", align: "right" } },
            C1: { f: "B1*2", v: 21, t: "n" },
            A2: { v: true, t: "b" },
            B2: { f: "'Hoja con espacios'!A1+1", v: 8, t: "n" },
            C2: { f: "STDEV.S(B1:C1)", v: 7.4246, t: "n" },
            A3: { f: "1/0", v: "#DIV/0!", t: "e" },
            B3: { v: "123", t: "s" },
            C3: { f: 'IF(B1>5,"alto","bajo")', v: "alto", t: "s" },
            A4: { v: "Nota combinada", t: "s" },
          },
        },
        { name: "Hoja con espacios", rows: 1, cols: 1, cells: { A1: { v: 7, t: "n" } } },
      ],
    };
    const buf = await writeXlsx(wb, { includeModel: true, reports: [{ name: "Informe", rows: [["Título"], ["Media", 1.5], ["Vacío", null]] }] });
    expect(buf.byteLength).toBeGreaterThan(1000);
    const back = await readXlsx(buf, "x.xlsx");
    expect(back.sheets.map((s) => s.name)).toEqual(["Mi Evaluación", "Hoja con espacios", "Informe"]);
    expect(back.model).toEqual(model);
    const s = back.sheets[0];
    expect(s.cells.A1).toEqual({ v: "Precio", t: "s", s: { bold: true } });
    expect(s.cells.B1).toEqual({ v: 10.5, t: "n", z: "#,##0.00", s: { bg: "#FFF2CC", align: "right" } });
    expect(s.cells.C1).toEqual({ f: "B1*2", v: 21, t: "n" });
    expect(s.cells.A2).toEqual({ v: true, t: "b" });
    expect(s.cells.B2).toEqual({ f: "'Hoja con espacios'!A1+1", v: 8, t: "n" });
    expect(s.cells.C2.f).toBe("STDEV.S(B1:C1)");
    expect(s.cells.A3).toEqual({ f: "1/0", v: "#DIV/0!", t: "e" });
    expect(s.cells.B3).toEqual({ v: "123", t: "s" });
    expect(s.cells.C3).toEqual({ f: 'IF(B1>5,"alto","bajo")', v: "alto", t: "s" });
    expect(s.merges).toEqual(["A4:C4"]);
    expect(s.colWidths?.[0]).toBe(25);
    expect(s.colWidths?.[2]).toBe(12);
    expect(back.sheets[2].cells.B2.v).toBe(1.5);
  });

  it("omits the model sheet when includeModel is false and writes the veryHidden sheet otherwise", async () => {
    const wb: WorkbookData = { model: emptyModel(), sheets: [{ name: "S", rows: 1, cols: 1, cells: { A1: { v: 1, t: "n" } } }] };
    const without = await readXlsx(await writeXlsx(wb, { includeModel: false }));
    expect(without.model).toBeNull();
    const withModel = await writeXlsx(wb);
    const x = new ExcelJS.Workbook();
    await x.xlsx.load(withModel as unknown as Parameters<typeof x.xlsx.load>[0]);
    expect(x.getWorksheet("_openrisksim")?.state).toBe("veryHidden");
    expect((await readXlsx(withModel)).model).toEqual(emptyModel());
  });

  it("handles _xlfn prefixes", () => {
    expect(stripExcelPrefixes('_xlfn.NORM.S.INV(A1)+"_xlfn.x"')).toBe('NORM.S.INV(A1)+"_xlfn.x"');
    expect(addExcelPrefixes('NORM.S.INV(A1)+stdev.s(B1:B2)+SUM(C1)+"NORM.S.INV("')).toBe(
      '_xlfn.NORM.S.INV(A1)+_xlfn.STDEV.S(B1:B2)+SUM(C1)+"NORM.S.INV("',
    );
  });
});

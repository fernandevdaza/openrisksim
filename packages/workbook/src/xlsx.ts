/**
 * .xlsx import/export with ExcelJS.
 *
 * - Formulas are stored without the leading "=" and without Excel's `_xlfn.` / `_xlws.` prefixes
 *   (added back on export for "future functions" so Excel recognises them).
 * - Shared formulas are expanded into per-cell formulas (relative references translated).
 * - Dates become Excel serial numbers (1900 date system, like HyperFormula's `nullDate` 1899-12-30).
 * - The RiskModel is stored as JSON, split into ≤30000-char chunks in A1, A2, … of a `veryHidden`
 *   sheet named `_openrisksim`.
 */
import ExcelJS from "exceljs";
import type { RiskModel } from "@openrisksim/core";
import { parseA1, parseRange, toA1, translateFormula as translateFormulaRefs } from "./address";
import type { CellData, CellStyle, ReportSheet, SheetData, WorkbookData } from "./types";
import { MODEL_SHEET_NAME } from "./types";

type XWorkbook = ExcelJS.Workbook;
type XWorksheet = ExcelJS.Worksheet;

// ExcelJS is CommonJS; depending on the bundler the default import may be the namespace itself.
const EX: typeof ExcelJS = ((ExcelJS as unknown as { default?: typeof ExcelJS }).default ?? ExcelJS) as typeof ExcelJS;

const MODEL_CHUNK = 30000;
const MS_PER_DAY = 86400000;

// ---------------------------------------------------------------------------------------------
// Formula prefix handling
// ---------------------------------------------------------------------------------------------

/** Functions Excel stores with the `_xlfn.` prefix (Excel 2010+ "future functions"). */
const XLFN_FUNCTIONS = [
  "AGGREGATE", "BETA.DIST", "BETA.INV", "BINOM.DIST", "BINOM.DIST.RANGE", "BINOM.INV", "BITAND", "BITLSHIFT",
  "BITOR", "BITRSHIFT", "BITXOR", "CEILING.MATH", "CEILING.PRECISE", "CHISQ.DIST", "CHISQ.DIST.RT", "CHISQ.INV",
  "CHISQ.INV.RT", "CHISQ.TEST", "COMBINA", "CONCAT", "CONFIDENCE.NORM", "CONFIDENCE.T", "COT", "COTH",
  "COVARIANCE.P", "COVARIANCE.S", "CSC", "CSCH", "DAYS", "DECIMAL", "ERF.PRECISE", "ERFC.PRECISE",
  "EXPON.DIST", "F.DIST", "F.DIST.RT", "F.INV", "F.INV.RT", "F.TEST", "FILTER", "FLOOR.MATH", "FLOOR.PRECISE",
  "FORECAST.LINEAR", "FORMULATEXT", "GAMMA", "GAMMA.DIST", "GAMMA.INV", "GAMMALN.PRECISE", "GAUSS", "HSTACK",
  "IFNA", "IFS", "IMCOSH", "IMCOT", "IMCSC", "IMCSCH", "IMSEC", "IMSECH", "IMSINH", "IMTAN", "ISFORMULA",
  "ISOWEEKNUM", "LOGNORM.DIST", "LOGNORM.INV", "MAXIFS", "MINIFS", "MODE.MULT", "MODE.SNGL", "NEGBINOM.DIST",
  "NORM.DIST", "NORM.INV", "NORM.S.DIST", "NORM.S.INV", "NUMBERVALUE", "PDURATION", "PERCENTILE.EXC",
  "PERCENTILE.INC", "PERCENTRANK.EXC", "PERCENTRANK.INC", "PERMUTATIONA", "PHI", "POISSON.DIST",
  "QUARTILE.EXC", "QUARTILE.INC", "RANK.AVG", "RANK.EQ", "RRI", "SEC", "SECH", "SEQUENCE", "SHEET", "SHEETS",
  "SKEW.P", "SORT", "SORTBY", "STDEV.P", "STDEV.S", "SWITCH", "T.DIST", "T.DIST.2T", "T.DIST.RT", "T.INV",
  "T.INV.2T", "T.TEST", "TEXTJOIN", "UNICHAR", "UNICODE", "UNIQUE", "VAR.P", "VAR.S", "VSTACK", "WEIBULL.DIST",
  "XLOOKUP", "XMATCH", "XOR", "Z.TEST", "ARRAY_CONSTRAIN",
];
const XLFN_RE = new RegExp(
  `(^|[^A-Za-z0-9_.])(${XLFN_FUNCTIONS.map((f) => f.replace(/\./g, "\\.")).join("|")})\\(`,
  "gi",
);

/** Remove `_xlfn.`, `_xlws.`, `_xll.` prefixes (outside string literals). */
export function stripExcelPrefixes(formula: string): string {
  if (!formula.includes("_xl")) return formula;
  return mapOutsideStrings(formula, (s) => s.replace(/_xlfn\.|_xlws\.|_xll\./gi, ""));
}

/** Add `_xlfn.` to Excel 2010+ functions so Excel recognises them. */
export function addExcelPrefixes(formula: string): string {
  return mapOutsideStrings(formula, (s) => s.replace(XLFN_RE, (_m, pre: string, fn: string) => `${pre}_xlfn.${fn.toUpperCase()}(`));
}

function mapOutsideStrings(formula: string, fn: (s: string) => string): string {
  const parts = formula.split(/("(?:[^"]|"")*"|'(?:[^']|'')*')/);
  return parts.map((p, i) => (i % 2 === 1 ? p : fn(p))).join("");
}

// ---------------------------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------------------------

function dateToSerial(d: Date): number {
  // ExcelJS builds dates as UTC from the stored serial (1900 or 1904 system); convert back to 1900 system.
  return d.getTime() / MS_PER_DAY + 25569;
}

function argbToHex(argb: string | undefined): string | undefined {
  if (!argb || typeof argb !== "string") return undefined;
  const h = argb.length === 8 ? argb.slice(2) : argb.length === 6 ? argb : null;
  if (!h || !/^[0-9A-Fa-f]{6}$/.test(h)) return undefined;
  return `#${h.toUpperCase()}`;
}

function hexToArgb(hex: string | undefined): string | undefined {
  if (!hex) return undefined;
  const m = /^#?([0-9A-Fa-f]{6})$/.exec(hex.trim());
  return m ? `FF${m[1].toUpperCase()}` : undefined;
}

function readStyle(cell: ExcelJS.Cell): CellStyle | undefined {
  const s: CellStyle = {};
  const font = cell.font;
  if (font) {
    if (font.bold) s.bold = true;
    if (font.italic) s.italic = true;
    const c = argbToHex(font.color?.argb);
    if (c && c !== "#000000") s.color = c;
  }
  const fill = cell.fill as ExcelJS.FillPattern | undefined;
  if (fill && fill.type === "pattern" && fill.pattern === "solid") {
    const bg = argbToHex(fill.fgColor?.argb);
    if (bg) s.bg = bg;
  }
  const h = cell.alignment?.horizontal;
  if (h === "left" || h === "right" || h === "center") s.align = h;
  else if (h === "centerContinuous") s.align = "center";
  return Object.keys(s).length ? s : undefined;
}

type ScalarResult = { v: CellData["v"]; t: CellData["t"] };

function scalarFromValue(value: unknown): ScalarResult | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return { v: value, t: "n" };
  if (typeof value === "string") return { v: value, t: "s" };
  if (typeof value === "boolean") return { v: value, t: "b" };
  if (value instanceof Date) return { v: dateToSerial(value), t: "n" };
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return { v: (o.richText as { text?: string }[]).map((r) => r.text ?? "").join(""), t: "s" };
    }
    if (typeof o.error === "string") return { v: o.error, t: "e" };
    if (o.text !== undefined && o.hyperlink !== undefined) {
      const text = o.text as unknown;
      if (typeof text === "string") return { v: text, t: "s" };
      return scalarFromValue(text);
    }
    if (o.sharedString !== undefined) return scalarFromValue(o.sharedString);
  }
  return null;
}

function cleanFormula(f: string): string {
  let s = f.trim();
  if (s.startsWith("=")) s = s.slice(1);
  return stripExcelPrefixes(s);
}

function readModelSheet(ws: XWorksheet): RiskModel | null {
  let json = "";
  for (let r = 1; r <= Math.max(ws.rowCount, 1); r++) {
    const v = ws.getCell(r, 1).value;
    const sc = scalarFromValue(v);
    if (!sc || typeof sc.v !== "string" || sc.v === "") break;
    json += sc.v;
  }
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as RiskModel;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.assumptions)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readSheet(ws: XWorksheet): SheetData {
  const cells: Record<string, CellData> = {};
  let maxRow = -1;
  let maxCol = -1;
  const arrayRanges: string[] = [];

  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      // Slave cells of a merge carry the master's value; skip them.
      if (cell.isMerged && cell.master && cell.master.address !== cell.address) return;
      const addr = cell.address.replace(/\$/g, "");
      const data: CellData = {};
      const value = cell.value as unknown;
      if (value && typeof value === "object" && !(value instanceof Date) &&
          ("formula" in (value as object) || "sharedFormula" in (value as object))) {
        const fv = value as { formula?: string; sharedFormula?: string; result?: unknown; shareType?: string; ref?: string };
        let formula: string | undefined;
        if (fv.formula) {
          formula = fv.formula;
          if (fv.shareType === "array" && fv.ref && fv.ref.includes(":")) arrayRanges.push(fv.ref);
        } else if (fv.sharedFormula) {
          const masterCell = ws.getCell(fv.sharedFormula);
          const mv = masterCell.value as { formula?: string } | null;
          if (mv && typeof mv === "object" && mv.formula) {
            const from = parseA1(masterCell.address);
            const to = parseA1(addr);
            formula = translateFormulaRefs(mv.formula, to.row - from.row, to.col - from.col);
          } else {
            // fall back to ExcelJS's own translation
            formula = (cell as unknown as { formula?: string }).formula;
          }
        }
        if (formula) data.f = cleanFormula(formula);
        // ExcelJS drops falsy results (0, "", false) from `cell.value`; read them from `cell.result`.
        const rawResult = fv.result !== undefined ? fv.result : (cell as unknown as { result?: unknown }).result;
        const res = scalarFromValue(rawResult);
        if (res) {
          data.v = res.v;
          data.t = res.t;
        }
      } else {
        const sc = scalarFromValue(value);
        if (sc) {
          data.v = sc.v;
          data.t = sc.t;
        }
      }
      const numFmt = cell.numFmt;
      if (numFmt && numFmt !== "General") data.z = numFmt;
      const style = readStyle(cell);
      if (style) data.s = style;
      if (data.f === undefined && data.v === undefined && !data.s) return;
      if (data.f === undefined && data.v === undefined && data.s && !data.s.bg) return; // empty, no visible style
      cells[addr] = data;
      const { row: r, col: c } = parseA1(addr);
      if (r > maxRow) maxRow = r;
      if (c > maxCol) maxCol = c;
    });
  });

  // Array (CSE) formulas: keep the formula in the top-left cell and clear the other cells so the
  // engine can spill the result there.
  for (const ref of arrayRanges) {
    try {
      const { start, end } = parseRange(ref);
      for (let r = start.row; r <= end.row; r++) {
        for (let c = start.col; c <= end.col; c++) {
          if (r === start.row && c === start.col) continue;
          const key = toA1(r, c);
          const cd = cells[key];
          if (cd && cd.f === undefined) {
            delete cd.v;
            delete cd.t;
            if (!cd.z && !cd.s) delete cells[key];
          }
        }
      }
    } catch {
      /* ignore malformed refs */
    }
  }

  const merges: string[] = [];
  const rawMerges = (ws as unknown as { _merges?: Record<string, { range?: string }> })._merges;
  if (rawMerges) {
    for (const m of Object.values(rawMerges)) {
      if (m && typeof m.range === "string") merges.push(m.range.replace(/\$/g, ""));
    }
  }
  for (const m of merges) {
    try {
      const { end } = parseRange(m);
      if (end.row > maxRow) maxRow = end.row;
      if (end.col > maxCol) maxCol = end.col;
    } catch {
      /* ignore */
    }
  }

  const colWidths: Record<number, number> = {};
  const colCount = Math.max(ws.columnCount, maxCol + 1);
  for (let c = 1; c <= colCount; c++) {
    const w = ws.getColumn(c).width;
    if (typeof w === "number" && Number.isFinite(w) && w > 0) colWidths[c - 1] = w;
  }

  const sheet: SheetData = {
    name: ws.name,
    rows: Math.max(maxRow + 1, 1),
    cols: Math.max(maxCol + 1, 1),
    cells,
  };
  if (Object.keys(colWidths).length) sheet.colWidths = colWidths;
  if (merges.length) sheet.merges = merges;
  return sheet;
}

function referencedInFormulas(name: string, sheets: SheetData[]): boolean {
  const lower = name.toLowerCase();
  const quoted = `'${lower.replace(/'/g, "''")}'!`;
  const plain = `${lower}!`;
  for (const s of sheets) {
    for (const c of Object.values(s.cells)) {
      if (!c.f) continue;
      const f = c.f.toLowerCase();
      if (f.includes(quoted) || f.includes(plain)) return true;
    }
  }
  return false;
}

/** Read an .xlsx file into WorkbookData. Visible sheets are read, plus hidden sheets referenced by formulas. */
export async function readXlsx(buf: ArrayBuffer, fileName?: string): Promise<WorkbookData> {
  const wb: XWorkbook = new EX.Workbook();
  await wb.xlsx.load(buf as unknown as Parameters<XWorkbook["xlsx"]["load"]>[0]);
  let model: RiskModel | null = null;
  const visible: SheetData[] = [];
  const hidden: { order: number; sheet: SheetData }[] = [];
  const order: SheetData[] = [];
  wb.eachSheet((ws) => {
    if (ws.name === MODEL_SHEET_NAME) {
      model = readModelSheet(ws);
      return;
    }
    const sheet = readSheet(ws);
    order.push(sheet);
    if (ws.state && ws.state !== "visible") hidden.push({ order: order.length - 1, sheet });
    else visible.push(sheet);
  });
  const hiddenSet = new Set(hidden.filter((h) => !referencedInFormulas(h.sheet.name, visible)).map((h) => h.sheet));
  const sheets = order.filter((s) => !hiddenSet.has(s));

  const result: WorkbookData = { sheets, model };
  if (fileName !== undefined) result.fileName = fileName;

  // Defined names (range references only) → stored as extra metadata.
  try {
    const dn = (wb as unknown as { definedNames?: { model?: { name: string; ranges: string[] }[] } }).definedNames?.model;
    if (dn && dn.length) {
      const names: Record<string, string> = {};
      for (const d of dn) {
        if (d.name && d.ranges && d.ranges.length === 1 && !d.name.startsWith("_xlnm")) names[d.name] = d.ranges[0];
      }
      if (Object.keys(names).length) result.names = names;
    }
  } catch {
    /* ignore */
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------------------------

const INVALID_SHEET_CHARS = /[\\/?*[\]:]/g;

function safeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(INVALID_SHEET_CHARS, "_").replace(/^'+|'+$/g, "").slice(0, 31) || "Sheet";
  let candidate = base;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${i++})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  base = candidate;
  return base;
}

function applyStyle(cell: ExcelJS.Cell, s: CellStyle | undefined, z: string | undefined): void {
  if (z) cell.numFmt = z;
  if (!s) return;
  const color = hexToArgb(s.color);
  if (s.bold || s.italic || color) {
    const font: Partial<ExcelJS.Font> = {};
    if (s.bold) font.bold = true;
    if (s.italic) font.italic = true;
    if (color) font.color = { argb: color };
    cell.font = font;
  }
  const bg = hexToArgb(s.bg);
  if (bg) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
  if (s.align) cell.alignment = { horizontal: s.align };
}

function toResult(c: CellData): ExcelJS.CellFormulaValue["result"] | undefined {
  if (c.v === null || c.v === undefined) return undefined;
  if (c.t === "e" && typeof c.v === "string") return { error: c.v as ExcelJS.CellErrorValue["error"] };
  if (typeof c.v === "number") return Number.isFinite(c.v) ? c.v : undefined;
  return c.v as string | boolean;
}

const EXCEL_ERRORS = new Set(["#NULL!", "#DIV/0!", "#VALUE!", "#REF!", "#NAME?", "#NUM!", "#N/A"]);

function writeCells(ws: XWorksheet, sheet: SheetData): void {
  for (const [key, c] of Object.entries(sheet.cells)) {
    let addr: string;
    try {
      const p = parseA1(key);
      addr = toA1(p.row, p.col);
    } catch {
      continue;
    }
    const cell = ws.getCell(addr);
    if (c.f) {
      const result = toResult(c);
      const value: ExcelJS.CellFormulaValue = { formula: addExcelPrefixes(c.f), date1904: false } as ExcelJS.CellFormulaValue;
      if (result !== undefined) {
        // only Excel's standard errors are valid cached results
        if (typeof result === "object" && result && "error" in result && !EXCEL_ERRORS.has(String(result.error))) {
          // leave result empty
        } else value.result = result;
      }
      cell.value = value;
    } else if (c.v !== undefined && c.v !== null) {
      if (c.t === "e" && typeof c.v === "string" && EXCEL_ERRORS.has(c.v)) {
        cell.value = { error: c.v as ExcelJS.CellErrorValue["error"] };
      } else if (typeof c.v === "number" && !Number.isFinite(c.v)) {
        cell.value = { error: "#NUM!" as ExcelJS.CellErrorValue["error"] };
      } else {
        cell.value = c.v as string | number | boolean;
      }
    }
    applyStyle(cell, c.s, c.z);
  }
  if (sheet.colWidths) {
    for (const [k, w] of Object.entries(sheet.colWidths)) {
      const idx = Number(k);
      if (Number.isInteger(idx) && idx >= 0 && typeof w === "number" && w > 0) ws.getColumn(idx + 1).width = w;
    }
  }
  for (const m of sheet.merges ?? []) {
    try {
      const { start, end } = parseRange(m);
      if (start.row === end.row && start.col === end.col) continue;
      ws.mergeCells(start.row + 1, start.col + 1, end.row + 1, end.col + 1);
    } catch {
      /* overlapping/invalid merge: skip */
    }
  }
}

function writeReport(wb: XWorkbook, report: ReportSheet, used: Set<string>): void {
  const ws = wb.addWorksheet(safeSheetName(report.name, used));
  let maxCols = 0;
  report.rows.forEach((row, r) => {
    maxCols = Math.max(maxCols, row.length);
    const nonNull = row.filter((v) => v !== null && v !== undefined && v !== "");
    row.forEach((v, c) => {
      if (v === null || v === undefined) return;
      const cell = ws.getCell(r + 1, c + 1);
      if (typeof v === "number" && !Number.isFinite(v)) cell.value = Number.isNaN(v) ? "NaN" : v > 0 ? "∞" : "-∞";
      else cell.value = v;
      if (typeof v === "number" && Math.abs(v) < 1e15 && !Number.isInteger(v)) cell.numFmt = "#,##0.0000";
    });
    // Section titles (single text cell in first column) in bold.
    if (nonNull.length === 1 && typeof row[0] === "string" && row[0] !== "") ws.getCell(r + 1, 1).font = { bold: true };
  });
  ws.getColumn(1).width = 34;
  for (let c = 2; c <= Math.min(maxCols, 60); c++) ws.getColumn(c).width = 14;
  for (const img of report.images ?? []) {
    try {
      const base64 = img.pngBase64.replace(/^data:image\/png;base64,/, "");
      const id = wb.addImage({ base64, extension: "png" });
      const { row, col } = parseA1(img.at);
      ws.addImage(id, { tl: { col, row }, ext: { width: img.width, height: img.height } } as unknown as ExcelJS.ImageRange);
    } catch {
      /* ignore bad image */
    }
  }
}

/** Serialise a workbook to .xlsx. `includeModel` defaults to true when `wb.model` is set. */
export async function writeXlsx(
  wb: WorkbookData,
  opts?: { includeModel?: boolean; reports?: ReportSheet[] },
): Promise<ArrayBuffer> {
  const out: XWorkbook = new EX.Workbook();
  out.creator = "OpenRiskSim";
  out.created = new Date();
  out.calcProperties = { fullCalcOnLoad: true };
  const used = new Set<string>([MODEL_SHEET_NAME.toLowerCase()]);
  const sheets = wb.sheets.length ? wb.sheets : [{ name: "Sheet1", rows: 1, cols: 1, cells: {} }];
  for (const sheet of sheets) {
    used.add(sheet.name.toLowerCase());
    const ws = out.addWorksheet(sheet.name);
    writeCells(ws, sheet);
  }
  for (const report of opts?.reports ?? []) writeReport(out, report, used);

  const names = wb.names;
  if (names) {
    for (const [name, ref] of Object.entries(names)) {
      try {
        out.definedNames.add(ref, name);
      } catch {
        /* ignore */
      }
    }
  }

  const includeModel = opts?.includeModel ?? wb.model != null;
  if (includeModel && wb.model) {
    const ws = out.addWorksheet(MODEL_SHEET_NAME, { state: "veryHidden" });
    const json = JSON.stringify(wb.model);
    for (let i = 0, r = 1; i < json.length; i += MODEL_CHUNK, r++) {
      ws.getCell(r, 1).value = json.slice(i, i + MODEL_CHUNK);
    }
  }
  const buffer = (await out.xlsx.writeBuffer()) as unknown as ArrayBuffer | Uint8Array;
  if (buffer instanceof ArrayBuffer) return buffer;
  const u8 = buffer as Uint8Array;
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

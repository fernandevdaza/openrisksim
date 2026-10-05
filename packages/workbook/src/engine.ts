/**
 * SpreadsheetEngine: thin wrapper around HyperFormula configured for Excel compatibility.
 */
import { DetailedCellError, HyperFormula } from "hyperformula";
import type { ConfigParams, ExportedChange, RawCellContent, SimpleCellAddress } from "hyperformula";
import type { CellRef, RiskModel } from "@openrisksim/core";
import { parseA1, parseRange, toA1 } from "./address";
import { registerOrsFunctions } from "./orsFunctions";
import type { CellData, CellStyle, SheetData, WorkbookData } from "./types";

export type EngineValue = number | string | boolean | null | { error: string };

/** HyperFormula configuration used by every engine (Excel-compatible). */
export const HF_CONFIG: Partial<ConfigParams> = {
  licenseKey: "gpl-v3",
  language: "enGB",
  useArrayArithmetic: true,
  functionArgSeparator: ",",
  decimalSeparator: ".",
  thousandSeparator: "",
  arrayColumnSeparator: ",",
  arrayRowSeparator: ";",
  leapYear1900: true,
  nullDate: { year: 1899, month: 12, day: 31 },
  smartRounding: true,
  precisionRounding: 14,
  evaluateNullToZero: true,
  maxRows: 1048576,
  maxColumns: 16384,
  dateFormats: ["DD/MM/YYYY", "DD/MM/YY", "YYYY-MM-DD"],
  undoLimit: 50,
};

interface SheetMeta {
  styles: Map<string, { z?: string; s?: CellStyle }>;
  colWidths?: Record<number, number>;
  merges?: string[];
  rows: number;
  cols: number;
}

function rawContent(c: CellData): RawCellContent {
  if (c.f !== undefined && c.f !== "") return `=${c.f}`;
  const v = c.v;
  if (v === undefined || v === null) return null;
  if (typeof v === "string") {
    if (c.t === "e") return v;
    // Force text: HyperFormula would otherwise parse "12", "=x", dates… from strings.
    return `'${v}`;
  }
  if (typeof v === "number" && !Number.isFinite(v)) return "#NUM!";
  return v;
}

function exportValue(v: unknown): EngineValue {
  if (v instanceof DetailedCellError) return { error: v.value };
  if (v === undefined) return null;
  return v as number | string | boolean | null;
}

export class SpreadsheetEngine {
  /** The underlying HyperFormula instance (advanced use: evaluator, worker). */
  readonly hf: HyperFormula;
  private meta = new Map<number, SheetMeta>();
  private listeners = new Set<(changed: CellRef[]) => void>();
  private muted = 0;
  private fileName?: string;
  private names?: Record<string, string>;
  private destroyed = false;
  private readonly onValuesUpdated = (changes: ExportedChange[]) => this.dispatch(changes);

  private constructor(hf: HyperFormula) {
    this.hf = hf;
    this.hf.on("valuesUpdated", this.onValuesUpdated);
  }

  static fromWorkbook(wb: WorkbookData, config?: Partial<ConfigParams>): SpreadsheetEngine {
    registerOrsFunctions();
    const sheets: Record<string, RawCellContent[][]> = {};
    const metas: SheetMeta[] = [];
    for (const sheet of wb.sheets) {
      sheets[sheet.name] = sheetToArray(sheet);
      const styles = new Map<string, { z?: string; s?: CellStyle }>();
      for (const [key, c] of Object.entries(sheet.cells)) {
        if (c.z || c.s) styles.set(normKey(key), { z: c.z, s: c.s });
      }
      metas.push({ styles, colWidths: sheet.colWidths, merges: sheet.merges, rows: sheet.rows, cols: sheet.cols });
    }
    if (!wb.sheets.length) sheets["Sheet1"] = [[]];
    const hf = HyperFormula.buildFromSheets(sheets, { ...HF_CONFIG, ...config });
    const engine = new SpreadsheetEngine(hf);
    wb.sheets.forEach((s, i) => {
      const id = hf.getSheetId(s.name);
      if (id !== undefined) engine.meta.set(id, metas[i]);
    });
    engine.fileName = wb.fileName;
    if (wb.names) {
      engine.names = { ...wb.names };
      for (const [name, ref] of Object.entries(wb.names)) {
        try {
          const expr = `=${ref.startsWith("=") ? ref.slice(1) : ref}`;
          if (hf.isItPossibleToAddNamedExpression(name, expr)) hf.addNamedExpression(name, expr);
        } catch {
          /* unsupported name: ignore */
        }
      }
    }
    hf.clearUndoStack();
    return engine;
  }

  // -------------------------------------------------------------------------------------------
  // Addressing
  // -------------------------------------------------------------------------------------------

  /** Sheet id for a name (throws if missing). */
  sheetId(sheet: string): number {
    const id = this.hf.getSheetId(sheet);
    if (id === undefined) throw new Error(`Unknown sheet: ${sheet}`);
    return id;
  }

  /** Resolve a CellRef to a HyperFormula address (throws on unknown sheet / bad address). */
  address(ref: CellRef): SimpleCellAddress {
    const { row, col } = parseA1(ref.address);
    return { sheet: this.sheetId(ref.sheet), row, col };
  }

  // -------------------------------------------------------------------------------------------
  // Read / write
  // -------------------------------------------------------------------------------------------

  getValue(ref: CellRef): EngineValue {
    return exportValue(this.hf.getCellValue(this.address(ref)));
  }

  /** Formula of a cell including the leading "=" (as typed in a formula bar), or null. */
  getFormula(ref: CellRef): string | null {
    return this.hf.getCellFormula(this.address(ref)) ?? null;
  }

  /** Set a cell: strings starting with "=" are formulas, other strings are parsed like typed input. */
  setCell(ref: CellRef, input: string | number | null): void {
    this.hf.setCellContents(this.address(ref), [[input === "" ? null : input]]);
  }

  getRangeValues(sheet: string, range: string): (number | string | boolean | null)[][] {
    const { start, end } = parseRange(range);
    const sid = this.sheetId(sheet);
    const vals = this.hf.getRangeValues({
      start: { sheet: sid, row: start.row, col: start.col },
      end: { sheet: sid, row: end.row, col: end.col },
    });
    return vals.map((row) => row.map((v) => (v instanceof DetailedCellError ? v.value : (v as number | string | boolean | null))));
  }

  setRangeValues(sheet: string, topLeft: string, values: (number | string | null)[][]): void {
    if (!values.length) return;
    const { row, col } = parseA1(topLeft);
    const sid = this.sheetId(sheet);
    this.hf.setCellContents({ sheet: sid, row, col }, values.map((r) => r.map((v) => (v === "" ? null : v))));
    const m = this.meta.get(sid);
    if (m) {
      m.rows = Math.max(m.rows, row + values.length);
      m.cols = Math.max(m.cols, col + Math.max(...values.map((r) => r.length)));
    }
  }

  sheetNames(): string[] {
    return this.hf.getSheetNames();
  }

  /** Add an empty sheet (no-op if a sheet with that name already exists). */
  addSheet(name: string): void {
    if (this.hf.doesSheetExist(name)) return;
    const real = this.hf.addSheet(name);
    this.meta.set(this.sheetId(real), { styles: new Map(), rows: 1, cols: 1 });
  }

  /** Number format / style kept from the original workbook. */
  getCellFormat(ref: CellRef): { z?: string; s?: CellStyle } | undefined {
    const id = this.hf.getSheetId(ref.sheet);
    if (id === undefined) return undefined;
    return this.meta.get(id)?.styles.get(normKey(ref.address));
  }

  /** Set/clear the number format or style of a cell (kept in toWorkbookData). */
  setCellFormat(ref: CellRef, fmt: { z?: string; s?: CellStyle } | undefined): void {
    const id = this.sheetId(ref.sheet);
    let m = this.meta.get(id);
    if (!m) {
      m = { styles: new Map(), rows: 1, cols: 1 };
      this.meta.set(id, m);
    }
    const key = normKey(ref.address);
    if (!fmt || (!fmt.z && !fmt.s)) m.styles.delete(key);
    else m.styles.set(key, fmt);
  }

  /** Serialise current state (formulas + values) keeping formats/styles/widths/merges. */
  toWorkbookData(model: RiskModel | null): WorkbookData {
    const sheets: SheetData[] = [];
    for (const name of this.hf.getSheetNames()) {
      const id = this.sheetId(name);
      const m = this.meta.get(id);
      const values = this.hf.getSheetValues(id);
      const formulas = this.hf.getSheetFormulas(id);
      const cells: Record<string, CellData> = {};
      let maxRow = -1;
      let maxCol = -1;
      const height = Math.max(values.length, formulas.length);
      for (let r = 0; r < height; r++) {
        const vr = values[r] ?? [];
        const fr = formulas[r] ?? [];
        const width = Math.max(vr.length, fr.length);
        for (let c = 0; c < width; c++) {
          const f = fr[c];
          const v = vr[c];
          if (f === undefined && (v === null || v === undefined)) continue;
          // Values spilled by an array formula belong to the formula cell; writing them as
          // constants would block the spill (#SPILL!) when the workbook is reloaded.
          if (f === undefined && this.hf.isCellPartOfArray({ sheet: id, row: r, col: c })) continue;
          const cell: CellData = {};
          if (f !== undefined) cell.f = f.startsWith("=") ? f.slice(1) : f;
          if (v instanceof DetailedCellError) {
            cell.v = v.value;
            cell.t = "e";
          } else if (v !== null && v !== undefined) {
            cell.v = v as number | string | boolean;
            cell.t = typeof v === "number" ? "n" : typeof v === "boolean" ? "b" : "s";
          }
          cells[toA1(r, c)] = cell;
          if (r > maxRow) maxRow = r;
          if (c > maxCol) maxCol = c;
        }
      }
      if (m) {
        for (const [key, st] of m.styles) {
          const cell = cells[key] ?? (cells[key] = {});
          if (st.z) cell.z = st.z;
          if (st.s) cell.s = st.s;
          const p = parseA1(key);
          if (p.row > maxRow) maxRow = p.row;
          if (p.col > maxCol) maxCol = p.col;
        }
      }
      const sheet: SheetData = {
        name,
        rows: Math.max(maxRow + 1, m?.rows ?? 1, 1),
        cols: Math.max(maxCol + 1, m?.cols ?? 1, 1),
        cells,
      };
      if (m?.colWidths) sheet.colWidths = { ...m.colWidths };
      if (m?.merges) sheet.merges = [...m.merges];
      sheets.push(sheet);
    }
    const wb: WorkbookData = { sheets, model };
    if (this.fileName !== undefined) wb.fileName = this.fileName;
    if (this.names) wb.names = { ...this.names };
    return wb;
  }

  // -------------------------------------------------------------------------------------------
  // Events / undo
  // -------------------------------------------------------------------------------------------

  onChange(cb: (changed: CellRef[]) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private dispatch(changes: ExportedChange[]): void {
    if (this.muted > 0 || this.listeners.size === 0) return;
    const refs: CellRef[] = [];
    const names = new Map<number, string>();
    for (const ch of changes) {
      const addr = (ch as { address?: SimpleCellAddress }).address;
      if (!addr || typeof addr.sheet !== "number") continue;
      let sheet = names.get(addr.sheet);
      if (sheet === undefined) {
        sheet = this.hf.getSheetName(addr.sheet) ?? "";
        names.set(addr.sheet, sheet);
      }
      refs.push({ sheet, address: toA1(addr.row, addr.col) });
    }
    if (!refs.length) return;
    for (const cb of [...this.listeners]) cb(refs);
  }

  /** Suppress onChange notifications (nested). Used by the evaluator during simulations. */
  mute(): void {
    this.muted++;
  }

  unmute(): void {
    if (this.muted > 0) this.muted--;
  }

  undo(): void {
    if (this.hf.isThereSomethingToUndo()) this.hf.undo();
  }

  redo(): void {
    if (this.hf.isThereSomethingToRedo()) this.hf.redo();
  }

  canUndo(): boolean {
    return this.hf.isThereSomethingToUndo();
  }

  canRedo(): boolean {
    return this.hf.isThereSomethingToRedo();
  }

  /**
   * Temporarily detach the undo/redo history so that bulk programmatic edits (simulation trials)
   * are not recorded. Returns a function that restores the saved history. Relies on HyperFormula
   * internals; falls back to clearing nothing (edits are then recorded, bounded by undoLimit).
   */
  suspendUndo(): () => void {
    const ur = (this.hf as unknown as { _crudOperations?: { undoRedo?: Record<string, unknown> } })._crudOperations?.undoRedo;
    if (!ur || !Array.isArray(ur.undoStack) || !Array.isArray(ur.redoStack) || typeof ur.undoLimit !== "number") {
      return () => {};
    }
    const saved = { undo: ur.undoStack, redo: ur.redoStack, limit: ur.undoLimit };
    ur.undoStack = [];
    ur.redoStack = [];
    ur.undoLimit = 0;
    return () => {
      ur.undoStack = saved.undo;
      ur.redoStack = saved.redo;
      ur.undoLimit = saved.limit;
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.listeners.clear();
    try {
      this.hf.off("valuesUpdated", this.onValuesUpdated);
    } catch {
      /* ignore */
    }
    this.hf.destroy();
  }
}

function normKey(a1: string): string {
  const { row, col } = parseA1(a1);
  return toA1(row, col);
}

function sheetToArray(sheet: SheetData): RawCellContent[][] {
  const rows: RawCellContent[][] = [];
  for (const [key, c] of Object.entries(sheet.cells)) {
    const content = rawContent(c);
    if (content === null) continue;
    let p: { row: number; col: number };
    try {
      p = parseA1(key);
    } catch {
      continue;
    }
    const row = rows[p.row] ?? (rows[p.row] = []);
    row[p.col] = content;
  }
  // fill holes (HyperFormula expects dense arrays)
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? (rows[r] = []);
    for (let c = 0; c < row.length; c++) if (row[c] === undefined) row[c] = null;
  }
  return rows;
}

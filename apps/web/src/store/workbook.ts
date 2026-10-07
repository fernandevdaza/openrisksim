import { create } from "zustand";
import type { CellRef, ModelEvaluator } from "@openrisksim/core";
import { SpreadsheetEngine, type CellStyle, type SheetData, type WorkbookData } from "@openrisksim/workbook";
import { sanitizeModel, useModelStore } from "./model";
import { boundsToRange, parseRangeBounds, toAddress, type RangeBounds } from "../lib/a1";

export interface Selection {
  sheet: string;
  /** "B2:D9" or "B2" */
  range: string;
}

export type CellValue = number | string | boolean | null;

type StepEvaluator = ModelEvaluator & { baseInputs(): Float64Array; dispose(): void };

export const HIDDEN_SHEET_PREFIX = "_openrisksim";
export const MIN_ROWS = 200;
export const MIN_COLS = 26;

export interface WorkbookState {
  engine: SpreadsheetEngine | null;
  /** Metadata of the workbook (formats, styles, column widths, dimensions). Values live in `engine`. */
  workbook: WorkbookData | null;
  fileName: string;
  sheets: string[];
  activeSheet: string;
  selection: Selection;
  /** Active cell (cursor) inside the selection, A1. */
  cursor: string;
  /** Bumps on every change (re-render signal). */
  version: number;
  /** Bumps only on user edits (used to invalidate simulation results). */
  editVersion: number;
  /** Non-null while "step" (single trial) values are shown in the grid. */
  stepEvaluator: StepEvaluator | null;

  loadWorkbook(wb: WorkbookData): void;
  newBlank(): void;
  getSelectionValues(): CellValue[][];
  writeRange(sheet: string, topLeft: string, values: (number | string | null)[][]): void;
  addSheet(name: string, rows?: (number | string | null)[][]): void;
  setActiveSheet(name: string): void;
  setSelection(sel: Selection, cursor?: string): void;
  setCell(ref: CellRef, input: string | number | null): void;
  /**
   * Run engine edits (`fn`) as one user edit: ends step mode, grows the sheet so `touched` is
   * visible and bumps the versions.
   */
  mutate(sheet: string, touched: RangeBounds | null, fn: (engine: SpreadsheetEngine) => void): void;
  /** Set (or clear with undefined) the number format / style of cells. */
  setFormats(sheet: string, entries: [address: string, fmt: { z?: string; s?: CellStyle } | undefined][]): void;
  /** Format of a cell (as rendered by the grid). */
  formatOf(sheet: string, address: string): { z?: string; s?: CellStyle } | undefined;
  clearRange(sheet: string, range: string): void;
  undo(): void;
  redo(): void;
  setColWidth(sheet: string, col: number, px: number): void;
  sheetMeta(name: string): SheetData | undefined;
  /** Serialise workbook + model (formats/styles merged back). Ends step mode first unless `keepStep`. */
  snapshot(opts?: { keepStep?: boolean }): WorkbookData;
  setStepEvaluator(ev: StepEvaluator | null): void;
  endStep(): void;
}

let unsubscribeEngine: (() => void) | null = null;

/** Model change tied to the last engine edit (cut/paste moving definitions), undone with it. */
let linkedModelUndo: { version: number; redoVersion: number; undo: () => void; redo: () => void } | null = null;
export function linkModelUndo(undo: () => void, redo: () => void): void {
  linkedModelUndo = { version: useWorkbookStore.getState().editVersion, redoVersion: -1, undo, redo };
}
let muted = 0;
let bumpScheduled = false;

/** Run `fn` without triggering grid re-renders for engine change events (inline simulations). */
export async function withMutedChanges<T>(fn: () => Promise<T>): Promise<T> {
  muted++;
  try {
    return await fn();
  } finally {
    muted--;
  }
}

function scheduleBump(): void {
  if (muted > 0 || bumpScheduled) return;
  bumpScheduled = true;
  const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb: () => void) => setTimeout(cb, 16);
  raf(() => {
    bumpScheduled = false;
    useWorkbookStore.setState((s) => ({ version: s.version + 1 }));
  });
}

export function blankWorkbook(sheetName = "Hoja1"): WorkbookData {
  return {
    sheets: [{ name: sheetName, rows: 100, cols: 26, cells: {} }],
    model: null,
    fileName: "libro.xlsx",
  };
}

function visibleSheets(engine: SpreadsheetEngine): string[] {
  return engine.sheetNames().filter((n) => !n.startsWith(HIDDEN_SHEET_PREFIX));
}

function rangeSize(values: unknown[][]): { rows: number; cols: number } {
  return { rows: values.length, cols: values.reduce((m, r) => Math.max(m, r.length), 0) };
}

export const useWorkbookStore = create<WorkbookState>()((set, get) => {
  /** Grow sheet metadata dims so the grid shows written data. */
  const growMeta = (sheet: string, b: RangeBounds) => {
    const wb = get().workbook;
    if (!wb) return;
    const meta = wb.sheets.find((s) => s.name === sheet);
    if (!meta) return;
    if (b.r1 + 1 > meta.rows || b.c1 + 1 > meta.cols) {
      const sheets = wb.sheets.map((s) => (s.name === sheet ? { ...s, rows: Math.max(s.rows, b.r1 + 1), cols: Math.max(s.cols, b.c1 + 1) } : s));
      set({ workbook: { ...wb, sheets } });
    }
  };
  const edited = () => set((s) => ({ version: s.version + 1, editVersion: s.editVersion + 1 }));

  return {
    engine: null,
    workbook: null,
    fileName: "libro.xlsx",
    sheets: [],
    activeSheet: "",
    selection: { sheet: "", range: "A1" },
    cursor: "A1",
    version: 0,
    editVersion: 0,
    stepEvaluator: null,

    loadWorkbook: (wb) => {
      get().endStep();
      unsubscribeEngine?.();
      unsubscribeEngine = null;
      get().engine?.destroy();
      const engine = SpreadsheetEngine.fromWorkbook(wb);
      unsubscribeEngine = engine.onChange(() => scheduleBump());
      const sheets = visibleSheets(engine);
      // make sure we have metadata for every visible sheet
      const metaSheets = wb.sheets.filter((s) => !s.name.startsWith(HIDDEN_SHEET_PREFIX));
      for (const name of sheets) if (!metaSheets.some((s) => s.name === name)) metaSheets.push({ name, rows: 100, cols: 26, cells: {} });
      const first = sheets[0] ?? "";
      useModelStore.getState().setModel(sanitizeModel(wb.model));
      set((s) => ({
        engine,
        workbook: { ...wb, sheets: metaSheets },
        fileName: wb.fileName || "libro.xlsx",
        sheets,
        activeSheet: first,
        selection: { sheet: first, range: "A1" },
        cursor: "A1",
        version: s.version + 1,
        editVersion: s.editVersion + 1,
      }));
    },

    newBlank: () => get().loadWorkbook(blankWorkbook()),

    getSelectionValues: () => {
      const { engine, selection } = get();
      if (!engine || !selection.sheet) return [];
      try {
        return engine.getRangeValues(selection.sheet, selection.range);
      } catch {
        return [];
      }
    },

    writeRange: (sheet, topLeft, values) => {
      const { engine } = get();
      if (!engine || values.length === 0) return;
      get().endStep();
      engine.setRangeValues(sheet, topLeft, values);
      const tl = parseRangeBounds(topLeft);
      if (tl) {
        const { rows, cols } = rangeSize(values);
        growMeta(sheet, { r0: tl.r0, c0: tl.c0, r1: tl.r0 + rows - 1, c1: tl.c0 + Math.max(cols, 1) - 1 });
      }
      edited();
    },

    addSheet: (name, rows) => {
      const { engine, workbook } = get();
      if (!engine || !workbook) return;
      get().endStep();
      let finalName = name;
      let i = 2;
      const existing = new Set(engine.sheetNames().map((n) => n.toLowerCase()));
      while (existing.has(finalName.toLowerCase())) finalName = `${name} (${i++})`;
      engine.addSheet(finalName);
      const size = rows ? rangeSize(rows) : { rows: 0, cols: 0 };
      set({
        workbook: { ...workbook, sheets: [...workbook.sheets, { name: finalName, rows: Math.max(100, size.rows), cols: Math.max(26, size.cols), cells: {} }] },
        sheets: visibleSheets(engine),
      });
      if (rows && rows.length) engine.setRangeValues(finalName, "A1", rows);
      set({ activeSheet: finalName, selection: { sheet: finalName, range: "A1" }, cursor: "A1" });
      edited();
    },

    setActiveSheet: (name) => {
      if (name === get().activeSheet) return;
      set({ activeSheet: name, selection: { sheet: name, range: "A1" }, cursor: "A1" });
    },

    setSelection: (sel, cursor) => {
      const b = parseRangeBounds(sel.range);
      const normalised = b ? boundsToRange(b) : sel.range;
      set({
        selection: { sheet: sel.sheet, range: normalised },
        cursor: cursor ?? (b ? toAddress(b.r0, b.c0) : "A1"),
        activeSheet: sel.sheet || get().activeSheet,
      });
    },

    setCell: (ref, input) => {
      const { engine } = get();
      if (!engine) return;
      get().endStep();
      engine.setCell(ref, input);
      const b = parseRangeBounds(ref.address);
      if (b) growMeta(ref.sheet, b);
      edited();
    },

    mutate: (sheet, touched, fn) => {
      const { engine } = get();
      if (!engine) return;
      get().endStep();
      fn(engine);
      if (touched) growMeta(sheet, touched);
      edited();
    },

    setFormats: (sheet, entries) => {
      const { workbook, engine } = get();
      if (!workbook || !entries.length) return;
      const sheets = workbook.sheets.map((s) => {
        if (s.name !== sheet) return s;
        const cells = { ...s.cells };
        for (const [addr, fmt] of entries) {
          const cur = cells[addr];
          if (!fmt || (!fmt.z && !fmt.s)) {
            if (cur && (cur.z || cur.s)) {
              const { z: _z, s: _s, ...rest } = cur;
              void _z;
              void _s;
              cells[addr] = rest;
            }
          } else cells[addr] = { ...(cur ?? {}), z: fmt.z, s: fmt.s };
          try {
            engine?.setCellFormat({ sheet, address: addr }, fmt);
          } catch {
            /* unknown sheet */
          }
        }
        return { ...s, cells };
      });
      set((s) => ({ workbook: { ...workbook, sheets }, version: s.version + 1 }));
    },

    formatOf: (sheet, address) => {
      const c = get().workbook?.sheets.find((s) => s.name === sheet)?.cells[address];
      if (c && (c.z || c.s)) return { z: c.z, s: c.s };
      try {
        return get().engine?.getCellFormat({ sheet, address });
      } catch {
        return undefined;
      }
    },

    clearRange: (sheet, range) => {
      const { engine } = get();
      const b = parseRangeBounds(range);
      if (!engine || !b) return;
      get().endStep();
      const values: null[][] = [];
      for (let r = b.r0; r <= b.r1; r++) values.push(new Array(b.c1 - b.c0 + 1).fill(null));
      engine.setRangeValues(sheet, toAddress(b.r0, b.c0), values);
      edited();
    },

    undo: () => {
      get().endStep();
      const link = linkedModelUndo && linkedModelUndo.version === get().editVersion ? linkedModelUndo : null;
      get().engine?.undo();
      edited();
      if (link) {
        link.undo();
        link.redoVersion = get().editVersion;
      }
    },
    redo: () => {
      get().endStep();
      const link = linkedModelUndo && linkedModelUndo.redoVersion === get().editVersion ? linkedModelUndo : null;
      get().engine?.redo();
      edited();
      if (link) {
        link.redo();
        link.version = get().editVersion;
      }
    },

    setColWidth: (sheet, col, px) => {
      const wb = get().workbook;
      if (!wb) return;
      // stored in Excel character units (≈ 7px per char + 5px padding)
      const chars = Math.max(1, Math.round(((px - 5) / 7) * 100) / 100);
      const sheets = wb.sheets.map((s) => (s.name === sheet ? { ...s, colWidths: { ...(s.colWidths ?? {}), [col]: chars } } : s));
      set((s) => ({ workbook: { ...wb, sheets }, version: s.version + 1 }));
    },

    sheetMeta: (name) => get().workbook?.sheets.find((s) => s.name === name),

    snapshot: (opts) => {
      const { engine, workbook, fileName } = get();
      if (!opts?.keepStep) get().endStep();
      const model = useModelStore.getState().model;
      if (!engine) return { ...blankWorkbook(), model };
      const data = engine.toWorkbookData(model);
      const metaByName = new Map((workbook?.sheets ?? []).map((s) => [s.name, s]));
      const sheets = data.sheets.map((sheet) => {
        const meta = metaByName.get(sheet.name);
        if (!meta) return sheet;
        const cells = { ...sheet.cells };
        for (const [addr, mc] of Object.entries(meta.cells)) {
          if (!mc.z && !mc.s) continue;
          const c = cells[addr];
          if (c) cells[addr] = { ...c, z: c.z ?? mc.z, s: c.s ?? mc.s };
          else if (mc.s) cells[addr] = { s: mc.s, z: mc.z };
        }
        return {
          ...sheet,
          cells,
          rows: Math.max(sheet.rows, meta.rows),
          cols: Math.max(sheet.cols, meta.cols),
          colWidths: { ...(sheet.colWidths ?? {}), ...(meta.colWidths ?? {}) },
          merges: sheet.merges ?? meta.merges,
        };
      });
      return { ...data, sheets, model, fileName };
    },

    setStepEvaluator: (ev) => {
      const prev = get().stepEvaluator;
      if (prev && prev !== ev) prev.dispose();
      set((s) => ({ stepEvaluator: ev, version: s.version + 1 }));
    },

    endStep: () => {
      const ev = get().stepEvaluator;
      if (!ev) return;
      try {
        ev.dispose();
      } catch {
        /* engine may already be destroyed */
      }
      set((s) => ({ stepEvaluator: null, version: s.version + 1 }));
    },
  };
});

/** Display dimensions for a sheet (data extent + margin so users can type beyond it). */
export function displayDims(meta: SheetData | undefined): { rows: number; cols: number } {
  return {
    rows: Math.max(MIN_ROWS, (meta?.rows ?? 0) + 100),
    cols: Math.max(MIN_COLS, (meta?.cols ?? 0) + 6),
  };
}

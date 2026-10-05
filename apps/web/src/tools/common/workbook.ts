/**
 * Store-backed helpers shared by the tools: reading ranges, exporting result sheets, building
 * evaluators. Kept free of React so they can be called from event handlers.
 */
import type { CellRef, ForecastDef, RiskModel, AssumptionDef } from "@openrisksim/core";
import { createWorkbookEvaluator } from "@openrisksim/workbook";
import { useWorkbookStore } from "../../store/workbook";
import { useSimulationStore } from "../../store/simulation";
import { autoColumnWidths, flattenNumbers, formatRangeRef, parseRangeRef, uniqueSheetName, type CellValue } from "./parse";

export class ToolError extends Error {
  /** i18n key (namespace tools) + interpolation values. */
  constructor(
    public key: string,
    public values?: Record<string, unknown>,
  ) {
    super(key);
  }
}

/** "Hoja!B2:B9" for the current grid selection ("" when there is none). */
export function selectionRef(): string {
  const sel = useWorkbookStore.getState().selection;
  if (!sel || !sel.range || !sel.sheet) return "";
  return formatRangeRef(sel.sheet, sel.range);
}

/** Top-left cell of the current selection as a CellRef. */
export function selectionCell(): CellRef | null {
  const sel = useWorkbookStore.getState().selection;
  if (!sel || !sel.range || !sel.sheet) return null;
  return { sheet: sel.sheet, address: sel.range.split(":")[0].replace(/\$/g, "").toUpperCase() };
}

/** Read the raw values of a range reference. Throws ToolError. */
export function readRange(ref: string): { sheet: string; range: string; values: CellValue[][] } {
  const st = useWorkbookStore.getState();
  if (!st.engine) throw new ToolError("common.errors.noWorkbook");
  const parsed = parseRangeRef(ref);
  if (!parsed) throw new ToolError("common.errors.badRange", { ref });
  const sheet = parsed.sheet ?? st.activeSheet;
  if (!st.engine.sheetNames().includes(sheet)) throw new ToolError("common.errors.noSheet", { sheet });
  const values = st.engine.getRangeValues(sheet, parsed.range) as CellValue[][];
  return { sheet, range: parsed.range, values };
}

/** Numbers contained in a range (row-major), non-numeric cells skipped. */
export function readRangeNumbers(ref: string): number[] {
  return flattenNumbers(readRange(ref).values);
}

/** Parse a single-cell reference ("Hoja!C5" or "C5" on the active sheet). */
export function parseCellRef(ref: string): CellRef | null {
  const parsed = parseRangeRef(ref);
  if (!parsed || parsed.range.includes(":")) return null;
  return { sheet: parsed.sheet ?? useWorkbookStore.getState().activeSheet, address: parsed.range };
}

/** Current numeric value of a cell (NaN when not numeric). */
export function cellNumber(ref: CellRef): number {
  const engine = useWorkbookStore.getState().engine;
  if (!engine) return NaN;
  const v = engine.getValue(ref);
  return typeof v === "number" ? v : NaN;
}

function existingSheetNames(): string[] {
  const st = useWorkbookStore.getState();
  if (st.engine) return st.engine.sheetNames();
  return st.workbook?.sheets.map((s) => s.name) ?? [];
}

/** Write rows to a new sheet with a unique name; returns the name used. Formulas are strings starting with "=". */
export function exportToNewSheet(baseName: string, rows: (number | string | null)[][]): string {
  const name = uniqueSheetName(baseName, existingSheetNames());
  const clean = rows.map((r) => r.map((v) => (typeof v === "number" && !Number.isFinite(v) ? null : v)));
  const st = useWorkbookStore.getState();
  st.addSheet(name, clean);
  // widen label columns so the exported tables are readable
  try {
    autoColumnWidths(clean).forEach((px, col) => {
      if (px) useWorkbookStore.getState().setColWidth?.(name, col, px);
    });
  } catch {
    /* widths are cosmetic */
  }
  return name;
}

/** Write numbers into cells (used by "Apply solution"). */
export function writeCells(cells: { ref: CellRef; value: number }[]): void {
  const st = useWorkbookStore.getState();
  for (const c of cells) st.writeRange(c.ref.sheet, c.ref.address, [[c.value]]);
}

/** Values of a forecast from the last simulation (finite only). */
export function forecastValues(forecastId: string): Float64Array | null {
  const res = useSimulationStore.getState().result;
  const f = res?.forecasts[forecastId];
  if (!f) return null;
  return f.values.filter((v) => Number.isFinite(v));
}

export function enabledAssumptions(model: RiskModel): AssumptionDef[] {
  return model.assumptions.filter((a) => a.enabled);
}

/**
 * A copy of the model whose evaluator inputs are exactly `inputCells` (as pseudo-assumptions with a
 * fixed distribution) and whose outputs are `outputs` (forecasts or plain cells). Other assumption
 * cells keep their current (base) values. Used for break-even, optimization and constraint cells.
 */
export function modelForCells(base: RiskModel, inputCells: { id: string; cell: CellRef }[], outputs: { id: string; cell: CellRef; name?: string }[]): RiskModel {
  return {
    ...base,
    assumptions: inputCells.map((c) => ({
      id: c.id,
      name: c.id,
      cell: c.cell,
      distribution: { id: "fixed", params: { value: 0 } },
      enabled: true,
    })),
    forecasts: outputs.map((o): ForecastDef => ({ id: o.id, name: o.name ?? o.id, cell: o.cell })),
    correlations: [],
    decisions: [],
  };
}

/**
 * Run `fn` with a deterministic workbook evaluator for `model` and always dispose it
 * (the evaluator restores the original cell contents).
 */
export function withEvaluator<T>(model: RiskModel, fn: (ev: ReturnType<typeof createWorkbookEvaluator>) => T): T {
  const engine = useWorkbookStore.getState().engine;
  if (!engine) throw new ToolError("common.errors.noWorkbook");
  const ev = createWorkbookEvaluator(engine, model);
  try {
    return fn(ev);
  } finally {
    ev.dispose();
  }
}

/** Translate an unknown error into a message using the tools namespace. */
export function errorMessage(e: unknown, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (e instanceof ToolError) return t(e.key, e.values);
  if (e instanceof Error) return e.message;
  return String(e);
}

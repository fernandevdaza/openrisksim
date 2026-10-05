/**
 * Fast ModelEvaluator over a SpreadsheetEngine: writes assumption values, recalculates
 * (incrementally, inside one HyperFormula batch) and reads forecast cells.
 */
import type { RawCellContent, SimpleCellAddress } from "hyperformula";
import type { CellRef, ModelEvaluator, RiskModel } from "@openrisksim/core";
import { createDistribution } from "@openrisksim/distributions";
import type { SpreadsheetEngine } from "./engine";

export type WorkbookEvaluator = ModelEvaluator & {
  /** Current values of the enabled assumption cells (before any trial was evaluated). */
  baseInputs(): Float64Array;
  /** Restore original cell contents (assumptions + decisions) and the undo history. */
  dispose(): void;
};

function sameAddr(a: SimpleCellAddress, b: SimpleCellAddress): boolean {
  return a.sheet === b.sheet && a.row === b.row && a.col === b.col;
}

/**
 * Create an evaluator. Inputs follow the order of *enabled* assumptions in `model.assumptions`,
 * outputs follow `model.forecasts`. Non-numeric/error forecast values become NaN.
 *
 * NOTE: the Float64Array returned by `evaluate` is reused between calls — copy it to keep it.
 * While the evaluator is alive, engine change notifications are muted and edits are not recorded
 * in the undo history; call `dispose()` when done.
 */
export function createWorkbookEvaluator(
  engine: SpreadsheetEngine,
  model: RiskModel,
  overrides?: { decisions?: { ref: CellRef; value: number }[] },
): WorkbookEvaluator {
  const hf = engine.hf;
  const enabled = model.assumptions.filter((a) => a.enabled);
  const inAddr: SimpleCellAddress[] = enabled.map((a) => engine.address(a.cell));
  const outAddr: SimpleCellAddress[] = model.forecasts.map((f) => engine.address(f.cell));
  const decisions = (overrides?.decisions ?? []).map((d) => ({ addr: engine.address(d.ref), value: d.value }));

  // Snapshot original contents of every cell we may overwrite.
  const touched: SimpleCellAddress[] = [];
  for (const a of [...inAddr, ...decisions.map((d) => d.addr)]) {
    if (!touched.some((t) => sameAddr(t, a))) touched.push(a);
  }
  const originals: RawCellContent[] = touched.map((a) => hf.getCellSerialized(a));

  engine.mute();
  const restoreUndo = engine.suspendUndo();
  let disposed = false;

  if (decisions.length) {
    hf.batch(() => {
      for (const d of decisions) hf.setCellContents(d.addr, d.value);
    });
  }

  // Base inputs: current numeric value of each assumption cell (formula results included).
  const base = new Float64Array(enabled.length);
  for (let i = 0; i < enabled.length; i++) {
    const v = hf.getCellValue(inAddr[i]);
    if (typeof v === "number" && Number.isFinite(v)) base[i] = v;
    else {
      let m = NaN;
      try {
        m = createDistribution(enabled[i].distribution).mean();
      } catch {
        /* invalid spec */
      }
      base[i] = m;
    }
  }

  const nIn = inAddr.length;
  const nOut = outAddr.length;
  const out = new Float64Array(nOut);

  const setInputs = (inputs: Float64Array) => {
    for (let i = 0; i < nIn; i++) hf.setCellContents(inAddr[i], inputs[i]);
  };

  const evaluate = (inputs: Float64Array): Float64Array => {
    if (disposed) throw new Error("Evaluator disposed");
    if (nIn === 1) hf.setCellContents(inAddr[0], inputs[0]);
    else if (nIn > 0) hf.batch(() => setInputs(inputs));
    for (let j = 0; j < nOut; j++) {
      const v = hf.getCellValue(outAddr[j]);
      out[j] = typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : NaN;
    }
    return out;
  };

  return {
    evaluate,
    baseInputs: () => base.slice(),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      try {
        hf.batch(() => {
          touched.forEach((a, i) => hf.setCellContents(a, [[originals[i] as RawCellContent]]));
        });
      } finally {
        restoreUndo();
        engine.unmute();
      }
    },
  };
}

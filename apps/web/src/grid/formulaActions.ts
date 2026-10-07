/**
 * Commands of the Formulas ribbon tab / formula bar (Insert function, Show formulas, Evaluate,
 * Defined names, trace precedents / dependents).
 */
import { create } from "zustand";
import { useUiStore } from "../store/ui";
import { useWorkbookStore } from "../store/workbook";
import { commitEdit, focusEditor, useEditStore } from "./editState";
import { parseRangeBounds, addressesIn } from "../lib/a1";
import i18n from "../i18n";

/** Open the Insert Function dialog; an edit in progress is kept (the function is inserted into it). */
export function openInsertFunction(fn?: string): void {
  const ed = useEditStore.getState().editing;
  if (ed) useEditStore.getState().patch({ hold: true, error: null });
  if (!useWorkbookStore.getState().engine) return;
  useUiStore.getState().openDialog({ type: "insertFunction", fn });
}

/** Called when a dialog that held the edit closes. */
export function releaseEdit(): void {
  const ed = useEditStore.getState().editing;
  if (!ed || !ed.hold) return;
  useEditStore.getState().patch({ hold: false });
  const st = useWorkbookStore.getState();
  if (st.activeSheet !== ed.sheet && st.sheets.includes(ed.sheet)) st.setActiveSheet(ed.sheet);
  st.setSelection({ sheet: ed.sheet, range: ed.address }, ed.address);
  requestAnimationFrame(() => focusEditor());
}

export function toggleShowFormulas(): void {
  const ui = useUiStore.getState();
  ui.setShowFormulas(!ui.showFormulas);
}

export function openEvaluateFormula(): void {
  if (!commitEdit()) return;
  const st = useWorkbookStore.getState();
  const ref = { sheet: st.selection.sheet || st.activeSheet, address: st.cursor };
  if (!st.engine?.getFormula(ref)) {
    useUiStore.getState().notify(i18n.t("formula.noFormula", { cell: ref.address }), "info");
    return;
  }
  useUiStore.getState().openDialog({ type: "evaluateFormula", cell: ref });
}

export function openNames(): void {
  if (!commitEdit()) return;
  useUiStore.getState().openDialog({ type: "names" });
}

// ---------------------------------------------------------------------------------------------
// Trace precedents / dependents
// ---------------------------------------------------------------------------------------------

export interface TraceEdge {
  kind: "prec" | "dep";
  from: { sheet: string; range: string };
  to: { sheet: string; range: string };
}

interface TraceStore {
  origin: { sheet: string; address: string } | null;
  prec: number;
  dep: number;
  edges: TraceEdge[];
}
export const useTraceStore = create<TraceStore>()(() => ({ origin: null, prec: 0, dep: 0, edges: [] }));

export function clearTraces(): void {
  if (useTraceStore.getState().edges.length || useTraceStore.getState().origin) useTraceStore.setState({ origin: null, prec: 0, dep: 0, edges: [] });
}

const key = (x: { sheet: string; range: string }) => `${x.sheet}!${x.range}`;

/** Cells (formula cells only for precedents' expansion) inside a range, capped. */
function cellsOf(x: { sheet: string; range: string }, formulasOnly: boolean): { sheet: string; range: string }[] {
  const b = parseRangeBounds(x.range);
  const engine = useWorkbookStore.getState().engine;
  if (!b || !engine) return [];
  const out: { sheet: string; range: string }[] = [];
  for (const a of addressesIn(b).slice(0, 400)) {
    try {
      if (!formulasOnly || engine.getFormula({ sheet: x.sheet, address: a })) out.push({ sheet: x.sheet, range: a });
    } catch {
      /* ignore */
    }
  }
  return out;
}

/** Each click goes one level further (Excel). */
export function trace(kind: "prec" | "dep"): void {
  if (!commitEdit()) return;
  const st = useWorkbookStore.getState();
  const engine = st.engine;
  if (!engine) return;
  const here = { sheet: st.selection.sheet || st.activeSheet, address: st.cursor };
  let s = useTraceStore.getState();
  if (!s.origin || s.origin.sheet !== here.sheet || s.origin.address !== here.address) {
    useTraceStore.setState({ origin: here, prec: 0, dep: 0, edges: [] });
    s = useTraceStore.getState();
  }
  const level = kind === "prec" ? s.prec : s.dep;
  // frontier: the origin, or the cells reached in the previous level
  let frontier: { sheet: string; range: string }[] = [{ sheet: here.sheet, range: here.address }];
  if (level > 0) {
    const reached = s.edges.filter((e) => e.kind === kind).map((e) => (kind === "prec" ? e.from : e.to));
    const seen = new Set(s.edges.filter((e) => e.kind === kind).map((e) => key(kind === "prec" ? e.to : e.from)));
    frontier = reached.flatMap((x) => cellsOf(x, true)).filter((x) => !seen.has(key(x)));
  }
  const existing = new Set(s.edges.map((e) => `${e.kind}|${key(e.from)}|${key(e.to)}`));
  const added: TraceEdge[] = [];
  for (const cell of frontier.slice(0, 200)) {
    const ref = { sheet: cell.sheet, address: cell.range };
    const list = kind === "prec" ? engine.precedents(ref) : engine.dependents(ref);
    for (const other of list) {
      const edge: TraceEdge = kind === "prec" ? { kind, from: other, to: cell } : { kind, from: cell, to: other };
      const k = `${kind}|${key(edge.from)}|${key(edge.to)}`;
      if (existing.has(k)) continue;
      existing.add(k);
      added.push(edge);
    }
  }
  if (!added.length) {
    useUiStore.getState().notify(i18n.t(kind === "prec" ? "formula.noPrecedents" : "formula.noDependents"), "info");
    return;
  }
  useTraceStore.setState({ edges: [...s.edges, ...added], [kind]: level + 1 } as Partial<TraceStore>);
}

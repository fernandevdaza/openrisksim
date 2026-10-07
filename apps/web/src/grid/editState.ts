import { create } from "zustand";
import type { CellRef } from "@openrisksim/core";
import { translateFormula } from "@openrisksim/workbook";
import { useWorkbookStore } from "../store/workbook";
import { useUiStore } from "../store/ui";
import { parseUserInput, separatorsFor } from "../lib/numberFormat";
import { toDisplayFormula, toEngineFormula } from "../lib/formulaI18n";
import { boundsRefText, caretContext, cycleReference, formulaRefs, missingParens, refToText, type RefPart } from "../lib/formulaTokens";
import { normalise, parseAddress, parseRangeBounds, toAddress, type CellPos, type RangeBounds } from "../lib/a1";
import { isCoarsePointer } from "../lib/responsive";
import i18n from "../i18n";

/** A reference inserted by clicking/dragging on the sheet (Excel "Point" mode). */
export interface PointState {
  start: number;
  end: number;
  sheet: string;
  anchor: CellPos;
  focus: CellPos;
}

export interface EditState {
  sheet: string;
  address: string;
  text: string;
  /** "enter": started by typing (arrows insert references / commit); "edit": F2/double-click/formula bar (arrows move the caret). */
  mode: "enter" | "edit";
  source: "cell" | "bar";
  /** Caret / selection inside the text. */
  caret: number;
  caretEnd: number;
  /** Bumps when the caret must be pushed into the DOM editor (programmatic changes). */
  selNonce: number;
  point: PointState | null;
  /** Syntax error shown under the editor (the edit stays open). */
  error: string | null;
  /** A dialog (Insert function) is working on this edit: do not commit on blur. */
  hold: boolean;
}

export type EditMode = "ready" | "enter" | "point" | "edit";

interface StartArgs {
  sheet: string;
  address: string;
  text: string;
  mode: "enter" | "edit";
  source: "cell" | "bar";
  caret?: number;
  caretEnd?: number;
  point?: PointState | null;
}

interface EditStore {
  editing: EditState | null;
  start(e: StartArgs): void;
  /** User typed: clears point mode and the error message. */
  setText(text: string, caret?: number, caretEnd?: number): void;
  setCaret(caret: number, caretEnd: number): void;
  /** Programmatic change of the text (pushes the caret into the editor). */
  replace(text: string, caret: number, caretEnd?: number, point?: PointState | null): void;
  patch(p: Partial<EditState>): void;
  cancel(): void;
}

export const useEditStore = create<EditStore>()((set) => ({
  editing: null,
  start: (e) =>
    set({
      editing: {
        sheet: e.sheet,
        address: e.address,
        text: e.text,
        mode: e.mode,
        source: e.source,
        caret: e.caret ?? e.text.length,
        caretEnd: e.caretEnd ?? e.caret ?? e.text.length,
        selNonce: 1,
        point: e.point ?? null,
        error: null,
        hold: false,
      },
    }),
  setText: (text, caret, caretEnd) =>
    set((s) => {
      if (!s.editing) return s;
      const c = caret ?? text.length;
      return { editing: { ...s.editing, text, caret: c, caretEnd: caretEnd ?? c, point: null, error: null } };
    }),
  setCaret: (caret, caretEnd) =>
    set((s) => {
      const ed = s.editing;
      if (!ed || (ed.caret === caret && ed.caretEnd === caretEnd)) return s;
      // moving the caret away from a pointed reference leaves Point mode
      const point = ed.point && caret === ed.point.end && caretEnd === ed.point.end ? ed.point : ed.point && caret === ed.point.start && caretEnd === ed.point.end ? ed.point : null;
      return { editing: { ...ed, caret, caretEnd, point } };
    }),
  replace: (text, caret, caretEnd, point) =>
    set((s) =>
      s.editing
        ? { editing: { ...s.editing, text, caret, caretEnd: caretEnd ?? caret, point: point === undefined ? s.editing.point : point, selNonce: s.editing.selNonce + 1, error: null } }
        : s,
    ),
  patch: (p) => set((s) => (s.editing ? { editing: { ...s.editing, ...p } } : s)),
  cancel: () => {
    const ed = useEditStore.getState().editing;
    set({ editing: null });
    if (ed) restoreSheet(ed);
  },
}));

export function editModeOf(ed: EditState | null): EditMode {
  if (!ed) return "ready";
  if (ed.point) return "point";
  return ed.mode === "enter" ? "enter" : "edit";
}

const locale = () => useUiStore.getState().locale;

/** Text shown when a cell is edited: formula in the UI locale ("=VNA(…;…)") or raw value. */
export function rawCellContent(ref: CellRef): string {
  const { engine } = useWorkbookStore.getState();
  if (!engine) return "";
  try {
    const f = engine.getFormula(ref);
    if (f) return toDisplayFormula(f.startsWith("=") ? f : `=${f}`, locale());
    const v = engine.getValue(ref);
    if (v === null || v === undefined) return "";
    if (typeof v === "object") return v.error;
    if (typeof v === "boolean") return locale() === "es" ? (v ? "VERDADERO" : "FALSO") : v ? "TRUE" : "FALSE";
    if (typeof v === "number") {
      const sep = separatorsFor(locale());
      return String(v).replace(".", sep.decimal);
    }
    // text that would otherwise be read as a number/formula keeps its apostrophe
    if (/^[=+\-@']/.test(v) || parseUserInput(v, locale()) !== v || /^(TRUE|FALSE|VERDADERO|FALSO)$/i.test(v.trim())) return `'${v}`;
    return v;
  } catch {
    return "";
  }
}

/** UI-locale formula → engine formula (Spanish names / ";" accepted; missing ")" added like Excel). */
export function normaliseFormula(f: string): string {
  const en = toEngineFormula(f, locale());
  return en + ")".repeat(missingParens(en, "en"));
}

/** Parse what the user typed into engine content. */
export function parseEditText(text: string): string | number | boolean | null {
  const parsed = parseUserInput(text, locale());
  if (typeof parsed === "string") {
    if (parsed.startsWith("=")) return normaliseFormula(parsed);
    const up = parsed.trim().toUpperCase();
    if (up === "TRUE" || up === "VERDADERO") return true;
    if (up === "FALSE" || up === "FALSO") return false;
  }
  return parsed;
}

function restoreSheet(ed: EditState): void {
  const st = useWorkbookStore.getState();
  if (st.activeSheet !== ed.sheet && st.sheets.includes(ed.sheet)) {
    st.setActiveSheet(ed.sheet);
    st.setSelection({ sheet: ed.sheet, range: ed.address }, ed.address);
  }
}

/** Focus the DOM editor of the current edit (cell editor or formula bar). */
export function focusEditor(): void {
  const ed = useEditStore.getState().editing;
  if (!ed) return;
  const el = document.querySelector<HTMLTextAreaElement>(ed.source === "cell" ? "[data-cell-editor]" : "[data-formula-input]");
  if (el && document.activeElement !== el) el.focus({ preventScroll: true });
}

/** Give keyboard focus back to the grid (desktop) / drop it (touch: hides the on-screen keyboard). */
export function focusGridKeys(): void {
  if (isCoarsePointer()) (document.activeElement as HTMLElement | null)?.blur();
  else document.querySelector<HTMLElement>("[data-grid-focus]")?.focus({ preventScroll: true });
}

let afterCommit: (() => void) | null = null;
/** Hook run after every successful commit (used to clear the copy marquee, like Excel). */
export function onAfterCommit(fn: () => void): void {
  afterCommit = fn;
}

/**
 * Commit the current edit. Returns false (and keeps the editor open with a message) when the
 * formula has a syntax error. `move` asks the grid to move the active cell afterwards; `all`
 * writes the formula into every selected cell (Ctrl+Enter), shifting relative references.
 */
export function commitEdit(opts?: { move?: [number, number]; all?: boolean }): boolean {
  const { editing } = useEditStore.getState();
  if (!editing) return true;
  const wb = useWorkbookStore.getState();
  const engine = wb.engine;
  const original = rawCellContent({ sheet: editing.sheet, address: editing.address });
  const sel = wb.selection;
  const selB = parseRangeBounds(sel.range);
  const multi = !!opts?.all && sel.sheet === editing.sheet && !!selB && (selB.r1 > selB.r0 || selB.c1 > selB.c0);
  if (editing.text === original && !multi) {
    useEditStore.setState({ editing: null });
    restoreSheet(editing);
    if (opts?.move) useUiStore.getState().requestMove(opts.move[0], opts.move[1]);
    return true;
  }
  const parsed = parseEditText(editing.text);
  if (typeof parsed === "string" && parsed.startsWith("=") && engine && !engine.validateFormula(parsed)) {
    useEditStore.getState().patch({ error: i18n.t("formula.syntaxError") });
    focusEditor();
    return false;
  }
  useEditStore.setState({ editing: null });
  restoreSheet(editing);
  try {
    const ref = { sheet: editing.sheet, address: editing.address };
    if (multi && selB && engine) {
      // Ctrl+Enter: every selected cell gets the formula with its relative references shifted (one undo step)
      const p0 = parseAddress(editing.address)!;
      const data: (string | number | boolean | null)[][] = [];
      for (let r = selB.r0; r <= selB.r1; r++) {
        const row: (string | number | boolean | null)[] = [];
        for (let c = selB.c0; c <= selB.c1; c++) row.push(typeof parsed === "string" && parsed.startsWith("=") ? translateFormula(parsed, r - p0.row, c - p0.col) : parsed);
        data.push(row);
      }
      useWorkbookStore.getState().mutate(editing.sheet, selB, (eng) => eng.setRangeRaw(editing.sheet, toAddress(selB.r0, selB.c0), data));
    } else {
      const p = parseAddress(editing.address)!;
      useWorkbookStore.getState().mutate(editing.sheet, { r0: p.row, c0: p.col, r1: p.row, c1: p.col }, (eng) => eng.setRangeRaw(ref.sheet, ref.address, [[parsed]]));
    }
  } catch (e) {
    useUiStore.getState().notify(e instanceof Error ? e.message : String(e), "error");
  }
  afterCommit?.();
  if (opts?.move) useUiStore.getState().requestMove(opts.move[0], opts.move[1]);
  return true;
}

// ---------------------------------------------------------------------------------------------
// Point mode & reference editing
// ---------------------------------------------------------------------------------------------

/** True when clicking a cell should insert a reference into the edited formula. */
export function canPoint(): boolean {
  const ed = useEditStore.getState().editing;
  if (!ed || ed.hold || !ed.text.startsWith("=")) return false;
  if (useUiStore.getState().rangePick) return false;
  if (ed.point) return true;
  return caretContext(ed.text, ed.caret, locale()).canInsertRef && ed.caret === ed.caretEnd;
}

/** Insert (or replace the pointed) reference for `anchor`…`focus` on `sheet`. */
export function pointTo(sheet: string, anchor: CellPos, focus: CellPos): void {
  const ed = useEditStore.getState().editing;
  if (!ed) return;
  const b = normalise(anchor, focus);
  const ref = boundsRefText(b, sheet !== ed.sheet ? sheet : null);
  const start = ed.point ? ed.point.start : Math.min(ed.caret, ed.caretEnd);
  const end = ed.point ? ed.point.end : Math.max(ed.caret, ed.caretEnd);
  const text = ed.text.slice(0, start) + ref + ed.text.slice(end);
  useEditStore.getState().replace(text, start + ref.length, start + ref.length, { start, end: start + ref.length, sheet, anchor, focus });
}

/** Arrow keys in Point mode: move (or with Shift extend) the pointed reference. */
export function pointMove(dr: number, dc: number, extend: boolean): void {
  const ed = useEditStore.getState().editing;
  if (!ed) return;
  const active = useWorkbookStore.getState().activeSheet;
  let anchor: CellPos;
  let focus: CellPos;
  if (ed.point) {
    anchor = ed.point.anchor;
    focus = ed.point.focus;
  } else {
    const base = active === ed.sheet ? parseAddress(ed.address)! : parseAddress(useWorkbookStore.getState().cursor) ?? { row: 0, col: 0 };
    anchor = base;
    focus = base;
    if (!extend) {
      const p = { row: Math.max(0, base.row + dr), col: Math.max(0, base.col + dc) };
      return pointTo(active, p, p);
    }
  }
  const next = { row: Math.max(0, focus.row + dr), col: Math.max(0, focus.col + dc) };
  pointTo(ed.point?.sheet ?? active, extend ? anchor : next, next);
}

/** F4 on the reference at the caret. Returns true when something changed. */
export function cycleRefAtCaret(): boolean {
  const ed = useEditStore.getState().editing;
  if (!ed || !ed.text.startsWith("=")) return false;
  const r = cycleReference(ed.text, ed.caret, locale());
  if (!r) return false;
  const point = ed.point ? { ...ed.point, start: r.start, end: r.end } : null;
  useEditStore.getState().replace(r.text, r.end, r.end, point);
  return true;
}

/** Replace the `index`-th reference of the edited formula with new bounds (dragging its highlight box). */
export function replaceRefBounds(index: number, b: RangeBounds): void {
  const ed = useEditStore.getState().editing;
  if (!ed) return;
  const ref = formulaRefs(ed.text, locale())[index];
  if (!ref) return;
  const old = ref.ref;
  const single = b.r0 === b.r1 && b.c0 === b.c1;
  const a: RefPart = { col: b.c0, row: b.r0, colAbs: old.a.colAbs, rowAbs: old.a.rowAbs };
  const bb: RefPart = { col: b.c1, row: b.r1, colAbs: (old.b ?? old.a).colAbs, rowAbs: (old.b ?? old.a).rowAbs };
  const prefix = ref.text.slice(0, old.addrStart);
  const txt = prefix + refToText(single ? { kind: "cell", a } : { kind: "range", a, b: bb });
  if (old.kind === "cols" || old.kind === "rows") return; // whole rows/columns are not resized
  const text = ed.text.slice(0, ref.start) + txt + ed.text.slice(ref.end);
  const delta = txt.length - (ref.end - ref.start);
  const shift = (c: number) => (c >= ref.end ? c + delta : c);
  const point = ed.point && ed.point.start === ref.start ? { ...ed.point, end: ref.start + txt.length, anchor: { row: b.r0, col: b.c0 }, focus: { row: b.r1, col: b.c1 } } : null;
  useEditStore.getState().replace(text, shift(ed.caret), shift(ed.caretEnd), point);
}

/** Insert text at the caret (replacing the selection) of the current edit. */
export function insertAtCaret(insert: string, caretOffset = insert.length): void {
  const ed = useEditStore.getState().editing;
  if (!ed) return;
  const s = Math.min(ed.caret, ed.caretEnd);
  const e = Math.max(ed.caret, ed.caretEnd);
  useEditStore.getState().replace(ed.text.slice(0, s) + insert + ed.text.slice(e), s + caretOffset, s + caretOffset, null);
}

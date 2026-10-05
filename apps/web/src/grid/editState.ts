import { create } from "zustand";
import type { CellRef } from "@openrisksim/core";
import { useWorkbookStore } from "../store/workbook";
import { useUiStore } from "../store/ui";
import { parseUserInput, separatorsFor } from "../lib/numberFormat";
import { translateFormulaToEnglish } from "../lib/formulaI18n";

export interface EditState {
  sheet: string;
  address: string;
  text: string;
  /** "enter": started by typing (arrows commit & move); "edit": F2/double-click (arrows move caret). */
  mode: "enter" | "edit";
  source: "cell" | "bar";
}

interface EditStore {
  editing: EditState | null;
  start(e: EditState): void;
  setText(text: string): void;
  cancel(): void;
}

export const useEditStore = create<EditStore>()((set) => ({
  editing: null,
  start: (e) => set({ editing: e }),
  setText: (text) => set((s) => (s.editing ? { editing: { ...s.editing, text } } : s)),
  cancel: () => set({ editing: null }),
}));

/** Text shown when a cell is edited: formula ("=...") or raw value in the UI locale. */
export function rawCellContent(ref: CellRef): string {
  const { engine } = useWorkbookStore.getState();
  if (!engine) return "";
  try {
    const f = engine.getFormula(ref);
    if (f) return f.startsWith("=") ? f : `=${f}`;
    const v = engine.getValue(ref);
    if (v === null || v === undefined) return "";
    if (typeof v === "object") return v.error;
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    if (typeof v === "number") {
      const sep = separatorsFor(useUiStore.getState().locale);
      return String(v).replace(".", sep.decimal);
    }
    return v;
  } catch {
    return "";
  }
}

/** Replace ";" argument separators (Spanish Excel habit) with "," outside string literals and translate Spanish function names. */
export function normaliseFormula(f: string): string {
  let out = "";
  let inStr = false;
  for (const ch of f) {
    if (ch === '"') inStr = !inStr;
    out += !inStr && ch === ";" ? "," : ch;
  }
  return translateFormulaToEnglish(out);
}

/** Commit the current edit to the engine. Returns true if something was committed. */
export function commitEdit(): boolean {
  const { editing } = useEditStore.getState();
  if (!editing) return false;
  useEditStore.setState({ editing: null });
  const original = rawCellContent({ sheet: editing.sheet, address: editing.address });
  if (editing.text === original) return true;
  const locale = useUiStore.getState().locale;
  let parsed = parseUserInput(editing.text, locale);
  if (typeof parsed === "string" && parsed.startsWith("=")) parsed = normaliseFormula(parsed);
  try {
    useWorkbookStore.getState().setCell({ sheet: editing.sheet, address: editing.address }, parsed);
  } catch (e) {
    useUiStore.getState().notify(e instanceof Error ? e.message : String(e), "error");
  }
  return true;
}

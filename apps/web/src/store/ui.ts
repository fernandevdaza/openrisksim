import { create } from "zustand";
import type { AssumptionDef, CellRef, DecisionVariableDef, ForecastDef } from "@openrisksim/core";
import i18n, { detectLocale, persistLocale, type Locale } from "../i18n";
import { COMPACT_QUERY, matches } from "../lib/responsive";

export type Theme = "light" | "dark";
export type RibbonTabId = "file" | "formulas" | "simulation" | "analysis" | "forecast" | "optimization" | "finance" | "help";
export type HelpTab = "quickstart" | "glossary" | "shortcuts" | "about";

export type DialogState =
  | { type: "assumption"; cell: CellRef; id?: string }
  | { type: "forecast"; cell: CellRef; id?: string }
  | { type: "decision"; cell: CellRef; id?: string }
  | { type: "correlations" }
  | { type: "settings" }
  | { type: "examples" }
  | { type: "report" }
  | { type: "help"; tab: HelpTab }
  | { type: "insertFunction"; fn?: string }
  | { type: "evaluateFormula"; cell: CellRef }
  | { type: "names" }
  | { type: "confirm"; title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void };

export type ClipboardDef =
  | { kind: "assumption"; def: AssumptionDef }
  | { kind: "forecast"; def: ForecastDef }
  | { kind: "decision"; def: DecisionVariableDef };

export interface Toast {
  id: number;
  message: string;
  kind: "info" | "success" | "error";
}

export interface UiState {
  locale: Locale;
  setLocale(l: Locale): void;
  theme: Theme;
  setTheme(t: Theme): void;
  ribbonTab: RibbonTabId;
  setRibbonTab(t: RibbonTabId): void;

  openTools: { id: string; props?: unknown }[];
  openTool(toolId: string, props?: unknown): void;
  closeTool(toolId: string): void;

  dialog: DialogState | null;
  openDialog(d: DialogState): void;
  closeDialog(): void;
  confirm(opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }): Promise<boolean>;

  resultsOpen: boolean;
  setResultsOpen(v: boolean): void;
  /** "fc:<forecastId>" | "overlay" */
  resultsTab: string;
  setResultsTab(t: string): void;
  dockWidth: number;
  setDockWidth(w: number): void;
  explorerOpen: boolean;
  setExplorerOpen(v: boolean): void;

  defClipboard: ClipboardDef | null;
  setDefClipboard(c: ClipboardDef | null): void;

  /** Ask the grid to scroll to & select a cell. */
  jumpRequest: { sheet: string; address: string; nonce: number } | null;
  jumpTo(ref: CellRef): void;

  /** Active "pick a range on the sheet" session (dialogs are hidden meanwhile). */
  rangePick: { onDone: (range: string | null) => void } | null;
  startRangePick(onDone: (range: string | null) => void): void;
  finishRangePick(range: string | null): void;

  /** Ask the grid to move the active cell (after committing an edit). */
  moveRequest: { dr: number; dc: number; nonce: number } | null;
  requestMove(dr: number, dc: number): void;

  /** Grid shows formulas instead of values (Ctrl+`). */
  showFormulas: boolean;
  setShowFormulas(v: boolean): void;
  /** Multi-line formula bar (Ctrl+Shift+U). */
  formulaBarExpanded: boolean;
  setFormulaBarExpanded(v: boolean): void;

  toasts: Toast[];
  notify(message: string, kind?: Toast["kind"]): void;
  dismissToast(id: number): void;
}

const THEME_KEY = "openrisksim.theme";

function detectTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark") return t;
  } catch {
    /* ignore */
  }
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(t: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", t === "dark");
  document.documentElement.style.colorScheme = t;
}

let toastSeq = 0;

export const useUiStore = create<UiState>()((set, get) => ({
  locale: detectLocale(),
  setLocale: (l) => {
    persistLocale(l);
    void i18n.changeLanguage(l);
    if (typeof document !== "undefined") document.documentElement.lang = l;
    set({ locale: l });
  },
  theme: detectTheme(),
  setTheme: (t) => {
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* ignore */
    }
    applyTheme(t);
    set({ theme: t });
  },
  ribbonTab: "simulation",
  setRibbonTab: (t) => set({ ribbonTab: t }),

  openTools: [],
  openTool: (toolId, props) =>
    set((s) => ({ openTools: [...s.openTools.filter((t) => t.id !== toolId), { id: toolId, props }] })),
  closeTool: (toolId) => set((s) => ({ openTools: s.openTools.filter((t) => t.id !== toolId) })),

  dialog: null,
  openDialog: (d) => set({ dialog: d }),
  closeDialog: () => set({ dialog: null }),
  confirm: (opts) =>
    new Promise<boolean>((resolve) => {
      let settled = false;
      set({
        dialog: {
          type: "confirm",
          ...opts,
          onConfirm: () => {
            settled = true;
            resolve(true);
          },
        },
      });
      const unsub = useUiStore.subscribe((s) => {
        if (s.dialog?.type !== "confirm") {
          unsub();
          if (!settled) resolve(false);
        }
      });
    }),

  resultsOpen: false,
  setResultsOpen: (v) => set({ resultsOpen: v }),
  resultsTab: "overlay",
  setResultsTab: (t) => set({ resultsTab: t, resultsOpen: true }),
  dockWidth: 520,
  setDockWidth: (w) => set({ dockWidth: Math.round(Math.min(Math.max(w, 360), 1100)) }),
  // on phones/tablets the explorer is a drawer: start closed there
  explorerOpen: !matches(COMPACT_QUERY),
  setExplorerOpen: (v) => set({ explorerOpen: v }),

  defClipboard: null,
  setDefClipboard: (c) => set({ defClipboard: c }),

  jumpRequest: null,
  jumpTo: (ref) => set({ jumpRequest: { sheet: ref.sheet, address: ref.address, nonce: Date.now() + Math.random() } }),

  rangePick: null,
  startRangePick: (onDone) => {
    get().rangePick?.onDone(null);
    if (typeof document !== "undefined") document.body.classList.add("ors-picking");
    set({ rangePick: { onDone } });
  },
  finishRangePick: (range) => {
    const rp = get().rangePick;
    if (typeof document !== "undefined") document.body.classList.remove("ors-picking");
    set({ rangePick: null });
    rp?.onDone(range);
  },

  moveRequest: null,
  requestMove: (dr, dc) => set({ moveRequest: { dr, dc, nonce: Date.now() + Math.random() } }),

  showFormulas: false,
  setShowFormulas: (v) => set({ showFormulas: v }),
  formulaBarExpanded: false,
  setFormulaBarExpanded: (v) => set({ formulaBarExpanded: v }),

  toasts: [],
  notify: (message, kind = "info") => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, kind }] }));
    setTimeout(() => get().dismissToast(id), kind === "error" ? 7000 : 3500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

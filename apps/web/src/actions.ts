/**
 * User-level commands shared by the ribbon, context menu and keyboard shortcuts.
 */
import { emptyModel, newId, type CellRef } from "@openrisksim/core";
import { detectRiskFunctions, readCsv, readXlsx, type WorkbookData } from "@openrisksim/workbook";
import i18n from "./i18n";
import { useWorkbookStore } from "./store/workbook";
import { sameCell, useModelStore } from "./store/model";
import { useSimulationStore } from "./store/simulation";
import { useUiStore, type HelpTab } from "./store/ui";
import { clearSaved } from "./store/persistence";
import { addressesIn, parseAddress, parseRangeBounds, toAddress } from "./lib/a1";
import { downloadBlob, pickFile, withExtension, XLSX_MIME } from "./lib/download";
import { commitEdit } from "./grid/editState";
import { buildReportXlsx } from "./lib/report";
import { useCertaintyStore } from "./results/ForecastWindow";

const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o);
const notify = (m: string, k?: "info" | "success" | "error") => useUiStore.getState().notify(m, k);

function cursorRef(): CellRef | null {
  const st = useWorkbookStore.getState();
  if (!st.engine || !st.activeSheet) {
    notify(t("errors.noWorkbook"), "error");
    return null;
  }
  return { sheet: st.selection.sheet || st.activeSheet, address: st.cursor };
}

/** Best label for a cell: nearest text to the left (same row), else above, else the address. */
export function guessName(ref: CellRef): string {
  const { engine } = useWorkbookStore.getState();
  const pos = parseAddress(ref.address);
  if (!engine || !pos) return ref.address;
  const textAt = (r: number, c: number) => {
    try {
      const v = engine.getValue({ sheet: ref.sheet, address: toAddress(r, c) });
      return typeof v === "string" && v.trim() && !/^[\d.,%$€\s-]+$/.test(v) ? v.trim() : null;
    } catch {
      return null;
    }
  };
  for (let c = pos.col - 1; c >= Math.max(0, pos.col - 6); c--) {
    const s = textAt(pos.row, c);
    if (s) return s.replace(/[:：]\s*$/, "");
  }
  for (let r = pos.row - 1; r >= Math.max(0, pos.row - 2); r--) {
    const s = textAt(r, pos.col);
    if (s) return s.replace(/[:：]\s*$/, "");
  }
  return ref.address;
}

function isFormulaCell(ref: CellRef): boolean {
  try {
    return !!useWorkbookStore.getState().engine?.getFormula(ref);
  } catch {
    return false;
  }
}

async function loadFromFile(file: File): Promise<void> {
  const name = file.name;
  const lower = name.toLowerCase();
  let wb: WorkbookData;
  try {
    if (lower.endsWith(".csv") || lower.endsWith(".txt") || lower.endsWith(".tsv")) {
      wb = await readCsv(await file.text(), name);
    } else if (lower.endsWith(".xls") || lower.endsWith(".ods")) {
      try {
        wb = await readXlsx(await file.arrayBuffer(), name);
      } catch {
        notify(t("errors.legacyFormat", { ext: lower.slice(lower.lastIndexOf(".")) }), "error");
        return;
      }
    } else {
      wb = await readXlsx(await file.arrayBuffer(), name);
    }
  } catch (e) {
    notify(t("errors.openFailed", { msg: e instanceof Error ? e.message : String(e) }), "error");
    return;
  }
  useWorkbookStore.getState().loadWorkbook({ ...wb, fileName: name.replace(/\.(csv|txt|tsv|xls|ods)$/i, ".xlsx") });
  const m = useModelStore.getState().model;
  const n = m.assumptions.length + m.forecasts.length + m.decisions.length;
  notify(n ? t("file.openedWithModel", { name, n }) : t("file.opened", { name }), "success");
  // Offer to convert ORS.NORMAL(...)-style formulas into assumptions
  try {
    const found = detectRiskFunctions(wb).filter((a) => !m.assumptions.some((x) => sameCell(x.cell, a.cell)));
    if (found.length) {
      const ok = await useUiStore.getState().confirm({
        title: t("file.riskFunctionsTitle"),
        message: t("file.riskFunctionsMessage", { n: found.length }),
        confirmLabel: t("file.riskFunctionsConvert"),
      });
      if (ok) for (const a of found) useModelStore.getState().upsertAssumption(a);
    }
  } catch (e) {
    console.warn("[OpenRiskSim] detectRiskFunctions failed", e);
  }
}

export const actions = {
  defineAssumption() {
    commitEdit();
    const ref = cursorRef();
    if (!ref) return;
    const existing = useModelStore.getState().model.assumptions.find((a) => sameCell(a.cell, ref));
    useUiStore.getState().openDialog({ type: "assumption", cell: ref, id: existing?.id });
  },
  defineForecast() {
    commitEdit();
    const ref = cursorRef();
    if (!ref) return;
    const existing = useModelStore.getState().model.forecasts.find((f) => sameCell(f.cell, ref));
    useUiStore.getState().openDialog({ type: "forecast", cell: ref, id: existing?.id });
  },
  defineDecision() {
    commitEdit();
    const ref = cursorRef();
    if (!ref) return;
    const existing = useModelStore.getState().model.decisions.find((d) => sameCell(d.cell, ref));
    useUiStore.getState().openDialog({ type: "decision", cell: ref, id: existing?.id });
  },
  copyDefinition() {
    const ref = cursorRef();
    if (!ref) return;
    const m = useModelStore.getState().model;
    const a = m.assumptions.find((x) => sameCell(x.cell, ref));
    const f = m.forecasts.find((x) => sameCell(x.cell, ref));
    const d = m.decisions.find((x) => sameCell(x.cell, ref));
    const clip = a ? ({ kind: "assumption", def: a } as const) : f ? ({ kind: "forecast", def: f } as const) : d ? ({ kind: "decision", def: d } as const) : null;
    if (!clip) return notify(t("defs.noneAtCell", { cell: ref.address }), "info");
    useUiStore.getState().setDefClipboard(clip);
    notify(t("defs.copied", { name: clip.def.name }), "success");
  },
  pasteDefinition() {
    const clip = useUiStore.getState().defClipboard;
    const st = useWorkbookStore.getState();
    const b = parseRangeBounds(st.selection.range);
    if (!clip || !b || !st.engine) return;
    const sheet = st.selection.sheet;
    const addrs = addressesIn(b).slice(0, 2000);
    const ms = useModelStore.getState();
    let count = 0;
    for (const address of addrs) {
      const cell = { sheet, address };
      if (sameCell(cell, clip.def.cell)) continue;
      const name = guessName(cell);
      const finalName = name === address ? `${clip.def.name} (${address})` : name;
      if (clip.kind === "assumption") {
        const existing = ms.model.assumptions.find((x) => sameCell(x.cell, cell));
        useModelStore.getState().upsertAssumption({ ...clip.def, distribution: structuredClone(clip.def.distribution), id: existing?.id ?? newId("a"), cell, name: finalName });
      } else if (clip.kind === "forecast") {
        const existing = ms.model.forecasts.find((x) => sameCell(x.cell, cell));
        useModelStore.getState().upsertForecast({ ...clip.def, id: existing?.id ?? newId("f"), cell, name: finalName });
      } else {
        const existing = ms.model.decisions.find((x) => sameCell(x.cell, cell));
        useModelStore.getState().upsertDecision({ ...clip.def, id: existing?.id ?? newId("d"), cell, name: finalName });
      }
      count++;
    }
    if (count) notify(t("defs.pasted", { n: count }), "success");
  },
  deleteDefinitions() {
    const st = useWorkbookStore.getState();
    const b = parseRangeBounds(st.selection.range);
    if (!b) return;
    const n = useModelStore.getState().removeDefinitionsAt(st.selection.sheet, addressesIn(b));
    notify(n ? t("defs.deleted", { n }) : t("defs.noneInSelection"), n ? "success" : "info");
  },
  async newProfile() {
    const m = useModelStore.getState().model;
    if (m.assumptions.length + m.forecasts.length + m.decisions.length > 0) {
      const ok = await useUiStore.getState().confirm({ title: t("sim.newProfile"), message: t("sim.newProfileConfirm"), confirmLabel: t("sim.clearModel"), danger: true });
      if (!ok) return;
    }
    useModelStore.getState().setModel({ ...emptyModel(), settings: m.settings });
    useSimulationStore.getState().reset();
    notify(t("sim.modelCleared"), "success");
  },
  run() {
    commitEdit();
    void useSimulationStore.getState().run().then(() => {
      const s = useSimulationStore.getState();
      if (s.status === "done" && s.result && !s.error) {
        const ui = useUiStore.getState();
        const first = s.resultModel?.forecasts.find((f) => s.result!.forecasts[f.id]);
        if (!ui.resultsOpen || !ui.resultsTab.startsWith("fc:") || !s.result.forecasts[ui.resultsTab.slice(3)]) {
          if (first) ui.setResultsTab(`fc:${first.id}`);
        } else ui.setResultsOpen(true);
      }
    });
  },
  step() {
    commitEdit();
    useSimulationStore.getState().step();
  },
  resetSimulation() {
    useSimulationStore.getState().reset();
  },
  async openFile() {
    const file = await pickFile(".xlsx,.xlsm,.xls,.ods,.csv,.tsv,.txt");
    if (file) await loadFromFile(file);
  },
  loadFromFile,
  async newWorkbook() {
    const m = useModelStore.getState().model;
    if (useWorkbookStore.getState().editVersion > 1 || m.assumptions.length + m.forecasts.length > 0) {
      const ok = await useUiStore.getState().confirm({ title: t("file.newBlank"), message: t("file.newBlankConfirm"), confirmLabel: t("file.newBlank") });
      if (!ok) return;
    }
    useWorkbookStore.getState().loadWorkbook({
      sheets: [{ name: t("grid.sheetBase") + "1", rows: 100, cols: 26, cells: {} }],
      model: null,
      fileName: t("file.defaultName"),
    });
    void clearSaved();
  },
  async saveXlsx(includeReport = false) {
    commitEdit();
    const wb = useWorkbookStore.getState();
    if (!wb.engine) return;
    try {
      const snapshot = wb.snapshot();
      const sim = useSimulationStore.getState();
      const buf = await buildReportXlsx(
        snapshot,
        useModelStore.getState().model,
        includeReport ? (sim.resultModel && sim.result ? sim.result : null) : null,
        useUiStore.getState().locale,
        t,
        useCertaintyStore.getState().states,
        includeReport,
      );
      const name = withExtension(wb.fileName, includeReport ? "_informe.xlsx" : ".xlsx");
      downloadBlob(new Blob([buf], { type: XLSX_MIME }), name);
      notify(t("file.saved", { name }), "success");
    } catch (e) {
      notify(t("errors.saveFailed", { msg: e instanceof Error ? e.message : String(e) }), "error");
    }
  },
  openExamples() {
    useUiStore.getState().openDialog({ type: "examples" });
  },
  exportReport() {
    const sim = useSimulationStore.getState();
    if (!sim.result) return notify(t("report.needRun"), "info");
    useUiStore.getState().openDialog({ type: "report" });
  },
  toggleLanguage() {
    const ui = useUiStore.getState();
    ui.setLocale(ui.locale === "es" ? "en" : "es");
  },
  toggleTheme() {
    const ui = useUiStore.getState();
    ui.setTheme(ui.theme === "dark" ? "light" : "dark");
  },
  help(tab: HelpTab) {
    useUiStore.getState().openDialog({ type: "help", tab });
  },
  openCorrelations() {
    const m = useModelStore.getState().model;
    if (m.assumptions.filter((a) => a.enabled).length < 2) return notify(t("corr.needTwo"), "info");
    useUiStore.getState().openDialog({ type: "correlations" });
  },
  openSettings() {
    useUiStore.getState().openDialog({ type: "settings" });
  },
  isFormulaCell,
};

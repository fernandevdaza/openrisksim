import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, CircleCheck, CircleAlert, FolderOpen, Info, Rocket, X } from "lucide-react";
import { Ribbon } from "./ribbon/Ribbon";
import { FormulaBar } from "./grid/FormulaBar";
import { Grid } from "./grid/Grid";
import { SheetTabs } from "./grid/SheetTabs";
import { ModelExplorer } from "./results/ModelExplorer";
import { ResultsDock } from "./results/ResultsDock";
import { StatusBar } from "./results/StatusBar";
import { DialogHost, ToolHost } from "./dialogs/DialogHost";
import { useWorkbookStore, blankWorkbook } from "./store/workbook";
import { useModelStore } from "./store/model";
import { useUiStore } from "./store/ui";
import { loadSaved, startAutosave } from "./store/persistence";
import { installShortcuts } from "./shortcuts";
import { actions } from "./actions";
import { clsx } from "./components/ui";
import { formatRangeRef } from "./components/ui/RangeInput";

function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-10 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      {toasts.map((tt) => (
        <div
          key={tt.id}
          className={clsx(
            "pointer-events-auto flex max-w-xl items-center gap-2 rounded-md px-3 py-2 text-sm shadow-lg",
            tt.kind === "error" ? "bg-red-700 text-white" : tt.kind === "success" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-800 text-white",
          )}
          role={tt.kind === "error" ? "alert" : "status"}
        >
          {tt.kind === "error" ? <CircleAlert size={15} /> : tt.kind === "success" ? <CircleCheck size={15} className="text-green-400 dark:text-green-600" /> : <Info size={15} />}
          <span>{tt.message}</span>
          <button className="ml-1 opacity-70 hover:opacity-100" onClick={() => useUiStore.getState().dismissToast(tt.id)} aria-label="✕">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

function RangePickBar() {
  const { t } = useTranslation();
  const picking = useUiStore((s) => s.rangePick);
  const selection = useWorkbookStore((s) => s.selection);
  if (!picking) return null;
  const ref = formatRangeRef(selection.sheet, selection.range);
  return (
    <div className="fixed left-1/2 top-2 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm shadow-2xl dark:border-blue-700 dark:bg-slate-800">
      <span className="text-slate-700 dark:text-slate-200">{t("range.pickPrompt")}</span>
      <code className="rounded bg-blue-50 px-2 py-0.5 font-mono text-blue-900 dark:bg-slate-900 dark:text-blue-200">{ref}</code>
      <button className="rounded-md bg-blue-700 px-3 py-1 text-white hover:bg-blue-800" onClick={() => useUiStore.getState().finishRangePick(ref)}>
        {t("common.ok")}
      </button>
      <button className="rounded-md border border-slate-300 px-3 py-1 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700" onClick={() => useUiStore.getState().finishRangePick(null)}>
        {t("common.cancel")}
      </button>
    </div>
  );
}

function Welcome() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  const empty = useModelStore((s) => s.model.assumptions.length + s.model.forecasts.length === 0);
  const editVersion = useWorkbookStore((s) => s.editVersion);
  const workbook = useWorkbookStore((s) => s.workbook);
  const blank = !!workbook && workbook.sheets.every((sh) => Object.keys(sh.cells).length === 0) && editVersion <= 1;
  if (dismissed || !empty || !blank) return null;
  return (
    <div className="flex items-center gap-3 border-b border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-950 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
      <Rocket size={18} className="shrink-0 text-blue-700 dark:text-blue-300" />
      <span className="flex-1">{t("welcome.text")}</span>
      <button className="inline-flex items-center gap-1 rounded-md bg-blue-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-800" onClick={actions.openExamples}>
        <BookOpen size={13} /> {t("file.examples")}
      </button>
      <button className="inline-flex items-center gap-1 rounded-md border border-blue-300 px-2.5 py-1 text-xs font-medium hover:bg-blue-100 dark:border-blue-700 dark:hover:bg-blue-900" onClick={() => void actions.openFile()}>
        <FolderOpen size={13} /> {t("file.open")}
      </button>
      <button className="text-xs underline" onClick={() => actions.help("quickstart")}>
        {t("help.quickstart")}
      </button>
      <button className="rounded p-1 hover:bg-blue-100 dark:hover:bg-blue-900" onClick={() => setDismissed(true)} aria-label={t("common.close")}>
        <X size={14} />
      </button>
    </div>
  );
}

export function App() {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    let stopAutosave: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      const saved = await loadSaved();
      if (cancelled) return;
      const st = useWorkbookStore.getState();
      try {
        if (saved) {
          st.loadWorkbook(saved.workbook);
          if (saved.activeSheet && useWorkbookStore.getState().sheets.includes(saved.activeSheet)) useWorkbookStore.getState().setActiveSheet(saved.activeSheet);
          useUiStore.getState().notify(t("file.restored", { name: saved.workbook.fileName ?? "" }), "info");
        } else {
          st.loadWorkbook({ ...blankWorkbook(t("grid.sheetBase") + "1"), fileName: t("file.defaultName") });
        }
      } catch (e) {
        console.error("[OpenRiskSim] could not restore the saved workbook", e);
        st.loadWorkbook({ ...blankWorkbook(t("grid.sheetBase") + "1"), fileName: t("file.defaultName") });
      }
      stopAutosave = startAutosave();
      setReady(true);
    })();
    const removeShortcuts = installShortcuts();
    return () => {
      cancelled = true;
      stopAutosave?.();
      removeShortcuts();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="flex h-full flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={(e) => {
        const f = e.dataTransfer.files?.[0];
        setDragOver(false);
        if (f) {
          e.preventDefault();
          void actions.loadFromFile(f);
        }
      }}
    >
      <Ribbon />
      <Welcome />
      <FormulaBar />
      <div className="flex min-h-0 flex-1">
        <ModelExplorer />
        <main className="flex min-w-0 flex-1 flex-col" aria-label={t("grid.region")}>
          {ready ? <Grid /> : <div className="flex flex-1 items-center justify-center text-sm text-slate-500">{t("common.loading")}</div>}
          <SheetTabs />
        </main>
        <ResultsDock />
      </div>
      <StatusBar />
      <DialogHost />
      <ToolHost />
      <RangePickBar />
      <Toasts />
      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center bg-blue-700/20 text-lg font-semibold text-blue-900 backdrop-blur-[1px] dark:text-blue-100">
          {t("file.dropHere")}
        </div>
      )}
    </div>
  );
}

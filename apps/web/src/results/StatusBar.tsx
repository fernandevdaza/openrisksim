import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CircleAlert, LoaderCircle, RotateCcw, Square, StepForward, TriangleAlert, X } from "lucide-react";
import { useSimulationStore } from "../store/simulation";
import { useWorkbookStore } from "../store/workbook";
import { useUiStore } from "../store/ui";
import { parseRangeBounds } from "../lib/a1";
import { formatStat } from "../lib/numberFormat";
import { actions } from "../actions";
import { BackendBadge } from "./BackendBadge";
import { useIsMobile } from "../lib/responsive";
import { clsx } from "../components/ui";
import { editModeOf, useEditStore } from "../grid/editState";

function SelectionSummary() {
  const { t } = useTranslation();
  const locale = useUiStore((s) => s.locale);
  const selection = useWorkbookStore((s) => s.selection);
  const version = useWorkbookStore((s) => s.version);
  const engine = useWorkbookStore((s) => s.engine);
  const summary = useMemo(() => {
    const b = parseRangeBounds(selection.range);
    if (!b || !engine || !selection.sheet) return null;
    if (b.r0 === b.r1 && b.c0 === b.c1) return null;
    if ((b.r1 - b.r0 + 1) * (b.c1 - b.c0 + 1) > 20000) return null;
    try {
      const vals = engine.getRangeValues(selection.sheet, selection.range).flat();
      const nums = vals.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      const count = vals.filter((v) => v !== null && v !== "").length;
      if (!nums.length) return count ? { count } : null;
      const sum = nums.reduce((a, b) => a + b, 0);
      return { count, sum, avg: sum / nums.length };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, version, engine]);
  if (!summary) return null;
  return (
    <div className="flex gap-3 tabular-nums">
      {"avg" in summary && summary.avg !== undefined && (
        <span>
          {t("status.average")}: <b>{formatStat(summary.avg, locale)}</b>
        </span>
      )}
      <span>
        {t("status.count")}: <b>{summary.count}</b>
      </span>
      {"sum" in summary && summary.sum !== undefined && (
        <span>
          {t("status.sum")}: <b>{formatStat(summary.sum, locale)}</b>
        </span>
      )}
    </div>
  );
}

/** Excel-like edit mode: Listo / Introducir / Señalar / Modificar. */
function EditModeIndicator() {
  const { t } = useTranslation();
  const mode = useEditStore((s) => editModeOf(s.editing));
  const key = { ready: "modeReady", enter: "modeEnter", point: "modePoint", edit: "modeEdit" }[mode];
  return (
    <span data-edit-mode={mode} className={clsx("min-w-[68px] shrink-0", mode !== "ready" && "font-semibold text-blue-800 dark:text-blue-300")}>
      {t(`formula.${key}`)}
    </span>
  );
}

/** Bottom bar: simulation progress / run summary / step mode / selection stats. */
export function StatusBar() {
  const { t } = useTranslation();
  const locale = useUiStore((s) => s.locale);
  const status = useSimulationStore((s) => s.status);
  const progress = useSimulationStore((s) => s.progress);
  const result = useSimulationStore((s) => s.result);
  const error = useSimulationStore((s) => s.error);
  const stale = useSimulationStore((s) => s.stale);
  const stepCount = useSimulationStore((s) => s.stepCount);
  const usedFallback = useSimulationStore((s) => s.usedFallback);
  const stepping = useWorkbookStore((s) => !!s.stepEvaluator);
  const resultModel = useSimulationStore((s) => s.resultModel);

  const mobile = useIsMobile();

  const errors = result ? Object.values(result.forecasts).reduce((a, f) => a + f.errors, 0) : 0;
  const errorText = error ? (error.startsWith("sim.") ? t(error) : error) : null;
  // phones: a single short line above the bottom navigation, and only when there is something to say
  if (mobile && status !== "running" && !stepping && !result && !errorText) return null;

  return (
    <footer
      className={clsx(
        "flex h-7 shrink-0 items-center gap-3 border-t border-slate-300 bg-slate-100 px-3 text-[11.5px] text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
        "no-scrollbar-mobile max-md:gap-2 max-md:overflow-x-auto max-md:whitespace-nowrap max-md:px-2",
      )}
      role="status"
      aria-live="polite"
    >
      {!mobile && <EditModeIndicator />}
      {status === "running" ? (
        <div className="flex items-center gap-2">
          <LoaderCircle size={13} className="animate-spin text-blue-700" />
          <span>{t("status.running", { pct: Math.round(progress * 100) })}</span>
          <div className="h-2 w-48 overflow-hidden rounded-full bg-slate-300 dark:bg-slate-600 max-md:w-24" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <div className="h-full bg-blue-700 transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
          </div>
          <button className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-red-700 hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-900/30 max-md:hidden" onClick={() => useSimulationStore.getState().abort()}>
            <Square size={11} /> {t("sim.abort")}
          </button>
        </div>
      ) : stepping ? (
        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
          <StepForward size={13} />
          <span>{t("status.stepping", { n: stepCount })}</span>
          <button className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/30" onClick={actions.step}>
            {t("status.nextTrial")}
          </button>
          <button className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/30" onClick={() => useWorkbookStore.getState().endStep()}>
            <RotateCcw size={11} /> {t("status.restore")}
          </button>
        </div>
      ) : result ? (
        <div className="flex items-center gap-3">
          {mobile ? (
            <span className="tabular-nums">
              {t("results.trialsN", { n: result.trials.toLocaleString(locale) })} · {(result.elapsedMs / 1000).toFixed(2)} s
            </span>
          ) : (
            <>
              <span>
                {t("status.trials")}: <b>{result.trials.toLocaleString(locale)}</b>
                {result.stoppedEarly && <span className="ml-1 text-blue-700 dark:text-blue-300">({t("status.precisionReached")})</span>}
              </span>
              <span>
                {t("status.time")}: <b>{(result.elapsedMs / 1000).toFixed(2)} s</b>
              </span>
            </>
          )}
          {!mobile && (
            <>
              <span>
                {t("settings.seed")}: <b>{result.seed ?? "—"}</b>
              </span>
              <span>{resultModel?.settings.sampling === "latinHypercube" ? "LHS" : "Monte Carlo"}</span>
              {result.backend && <BackendBadge backend={result.backend} />}
            </>
          )}
          {errors > 0 && (
            <span className="flex items-center gap-1 text-red-700 dark:text-red-400">
              <CircleAlert size={12} /> {t("status.errors", { n: errors })}
            </span>
          )}
          {usedFallback && <span className="text-slate-500">{t("status.fallback")}</span>}
          {stale && (
            <span className="flex items-center gap-1 text-amber-700 dark:text-amber-300">
              <TriangleAlert size={12} /> {t("results.staleShort")}
            </span>
          )}
        </div>
      ) : mobile ? (
        <span>{t("status.ready")}</span>
      ) : null}
      {errorText && status !== "running" && (
        <span className="flex items-center gap-1 rounded bg-red-50 px-2 py-0.5 text-red-700 dark:bg-red-900/30 dark:text-red-300" role="alert">
          <CircleAlert size={12} /> {errorText}
          <button aria-label={t("common.close")} onClick={() => useSimulationStore.setState({ error: null, status: useSimulationStore.getState().result ? "done" : "idle" })}>
            <X size={11} />
          </button>
        </span>
      )}
      {!mobile && (
        <div className="ml-auto">
          <SelectionSummary />
        </div>
      )}
    </footer>
  );
}

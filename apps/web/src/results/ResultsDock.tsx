import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Layers, Play, RefreshCw, Target, X } from "lucide-react";
import { Chart, clsx } from "../components/ui";
import { useSimulationStore } from "../store/simulation";
import { useUiStore } from "../store/ui";
import { actions } from "../actions";
import { sortedFinite } from "../lib/certainty";
import { ForecastWindow } from "./ForecastWindow";
import { overlayOption } from "./charts";

/** Right dock with one tab per forecast window + overlay chart. */
export function ResultsDock() {
  const { t } = useTranslation();
  const open = useUiStore((s) => s.resultsOpen);
  const tab = useUiStore((s) => s.resultsTab);
  const width = useUiStore((s) => s.dockWidth);
  const result = useSimulationStore((s) => s.result);
  const resultModel = useSimulationStore((s) => s.resultModel);
  const stale = useSimulationStore((s) => s.stale);
  const status = useSimulationStore((s) => s.status);
  const forecasts = useMemo(() => (resultModel?.forecasts ?? []).filter((f) => result?.forecasts[f.id]), [result, resultModel]);

  if (!open) return null;

  const onResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const move = (ev: MouseEvent) => useUiStore.getState().setDockWidth(startW + (startX - ev.clientX));
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const activeForecast = tab.startsWith("fc:") ? tab.slice(3) : null;
  const validTab = tab === "overlay" || (activeForecast && forecasts.some((f) => f.id === activeForecast)) ? tab : forecasts[0] ? `fc:${forecasts[0].id}` : "overlay";

  return (
    <aside className="relative flex shrink-0 flex-col border-l border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900" style={{ width: `min(${width}px, 60vw)` }} aria-label={t("results.title")}>
      <div className="absolute -left-1 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-blue-400/30" onMouseDown={onResize} aria-hidden />
      <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-100 px-2 py-1 dark:border-slate-700 dark:bg-slate-800">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{t("results.title")}</span>
        <button className="ml-auto rounded p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700" aria-label={t("common.close")} onClick={() => useUiStore.getState().setResultsOpen(false)}>
          <X size={14} />
        </button>
      </div>
      {!result || !resultModel ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-500 dark:text-slate-400">
          <Target size={32} className="text-slate-300 dark:text-slate-600" />
          <p>{status === "running" ? t("results.running") : t("results.empty")}</p>
          {status !== "running" && (
            <button className="inline-flex items-center gap-1 rounded-md bg-blue-700 px-3 py-1.5 text-white hover:bg-blue-800" onClick={actions.run}>
              <Play size={14} /> {t("sim.run")}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex gap-0.5 overflow-x-auto border-b border-slate-200 px-1 pt-1 dark:border-slate-700" role="tablist">
            {forecasts.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={validTab === `fc:${f.id}`}
                onClick={() => useUiStore.getState().setResultsTab(`fc:${f.id}`)}
                className={clsx(
                  "max-w-[160px] truncate rounded-t border border-b-0 px-2 py-1 text-xs",
                  validTab === `fc:${f.id}` ? "border-slate-300 bg-white font-semibold text-blue-800 dark:border-slate-600 dark:bg-slate-900 dark:text-blue-300" : "border-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                )}
                title={f.name}
              >
                {f.name}
              </button>
            ))}
            <button
              role="tab"
              aria-selected={validTab === "overlay"}
              onClick={() => useUiStore.getState().setResultsTab("overlay")}
              className={clsx(
                "flex items-center gap-1 rounded-t border border-b-0 px-2 py-1 text-xs",
                validTab === "overlay" ? "border-slate-300 bg-white font-semibold text-blue-800 dark:border-slate-600 dark:bg-slate-900 dark:text-blue-300" : "border-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
              )}
            >
              <Layers size={12} /> {t("results.overlay")}
            </button>
          </div>
          {stale && (
            <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-100" role="status">
              <span className="flex-1">{t("results.stale")}</span>
              <button className="inline-flex items-center gap-1 rounded bg-amber-600 px-2 py-0.5 font-medium text-white hover:bg-amber-700" onClick={actions.run} disabled={status === "running"}>
                <RefreshCw size={12} /> {t("results.rerun")}
              </button>
            </div>
          )}
          <div className={clsx("min-h-0 flex-1 transition-opacity", stale && "opacity-50 grayscale-[60%]")}>
            {validTab === "overlay" ? <OverlayPanel /> : <ForecastWindow key={validTab} forecastId={validTab.slice(3)} />}
          </div>
        </>
      )}
    </aside>
  );
}

function OverlayPanel() {
  const { t } = useTranslation();
  const locale = useUiStore((s) => s.locale);
  const theme = useUiStore((s) => s.theme);
  const result = useSimulationStore((s) => s.result)!;
  const resultModel = useSimulationStore((s) => s.resultModel)!;
  const forecasts = resultModel.forecasts.filter((f) => result.forecasts[f.id]);
  const [selected, setSelected] = useState<string[]>(() =>
    forecasts
      .filter((f) => f.format === forecasts[0]?.format)
      .slice(0, 4)
      .map((f) => f.id),
  );
  const [view, setView] = useState<"pdf" | "cdf">("cdf");
  useEffect(() => setSelected((s) => s.filter((id) => result.forecasts[id])), [result]);
  const option = useMemo(() => {
    const series = forecasts.filter((f) => selected.includes(f.id)).map((f) => ({ name: f.name, sorted: sortedFinite(result.forecasts[f.id].values) }));
    const kinds = new Set(forecasts.filter((f) => selected.includes(f.id)).map((f) => f.format));
    const kind = kinds.size === 1 ? [...kinds][0] : "number";
    return overlayOption(series, view, locale, kind, theme === "dark", { frequency: t("results.frequency"), cumulative: t("results.cumulative") });
  }, [forecasts, selected, view, locale, theme, result, t]);
  return (
    <div className="flex h-full flex-col gap-2 overflow-auto p-2">
      <p className="text-xs text-slate-600 dark:text-slate-400">{t("results.overlayHint")}</p>
      <div className="flex flex-wrap gap-1.5">
        {forecasts.map((f) => (
          <label key={f.id} className="flex items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5 text-xs dark:border-slate-700">
            <input
              type="checkbox"
              checked={selected.includes(f.id)}
              onChange={(e) => setSelected((s) => (e.target.checked ? [...s, f.id] : s.filter((x) => x !== f.id)))}
            />
            {f.name}
          </label>
        ))}
      </div>
      <div className="inline-flex self-start overflow-hidden rounded border border-slate-300 text-xs dark:border-slate-600">
        {(["cdf", "pdf"] as const).map((v) => (
          <button key={v} className={clsx("px-2 py-0.5", view === v ? "bg-blue-700 text-white" : "hover:bg-slate-100 dark:hover:bg-slate-800")} onClick={() => setView(v)}>
            {t(`results.view_${v}`)}
          </button>
        ))}
      </div>
      {selected.length ? <Chart option={option} height={340} /> : <div className="p-6 text-center text-sm text-slate-500">{t("results.selectForecasts")}</div>}
    </div>
  );
}

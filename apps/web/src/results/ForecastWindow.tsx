import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { create } from "zustand";
import type { ECharts } from "echarts";
import { Crosshair, Download } from "lucide-react";
import type { ForecastDef, ForecastResult } from "@openrisksim/core";
import { Chart, NumberInput, Select, Tabs, Table, clsx } from "../components/ui";
import { useSimulationStore } from "../store/simulation";
import { useModelStore } from "../store/model";
import { useUiStore } from "../store/ui";
import {
  LEVEL_PRESETS,
  certaintyFromBounds,
  defaultCertainty,
  levelNumber,
  levelPct,
  meanConfidenceInterval,
  sortedFinite,
  switchMode,
  withBound,
  withCertainty,
  type CertaintyState,
  type TailMode,
} from "../lib/certainty";
import { formatStat } from "../lib/numberFormat";
import { computeBins, forecastChartOption } from "./charts";
import { downloadDataUrl } from "../lib/download";

/** Certainty state per forecast, kept while the result lives. */
export const useCertaintyStore = create<{ states: Record<string, CertaintyState>; set(id: string, s: CertaintyState): void; clear(): void }>()((set) => ({
  states: {},
  set: (id, s) => set((st) => ({ states: { ...st.states, [id]: s } })),
  clear: () => set({ states: {} }),
}));
useSimulationStore.subscribe((s, p) => {
  if (s.result !== p.result) useCertaintyStore.getState().clear();
});

type InnerTab = "hist" | "stats" | "pct";

export function ForecastWindow({ forecastId }: { forecastId: string }) {
  const { t } = useTranslation();
  const result = useSimulationStore((s) => s.result);
  const resultModel = useSimulationStore((s) => s.resultModel);
  const fr = result?.forecasts[forecastId];
  const snapshot = resultModel?.forecasts.find((f) => f.id === forecastId);
  // certainty/confidence follow the live definition, so editing the forecast after a run applies at once
  const live = useModelStore((s) => s.model.forecasts.find((f) => f.id === forecastId));
  if (!fr || !snapshot) return <div className="p-4 text-sm text-slate-500">{t("results.noData")}</div>;
  const def: ForecastDef = live ? { ...snapshot, certainty: live.certainty, confidence: live.confidence } : snapshot;
  return <ForecastView fr={fr} def={def} />;
}

function ForecastView({ fr, def }: { fr: ForecastResult; def: ForecastDef }) {
  const { t } = useTranslation();
  const locale = useUiStore((s) => s.locale);
  const theme = useUiStore((s) => s.theme);
  const [tab, setTab] = useState<InnerTab>("hist");
  const [view, setView] = useState<"pdf" | "cdf">("pdf");
  const sorted = useMemo(() => sortedFinite(fr.values), [fr]);
  const bins = useMemo(() => computeBins(sorted), [sorted]);
  const stored = useCertaintyStore((s) => s.states[fr.forecastId]);
  const initialCertainty = def.certainty ?? 0.9;
  const confidence = def.confidence ?? 0.95;
  const state = stored ?? defaultCertainty(sorted, "two", initialCertainty);
  const setState = (s: CertaintyState) => useCertaintyStore.getState().set(fr.forecastId, s);
  // a new initial certainty in the forecast definition resets the band (keeping the tail type)
  const prevInitial = useRef(initialCertainty);
  useEffect(() => {
    if (prevInitial.current === initialCertainty) return;
    prevInitial.current = initialCertainty;
    const cur = useCertaintyStore.getState().states[fr.forecastId];
    if (cur) setState(withCertainty(sorted, cur, initialCertainty));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCertainty]);
  const kind = def.format;
  const fmt = (v: number) => formatStat(v, locale, kind);

  const option = useMemo(
    () =>
      forecastChartOption({
        sorted,
        bins,
        state,
        view,
        locale,
        kind,
        mean: fr.stats.mean,
        dark: theme === "dark",
        labels: { frequency: t("results.frequency"), cumulative: t("results.cumulative"), mean: t("stats.mean"), certainty: t("results.certainty") },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sorted, bins, state.lower, state.upper, state.mode, view, locale, kind, theme, t, fr.stats.mean],
  );

  // ---- draggable certainty handles (ECharts graphic elements) ----------------------------------
  const chartRef = useRef<ECharts | null>(null);
  const liveRef = useRef<HTMLSpanElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const sortedRef = useRef(sorted);
  sortedRef.current = sorted;

  const placeHandles = () => {
    const chart = chartRef.current;
    if (!chart || tab !== "hist") return;
    const st = stateRef.current;
    const h = chart.getHeight();
    const top = 28;
    const bottom = h - 40;
    const make = (which: "lower" | "upper", value: number) => {
      const visible = Number.isFinite(value);
      let x = 0;
      if (visible) {
        const px = chart.convertToPixel({ xAxisIndex: 0 }, value);
        x = typeof px === "number" ? px : Array.isArray(px) ? px[0] : 0;
      }
      return {
        id: `handle-${which}`,
        type: "rect" as const,
        invisible: !visible,
        shape: { x: -6, y: 0, width: 12, height: Math.max(10, bottom - top) },
        x,
        y: top,
        draggable: "horizontal" as const,
        cursor: "ew-resize",
        z: 100,
        style: { fill: "rgba(185,28,28,0.08)", stroke: "rgba(185,28,28,0.0)" },
        ondrag: (e: unknown) => {
          const target = (e as { target?: { x: number } }).target;
          if (!target || !liveRef.current) return;
          const v = Number(chart.convertFromPixel({ xAxisIndex: 0 }, target.x));
          const next = withBound(sortedRef.current, stateRef.current, which, v);
          liveRef.current.textContent = `${which === "lower" ? "≥" : "≤"} ${formatStat(v, locale, kind)} → ${pct2(next.certainty, locale)}`;
        },
        ondragend: (e: unknown) => {
          const target = (e as { target?: { x: number } }).target;
          if (liveRef.current) liveRef.current.textContent = "";
          if (!target) return;
          const v = Number(chart.convertFromPixel({ xAxisIndex: 0 }, target.x));
          if (!Number.isFinite(v)) return;
          let next = withBound(sortedRef.current, stateRef.current, which, v);
          if (next.mode === "two" && next.lower > next.upper) next = withBound(sortedRef.current, next, which === "lower" ? "upper" : "lower", v);
          setState(next);
        },
      };
    };
    try {
      chart.setOption({ graphic: [make("lower", st.lower), make("upper", st.upper)] });
    } catch {
      /* chart not ready */
    }
  };

  useEffect(() => {
    const id = requestAnimationFrame(placeHandles);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [option, tab]);

  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(placeHandles, 60);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const errorsPct = fr.values.length ? fr.errors / fr.values.length : 0;
  const pctText = pct2(state.certainty, locale, false);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-1.5 dark:border-slate-700">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{def.name}</div>
          <button
            className="flex items-center gap-1 text-[11px] text-blue-700 hover:underline dark:text-blue-300"
            onClick={() => useUiStore.getState().jumpTo(def.cell)}
            title={t("explorer.goToCell")}
          >
            <Crosshair size={11} /> {def.cell.sheet}!{def.cell.address}
          </button>
        </div>
        <div className="text-right text-[11px] text-slate-500 dark:text-slate-400">
          {t("results.trialsN", { n: sorted.length.toLocaleString(locale) })}
          {fr.errors > 0 && <div className="text-red-600">{t("results.errorsN", { n: fr.errors, pct: pct2(errorsPct, locale, false, 1) })}</div>}
        </div>
      </div>
      <Tabs<InnerTab>
        className="px-2"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "hist", label: t("results.histogram") },
          { id: "stats", label: t("results.statistics") },
          { id: "pct", label: t("results.percentiles") },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {tab === "hist" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="inline-flex overflow-hidden rounded border border-slate-300 dark:border-slate-600" role="radiogroup" aria-label={t("results.view")}>
                {(["pdf", "cdf"] as const).map((v) => (
                  <button
                    key={v}
                    role="radio"
                    aria-checked={view === v}
                    className={clsx("px-2 py-0.5", view === v ? "bg-blue-700 text-white" : "bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200")}
                    onClick={() => setView(v)}
                  >
                    {t(`results.view_${v}`)}
                  </button>
                ))}
              </div>
              <span ref={liveRef} className="font-mono text-[11px] text-red-700 dark:text-red-300" aria-live="polite" />
              <button
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                onClick={() => {
                  const url = chartRef.current?.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: theme === "dark" ? "#0f172a" : "#ffffff" });
                  if (url) downloadDataUrl(url, `${def.name || "forecast"}.png`);
                }}
                title={t("results.savePng")}
              >
                <Download size={13} /> PNG
              </button>
            </div>
            <div ref={wrapRef}>
              <Chart
                option={option}
                height={300}
                onReady={(c) => {
                  chartRef.current = c;
                  requestAnimationFrame(placeHandles);
                }}
              />
            </div>
            <CertaintyControls state={state} sorted={sorted} onChange={setState} />
            <div className="rounded bg-slate-50 px-2 py-1 text-center text-[12px] text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
              {state.mode === "two" && t("results.sentenceTwo", { pct: pctText, lo: fmt(state.lower), hi: fmt(state.upper) })}
              {state.mode === "left" && t("results.sentenceLeft", { pct: pctText, hi: fmt(state.upper) })}
              {state.mode === "right" && t("results.sentenceRight", { pct: pctText, lo: fmt(state.lower) })}
            </div>
            <QuickStats fr={fr} kind={kind} sorted={sorted} />
          </div>
        )}
        {tab === "stats" && <StatsTable fr={fr} kind={kind} sorted={sorted} confidence={confidence} />}
        {tab === "pct" && <PercentilesTable fr={fr} kind={kind} />}
      </div>
    </div>
  );
}

const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='M2 3.5l3 3 3-3' fill='none' stroke='%2364748b' stroke-width='1.5'/%3E%3C/svg%3E")`;

function CertaintyControls({ state, sorted, onChange }: { state: CertaintyState; sorted: Float64Array; onChange: (s: CertaintyState) => void }) {
  const { t } = useTranslation();
  const locale = useUiStore((s) => s.locale);
  return (
    <div className="grid grid-cols-[auto_1fr_1fr_1fr] items-end gap-2 text-xs">
      <label className="flex flex-col gap-0.5">
        <span className="text-slate-600 dark:text-slate-400">{t("results.tail")}</span>
        <Select<TailMode>
          className="!py-0.5 !text-xs"
          value={state.mode}
          onChange={(m) => onChange(switchMode(sorted, state, m))}
          options={[
            { value: "two", label: t("results.twoTail") },
            { value: "left", label: t("results.leftTail") },
            { value: "right", label: t("results.rightTail") },
          ]}
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-slate-600 dark:text-slate-400">{t("results.lower")}</span>
        <NumberInput
          className="!py-0.5 !text-xs"
          disabled={state.mode === "left"}
          value={Number.isFinite(state.lower) ? round6(state.lower) : null}
          onChange={(v) => onChange(withBound(sorted, state, "lower", v))}
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-slate-600 dark:text-slate-400">{t("results.upper")}</span>
        <NumberInput
          className="!py-0.5 !text-xs"
          disabled={state.mode === "right"}
          value={Number.isFinite(state.upper) ? round6(state.upper) : null}
          onChange={(v) => onChange(withBound(sorted, state, "upper", v))}
        />
      </label>
      <div className="flex items-end gap-1">
        <label className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-slate-600 dark:text-slate-400">{t("results.certaintyPct")}</span>
          <NumberInput
            className="!py-0.5 !text-xs font-semibold"
            min={0}
            max={100}
            value={Math.round(state.certainty * 1e4) / 100}
            onChange={(v) => {
              if (v >= 0 && v <= 100) onChange(withCertainty(sorted, state, v / 100));
            }}
          />
        </label>
        <select
          className="h-[26px] w-7 shrink-0 cursor-pointer appearance-none rounded border border-slate-300 bg-white bg-[length:10px] bg-center bg-no-repeat text-center text-[11px] text-transparent dark:border-slate-600 dark:bg-slate-800"
          style={{ backgroundImage: CHEVRON }}
          aria-label={t("results.certaintyPresets")}
          title={t("results.certaintyPresets")}
          value=""
          onChange={(e) => {
            const p = Number(e.target.value);
            if (p > 0 && p < 1) onChange(withCertainty(sorted, state, p));
          }}
        >
          <option value="" disabled hidden>
            ▾
          </option>
          {LEVEL_PRESETS.map((p) => (
            <option key={p} value={p} className="text-slate-900 dark:text-slate-100">
              {levelPct(p, locale)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** Fraction → "12,34 %" (es) / "12.34%" (en). */
function pct2(v: number, locale: "es" | "en", withSign = true, digits = 2): string {
  const txt = (v * 100).toLocaleString(locale === "es" ? "es-ES" : "en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return withSign ? (locale === "es" ? `${txt} %` : `${txt}%`) : txt;
}

function round6(v: number): number {
  if (!Number.isFinite(v)) return v;
  const a = Math.abs(v);
  const digits = a >= 1000 ? 2 : a >= 1 ? 4 : 6;
  return Number(v.toFixed(digits));
}

function QuickStats({ fr, kind, sorted }: { fr: ForecastResult; kind: ForecastDef["format"]; sorted: Float64Array }) {
  const { t } = useTranslation();
  const locale = useUiStore((s) => s.locale);
  const s = fr.stats;
  const pPos = certaintyFromBounds(sorted, "right", 0, Infinity);
  const items: [string, string][] = [
    [t("stats.mean"), formatStat(s.mean, locale, kind)],
    [t("stats.median"), formatStat(s.median, locale, kind)],
    [t("stats.stdDev"), formatStat(s.stdDev, locale, kind)],
    [t("stats.min"), formatStat(s.min, locale, kind)],
    [t("stats.max"), formatStat(s.max, locale, kind)],
    [t("stats.probPositive"), pct2(pPos, locale)],
  ];
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {items.map(([k, v]) => (
        <div key={k} className="rounded border border-slate-200 px-2 py-1 dark:border-slate-700">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{k}</div>
          <div className="truncate text-[13px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">{v}</div>
        </div>
      ))}
    </div>
  );
}

export function statsRows(
  fr: ForecastResult,
  kind: ForecastDef["format"],
  sorted: Float64Array,
  locale: "es" | "en",
  t: (k: string, o?: Record<string, unknown>) => string,
  confidence = 0.95,
): { k: string; v: string }[] {
  const s = fr.stats;
  const ci = meanConfidenceInterval(s, confidence);
  const f = (v: number) => formatStat(v, locale, kind);
  const n = (v: number, d = 4) => formatStat(v, locale, "number", d);
  return [
    { k: t("stats.count"), v: s.count.toLocaleString(locale === "es" ? "es-ES" : "en-US") },
    { k: t("stats.mean"), v: f(s.mean) },
    { k: t("stats.median"), v: f(s.median) },
    { k: t("stats.mode"), v: f(s.mode) },
    { k: t("stats.stdDev"), v: f(s.stdDev) },
    { k: t("stats.variance"), v: n(s.variance) },
    { k: t("stats.cv"), v: Number.isFinite(s.cv) ? pct2(s.cv, locale) : "—" },
    { k: t("stats.min"), v: f(s.min) },
    { k: t("stats.max"), v: f(s.max) },
    { k: t("stats.range"), v: f(s.range) },
    { k: t("stats.skewness"), v: n(s.skewness) },
    { k: t("stats.kurtosis"), v: n(s.kurtosis) },
    { k: t("stats.stdErrorMean"), v: f(s.stdErrorMean) },
    { k: t("stats.meanCI", { level: levelNumber(confidence, locale) }), v: `[${f(ci[0])}; ${f(ci[1])}]` },
    { k: t("stats.p10"), v: f(s.percentiles[10]) },
    { k: t("stats.p90"), v: f(s.percentiles[90]) },
    { k: t("stats.probPositive"), v: pct2(certaintyFromBounds(sorted, "right", 0, Infinity), locale) },
    { k: t("stats.errors"), v: String(fr.errors) },
  ];
}

function StatsTable({ fr, kind, sorted, confidence }: { fr: ForecastResult; kind: ForecastDef["format"]; sorted: Float64Array; confidence: number }) {
  const { t } = useTranslation();
  const locale = useUiStore((s) => s.locale);
  return (
    <Table
      columns={[
        { key: "k", label: t("results.statistic") },
        { key: "v", label: t("results.value"), align: "right" },
      ]}
      rows={statsRows(fr, kind, sorted, locale, t, confidence)}
    />
  );
}

export const PERCENTILE_LIST = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 99];

function PercentilesTable({ fr, kind }: { fr: ForecastResult; kind: ForecastDef["format"] }) {
  const { t } = useTranslation();
  const locale = useUiStore((s) => s.locale);
  const rows = [
    { p: "0%", v: formatStat(fr.stats.min, locale, kind) },
    ...PERCENTILE_LIST.map((p) => ({ p: `${p}%`, v: formatStat(fr.stats.percentiles[p], locale, kind) })),
    { p: "100%", v: formatStat(fr.stats.max, locale, kind) },
  ];
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-slate-600 dark:text-slate-400">{t("results.percentilesHint")}</p>
      <Table
        columns={[
          { key: "p", label: t("results.percentile"), align: "right" },
          { key: "v", label: t("results.value"), align: "right" },
        ]}
        rows={rows}
      />
    </div>
  );
}

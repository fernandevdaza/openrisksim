import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EChartsOption } from "echarts";
import { Search, TriangleAlert, Wand } from "lucide-react";
import { newId, type CellRef, type DistributionId, type DistributionSpec, type Distribution } from "@openrisksim/core";
import { DISTRIBUTION_META, createDistribution, distributionCurve, fitDistributions, validateSpec, type FitResult } from "@openrisksim/distributions";
import { Button, Chart, Field, Input, Modal, NumberInput, RangeInput, clsx, readRangeNumbers } from "../components/ui";
import { useModelStore } from "../store/model";
import { useWorkbookStore } from "../store/workbook";
import { useUiStore } from "../store/ui";
import { guessName, actions } from "../actions";
import { formatStat } from "../lib/numberFormat";
import { describeSpec, tr } from "../lib/modelText";
import { suggestedSpec, thumbnailPath } from "./distributionThumbs";

type Filter = "all" | "continuous" | "discrete";

interface SpecSummary {
  mean: number;
  sd: number;
  pct: Record<number, number>;
  curve: { x: number[]; pdf: number[]; cdf: number[] } | null;
}

function summarise(dist: Distribution, spec: DistributionSpec): SpecSummary {
  const t = spec.truncate;
  const truncated = !!t && (t.min != null || t.max != null);
  const flo = truncated && t!.min != null ? dist.cdf(t!.min) : 0;
  const fhi = truncated && t!.max != null ? dist.cdf(t!.max) : 1;
  const span = Math.max(1e-12, fhi - flo);
  const q = (p: number) => dist.quantile(Math.min(1 - 1e-12, Math.max(1e-12, flo + p * span)));
  let mean: number;
  let sd: number;
  if (!truncated) {
    mean = dist.mean();
    sd = Math.sqrt(dist.variance());
  } else {
    const N = 2000;
    let s = 0;
    let s2 = 0;
    for (let i = 0; i < N; i++) {
      const x = q((i + 0.5) / N);
      s += x;
      s2 += x * x;
    }
    mean = s / N;
    sd = Math.sqrt(Math.max(0, s2 / N - mean * mean));
  }
  const pct: Record<number, number> = {};
  for (const p of [1, 5, 10, 25, 50, 75, 90, 95, 99]) pct[p] = q(p / 100);
  let curve: SpecSummary["curve"] = null;
  try {
    const c = distributionCurve(dist, 160);
    if (truncated) {
      const lo = t!.min ?? -Infinity;
      const hi = t!.max ?? Infinity;
      const x: number[] = [];
      const pdf: number[] = [];
      const cdf: number[] = [];
      c.x.forEach((xi, i) => {
        if (xi < lo || xi > hi) return;
        x.push(xi);
        pdf.push(c.pdf[i] / span);
        cdf.push(Math.min(1, Math.max(0, (c.cdf[i] - flo) / span)));
      });
      curve = { x, pdf, cdf };
    } else curve = c;
  } catch {
    curve = null;
  }
  return { mean, sd, pct, curve };
}

function parseNumberList(text: string): number[] {
  return text
    .split(/[\s;\n\t]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s.replace(",", ".")))
    .filter((n) => Number.isFinite(n));
}

export function AssumptionDialog({ cell, id, onClose }: { cell: CellRef; id?: string; onClose: () => void }) {
  const { t } = useTranslation();
  const locale = useUiStore((s) => s.locale);
  const theme = useUiStore((s) => s.theme);
  const existing = useModelStore((s) => (id ? s.model.assumptions.find((a) => a.id === id) : undefined));
  const engine = useWorkbookStore((s) => s.engine);

  const cellValue = useMemo(() => {
    try {
      const v = engine?.getValue(cell);
      return typeof v === "number" ? v : null;
    } catch {
      return null;
    }
  }, [engine, cell]);
  const hasFormula = useMemo(() => actions.isFormulaCell(cell), [cell]);

  const [spec, setSpec] = useState<DistributionSpec>(() => (existing ? structuredClone(existing.distribution) : suggestedSpec("normal", cellValue)));
  const [name, setName] = useState(existing?.name ?? guessName(cell));
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"pdf" | "cdf">("pdf");
  const [showFit, setShowFit] = useState(false);
  const [customText, setCustomText] = useState(() => ({ values: (spec.values ?? []).join("; "), weights: (spec.weights ?? []).join("; ") }));

  const meta = DISTRIBUTION_META.find((m) => m.id === spec.id);

  const validation = useMemo(() => {
    try {
      return validateSpec(spec);
    } catch (e) {
      return { ok: false as const, errors: [{ key: "", message: { es: String(e), en: String(e) } }] };
    }
  }, [spec]);
  const truncError =
    spec.truncate && spec.truncate.min != null && spec.truncate.max != null && spec.truncate.min >= spec.truncate.max ? t("assumption.truncError") : null;

  const summary = useMemo<SpecSummary | null>(() => {
    if (!validation.ok || truncError) return null;
    try {
      return summarise(createDistribution(spec), spec);
    } catch {
      return null;
    }
  }, [spec, validation.ok, truncError]);

  const errorFor = (key: string) => (validation.ok ? null : validation.errors.find((e) => e.key === key));
  const generalErrors = validation.ok ? [] : validation.errors.filter((e) => !meta?.params.some((p) => p.key === e.key));

  const pick = (did: DistributionId) => {
    if (did === spec.id) return;
    const next = suggestedSpec(did, cellValue);
    if (spec.truncate) next.truncate = spec.truncate;
    setSpec(next);
    if (did === "custom") setCustomText({ values: (next.values ?? []).join("; "), weights: (next.weights ?? []).join("; ") });
  };

  const galleryItems = DISTRIBUTION_META.filter(
    (m) =>
      (filter === "all" || m.kind === filter) &&
      (!search.trim() || `${m.name.es} ${m.name.en} ${m.id}`.toLowerCase().includes(search.trim().toLowerCase())),
  );

  const chartOption = useMemo<EChartsOption | null>(() => {
    if (!summary?.curve || summary.curve.x.length === 0) return null;
    const dark = theme === "dark";
    const textColor = dark ? "#cbd5e1" : "#334155";
    const gridColor = dark ? "#334155" : "#e2e8f0";
    const { x, pdf, cdf } = summary.curve;
    const discrete = meta?.kind === "discrete";
    const ys = view === "pdf" ? pdf : cdf;
    const data = x.map((xi, i) => [xi, Number.isFinite(ys[i]) ? ys[i] : 0]);
    const fmt = (v: number) => formatStat(v, locale);
    return {
      animation: false,
      grid: { left: 52, right: 16, top: 16, bottom: 32 },
      tooltip: { trigger: "axis", confine: true, valueFormatter: (v: unknown) => (typeof v === "number" ? v.toPrecision(4) : String(v)) },
      xAxis: { type: "value", scale: true, axisLabel: { color: textColor, formatter: (v: number) => fmt(v), hideOverlap: true, fontSize: 10 }, splitLine: { show: false } },
      yAxis: { type: "value", min: 0, axisLabel: { color: textColor, fontSize: 10 }, splitLine: { lineStyle: { color: gridColor } } },
      series: [
        discrete && view === "pdf"
          ? { type: "bar", data, barMaxWidth: 18, itemStyle: { color: "#16a34a" } }
          : {
              type: "line",
              data,
              showSymbol: false,
              step: discrete ? "end" : undefined,
              lineStyle: { color: "#16a34a", width: 2 },
              areaStyle: view === "pdf" ? { color: "rgba(22,163,74,0.15)" } : undefined,
              markLine: Number.isFinite(summary.mean)
                ? { symbol: "none", silent: true, lineStyle: { color: "#475569", type: "dashed" }, label: { formatter: t("stats.mean"), color: textColor }, data: [{ xAxis: summary.mean }] }
                : undefined,
            },
      ],
    } as EChartsOption;
  }, [summary, view, theme, meta?.kind, locale, t]);

  const canSave = validation.ok && !truncError && name.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    useModelStore.getState().upsertAssumption({
      id: existing?.id ?? newId("a"),
      name: name.trim(),
      cell,
      distribution: spec,
      enabled,
    });
    useUiStore.getState().notify(t("assumption.saved", { name: name.trim() }), "success");
    onClose();
  };

  const setParam = (key: string, v: number) => setSpec((s) => ({ ...s, params: { ...s.params, [key]: v } }));
  const setTrunc = (which: "min" | "max", v: number | undefined) =>
    setSpec((s) => {
      const tt = { ...(s.truncate ?? {}) };
      if (v === undefined) delete tt[which];
      else tt[which] = v;
      const next = { ...s };
      if (tt.min === undefined && tt.max === undefined) delete next.truncate;
      else next.truncate = tt;
      return next;
    });

  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm bg-green-500" />
          {t("assumption.title")} — <span className="font-mono text-sm">{cell.sheet}!{cell.address}</span>
        </span>
      }
      footer={
        <>
          {existing && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={() => {
                useModelStore.getState().removeAssumption(existing.id);
                onClose();
              }}
            >
              {t("common.delete")}
            </Button>
          )}
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={!canSave} onClick={save}>
            {t("common.ok")}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* gallery */}
        <div className="flex min-h-0 flex-col gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input className="pl-7" placeholder={t("assumption.search")} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t("assumption.search")} />
          </div>
          <div className="flex gap-1 text-xs" role="radiogroup">
            {(["all", "continuous", "discrete"] as Filter[]).map((f) => (
              <button
                key={f}
                role="radio"
                aria-checked={filter === f}
                className={clsx("rounded-full border px-2 py-0.5", filter === f ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800")}
                onClick={() => setFilter(f)}
              >
                {t(`assumption.filter_${f}`)}
              </button>
            ))}
          </div>
          <div className={clsx("grid grid-cols-3 gap-1.5 overflow-auto pr-1", showFit ? "max-h-[24vh]" : "max-h-[52vh]")} role="listbox" aria-label={t("assumption.gallery")}>
            {galleryItems.map((m) => {
              const th = thumbnailPath(m);
              const active = m.id === spec.id;
              return (
                <button
                  key={m.id}
                  role="option"
                  aria-selected={active}
                  title={`${tr(m.name, locale)} — ${tr(m.description, locale)}`}
                  onClick={() => pick(m.id)}
                  className={clsx(
                    "flex flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 text-[11px] leading-tight",
                    active ? "border-green-600 bg-green-50 ring-1 ring-green-600 dark:bg-green-900/30" : "border-slate-200 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800",
                  )}
                >
                  <svg viewBox="0 0 60 28" className="h-7 w-14" aria-hidden>
                    {th.d &&
                      (th.discrete ? (
                        <path d={th.d} stroke="#16a34a" strokeWidth={3} fill="none" />
                      ) : (
                        <path d={th.d} stroke="#16a34a" strokeWidth={1.3} fill="rgba(22,163,74,0.18)" />
                      ))}
                    <line x1="1" y1="26.5" x2="59" y2="26.5" stroke="#94a3b8" strokeWidth={0.6} />
                  </svg>
                  <span className="line-clamp-2 text-center text-slate-800 dark:text-slate-200">{tr(m.name, locale)}</span>
                </button>
              );
            })}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowFit((v) => !v)} className="justify-start">
            <Wand size={14} /> {t("assumption.fitFromData")}
          </Button>
          {showFit && (
            <FitPanel
              onPick={(s) => {
                setSpec((cur) => ({ ...s, truncate: cur.truncate }));
                if (s.id === "custom") setCustomText({ values: (s.values ?? []).join("; "), weights: (s.weights ?? []).join("; ") });
              }}
            />
          )}
        </div>

        {/* parameters + chart */}
        <div className="flex min-w-0 flex-col gap-3">
          {hasFormula && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              {t("assumption.formulaWarning")}
            </div>
          )}
          {!hasFormula && cellValue === null && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100">
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              {t("assumption.notNumericWarning")}
            </div>
          )}
          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <Field label={t("common.name")}>
              <Input value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} autoFocus />
            </Field>
            <label className="flex items-center gap-1.5 pb-1.5 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              {t("common.enabled")}
            </label>
          </div>
          {meta && (
            <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
              <div className="font-semibold text-slate-900 dark:text-slate-100">{tr(meta.name, locale)}</div>
              <div>{tr(meta.description, locale)}</div>
              {meta.usage && <div className="mt-0.5 italic text-slate-500 dark:text-slate-400">{tr(meta.usage, locale)}</div>}
            </div>
          )}
          {spec.id === "custom" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label={t("assumption.customValues")} hint={t("assumption.customHint")}>
                <textarea
                  className="h-20 w-full rounded-md border border-slate-300 bg-white p-1.5 font-mono text-xs dark:border-slate-600 dark:bg-slate-900"
                  value={customText.values}
                  onChange={(e) => {
                    setCustomText((c) => ({ ...c, values: e.target.value }));
                    const vals = parseNumberList(e.target.value);
                    setSpec((s) => ({ ...s, values: vals }));
                  }}
                />
              </Field>
              <Field label={t("assumption.customWeights")} hint={t("assumption.customWeightsHint")}>
                <textarea
                  className="h-20 w-full rounded-md border border-slate-300 bg-white p-1.5 font-mono text-xs dark:border-slate-600 dark:bg-slate-900"
                  value={customText.weights}
                  onChange={(e) => {
                    setCustomText((c) => ({ ...c, weights: e.target.value }));
                    const w = parseNumberList(e.target.value);
                    setSpec((s) => {
                      const next: DistributionSpec = { ...s, weights: w };
                      if (!w.length) delete next.weights;
                      return next;
                    });
                  }}
                />
              </Field>
              <CustomFromRange
                onValues={(vals) => {
                  setCustomText((c) => ({ ...c, values: vals.join("; ") }));
                  setSpec((s) => ({ ...s, values: vals }));
                }}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {meta?.params.map((p) => {
                const err = errorFor(p.key);
                return (
                  <Field key={p.key} label={tr(p.label, locale)} hint={err ? <span className="text-red-600">{tr(err.message, locale)}</span> : undefined}>
                    <NumberInput
                      value={spec.params[p.key]}
                      onChange={(v) => setParam(p.key, p.integer ? Math.round(v) : v)}
                      className={err ? "!border-red-500" : undefined}
                    />
                  </Field>
                );
              })}
            </div>
          )}
          {generalErrors.length > 0 && (
            <div className="rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-200" role="alert">
              {generalErrors.map((e, i) => (
                <div key={i}>{tr(e.message, locale)}</div>
              ))}
            </div>
          )}
          <details className="rounded-md border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700" open={!!spec.truncate}>
            <summary className="cursor-pointer select-none text-slate-700 dark:text-slate-300">{t("assumption.truncation")}</summary>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <TruncField label={t("assumption.truncMin")} value={spec.truncate?.min} onChange={(v) => setTrunc("min", v)} />
              <TruncField label={t("assumption.truncMax")} value={spec.truncate?.max} onChange={(v) => setTrunc("max", v)} />
            </div>
            {truncError && <div className="mt-1 text-xs text-red-600">{truncError}</div>}
          </details>

          <div className="rounded-md border border-slate-200 p-2 dark:border-slate-700">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{describeSpec(spec, locale)}</span>
              <div className="inline-flex overflow-hidden rounded border border-slate-300 text-xs dark:border-slate-600">
                {(["pdf", "cdf"] as const).map((v) => (
                  <button key={v} className={clsx("px-2 py-0.5", view === v ? "bg-green-700 text-white" : "hover:bg-slate-100 dark:hover:bg-slate-800")} onClick={() => setView(v)}>
                    {t(`assumption.view_${v}`)}
                  </button>
                ))}
              </div>
            </div>
            {chartOption ? <Chart option={chartOption} height={210} /> : <div className="flex h-[210px] items-center justify-center text-xs text-slate-500">{t("assumption.invalidParams")}</div>}
            {summary && (
              <div className="mt-1 grid grid-cols-4 gap-1 text-center text-[11px] sm:grid-cols-7">
                {[
                  [t("stats.mean"), summary.mean],
                  [t("stats.stdDev"), summary.sd],
                  ["P5", summary.pct[5]],
                  ["P10", summary.pct[10]],
                  ["P50", summary.pct[50]],
                  ["P90", summary.pct[90]],
                  ["P95", summary.pct[95]],
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded bg-slate-50 px-1 py-0.5 dark:bg-slate-800/60">
                    <div className="text-slate-500 dark:text-slate-400">{k as string}</div>
                    <div className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatStat(v as number, locale)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function TruncField({ label, value, onChange }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void }) {
  const { t } = useTranslation();
  const on = value !== undefined;
  return (
    <div className="flex flex-col gap-1 text-sm">
      <label className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
        <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked ? 0 : undefined)} />
        {label}
      </label>
      <NumberInput value={value ?? null} disabled={!on} onChange={(v) => onChange(v)} />
      {!on && <span className="text-[11px] text-slate-500">{t("assumption.noLimit")}</span>}
    </div>
  );
}

function CustomFromRange({ onValues }: { onValues: (v: number[]) => void }) {
  const { t } = useTranslation();
  const [range, setRange] = useState("");
  return (
    <div className="flex flex-col gap-1 text-sm sm:col-span-2">
      <span className="font-medium text-slate-700 dark:text-slate-300">{t("assumption.customFromRange")}</span>
      <div className="flex gap-2">
        <RangeInput value={range} onChange={setRange} className="flex-1" />
        <Button size="sm" onClick={() => onValues(readRangeNumbers(range))} disabled={!range}>
          {t("assumption.load")}
        </Button>
      </div>
    </div>
  );
}

function FitPanel({ onPick }: { onPick: (s: DistributionSpec) => void }) {
  const { t } = useTranslation();
  const locale = useUiStore((s) => s.locale);
  const [range, setRange] = useState("");
  const [results, setResults] = useState<FitResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  const run = () => {
    const data = readRangeNumbers(range);
    setN(data.length);
    if (data.length < 5) {
      setError(t("assumption.fitNeedData"));
      setResults(null);
      return;
    }
    try {
      setResults(fitDistributions(data, { rankBy: "aic" }).slice(0, 8));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="flex flex-col gap-2 rounded-md border border-slate-200 p-2 text-xs dark:border-slate-700">
      <div className="flex gap-1">
        <RangeInput value={range} onChange={setRange} className="flex-1" />
        <Button size="sm" variant="primary" onClick={run} disabled={!range}>
          {t("assumption.fit")}
        </Button>
      </div>
      {error && <div className="text-red-600">{error}</div>}
      {results && (
        <div className="max-h-56 overflow-auto">
          <div className="mb-1 text-slate-500">{t("assumption.fitN", { n })}</div>
          <table className="w-full">
            <thead>
              <tr className="text-left text-slate-500">
                <th>#</th>
                <th>{t("assumption.distribution")}</th>
                <th className="text-right">AIC</th>
                <th className="text-right">KS p</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.spec.id + r.rank} className="border-t border-slate-100 dark:border-slate-800" title={describeSpec(r.spec, locale)}>
                  <td>{r.rank}</td>
                  <td className="max-w-[110px] truncate">{describeSpec(r.spec, locale).split(" (")[0]}</td>
                  <td className="text-right tabular-nums">{formatStat(r.aic, locale, "number", 1)}</td>
                  <td className="text-right tabular-nums">{Number.isFinite(r.ks.pValue) ? r.ks.pValue.toFixed(3) : "—"}</td>
                  <td className="text-right">
                    <button className="rounded px-1 text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-slate-800" onClick={() => onPick(r.spec)}>
                      {t("assumption.use")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

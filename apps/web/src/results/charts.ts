import type { EChartsOption, CustomSeriesRenderItemAPI, CustomSeriesRenderItemParams, CustomSeriesRenderItemReturn } from "echarts";
import type { HistogramBin } from "@openrisksim/core";
import { histogram } from "@openrisksim/engine";
import { formatStat, type UiLocale } from "../lib/numberFormat";
import { countLE, type CertaintyState } from "../lib/certainty";

export type ValueKind = "currency" | "percent" | "number" | undefined;

export const PALETTE = ["#1d4ed8", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4b5563"];

export interface HistogramChartInput {
  sorted: Float64Array;
  bins: HistogramBin[];
  state: CertaintyState;
  view: "pdf" | "cdf";
  locale: UiLocale;
  kind: ValueKind;
  mean: number;
  dark: boolean;
  title?: string;
  labels: { frequency: string; cumulative: string; mean: string; certainty: string };
}

export function computeBins(values: Float64Array, bins: number | "auto" = "auto"): HistogramBin[] {
  try {
    return histogram(values, bins);
  } catch {
    return [];
  }
}

function inBand(state: CertaintyState, x: number): boolean {
  return x >= state.lower && x <= state.upper;
}

/** Histogram (PDF) or empirical CDF with the certainty band highlighted. */
export function forecastChartOption(inp: HistogramChartInput): EChartsOption {
  const { sorted, bins, state, view, locale, kind, dark } = inp;
  const fmt = (v: number) => formatStat(v, locale, kind);
  const textColor = dark ? "#cbd5e1" : "#334155";
  const gridColor = dark ? "#334155" : "#e2e8f0";
  const n = sorted.length;
  const xmin = bins.length ? bins[0].from : n ? sorted[0] : 0;
  const xmax = bins.length ? bins[bins.length - 1].to : n ? sorted[n - 1] : 1;
  const pad = (xmax - xmin) * 0.02 || 1;
  const markLines: { xAxis: number; name: string; lineStyle: { color: string; type: "solid" | "dashed"; width: number }; label: { formatter: string; color: string; position: "insideEndTop" | "end" } }[] = [];
  if (Number.isFinite(state.lower))
    markLines.push({ xAxis: state.lower, name: "lower", lineStyle: { color: "#b91c1c", type: "solid", width: 2 }, label: { formatter: fmt(state.lower), color: "#b91c1c", position: "end" } });
  if (Number.isFinite(state.upper))
    markLines.push({ xAxis: state.upper, name: "upper", lineStyle: { color: "#b91c1c", type: "solid", width: 2 }, label: { formatter: fmt(state.upper), color: "#b91c1c", position: "end" } });
  if (Number.isFinite(inp.mean))
    markLines.push({ xAxis: inp.mean, name: "mean", lineStyle: { color: dark ? "#94a3b8" : "#475569", type: "dashed", width: 1 }, label: { formatter: `${inp.labels.mean}`, color: textColor, position: "insideEndTop" } });

  const common: EChartsOption = {
    animation: false,
    backgroundColor: "transparent",
    textStyle: { fontFamily: "inherit" },
    title: inp.title ? { text: inp.title, left: "center", top: 4, textStyle: { fontSize: 13, color: textColor, fontWeight: 600 } } : undefined,
    grid: { left: 56, right: 44, top: inp.title ? 44 : 28, bottom: 40 },
    xAxis: {
      type: "value",
      min: xmin - pad,
      max: xmax + pad,
      scale: true,
      axisLabel: { color: textColor, formatter: (v: number) => fmt(v), hideOverlap: true, fontSize: 11 },
      axisLine: { lineStyle: { color: gridColor } },
      splitLine: { show: false },
    },
    tooltip: { trigger: "axis", axisPointer: { type: "line" }, confine: true },
  };

  if (view === "cdf") {
    const pts = Math.min(400, n);
    const data: [number, number][] = [];
    for (let i = 0; i < pts; i++) {
      const idx = Math.round((i / Math.max(1, pts - 1)) * (n - 1));
      data.push([sorted[idx], (idx + 1) / n]);
    }
    const lo = Number.isFinite(state.lower) ? state.lower : xmin - pad;
    const hi = Number.isFinite(state.upper) ? state.upper : xmax + pad;
    return {
      ...common,
      yAxis: {
        type: "value",
        min: 0,
        max: 1,

        axisLabel: { color: textColor, formatter: (v: number) => `${Math.round(v * 100)}%`, fontSize: 11 },
        splitLine: { lineStyle: { color: gridColor } },
      },
      tooltip: {
        trigger: "axis",
        confine: true,
        formatter: (p: unknown) => {
          const first = (Array.isArray(p) ? p[0] : p) as { value: [number, number] };
          return `${fmt(first.value[0])}<br/>P(X ≤ x) = ${(first.value[1] * 100).toFixed(2)}%`;
        },
      },
      series: [
        {
          id: "cdf",
          type: "line",
          showSymbol: false,
          data,
          lineStyle: { color: "#1d4ed8", width: 2 },
          markArea: { silent: true, itemStyle: { color: "rgba(29,78,216,0.12)" }, data: [[{ xAxis: lo }, { xAxis: hi }]] },
          markLine: { symbol: "none", silent: true, data: markLines, animation: false },
        },
      ],
    };
  }

  const inColor = "#1d4ed8";
  const outColor = dark ? "#475569" : "#cbd5e1";
  return {
    ...common,
    yAxis: {
      type: "value",

      axisLabel: { color: textColor, formatter: (v: number) => `${(v * 100).toFixed(v < 0.01 ? 1 : 0)}%`, fontSize: 11 },
      splitLine: { lineStyle: { color: gridColor } },
    },
    tooltip: {
      trigger: "item",
      confine: true,
      formatter: (p: unknown) => {
        const v = (p as { value: number[] }).value;
        return `[${fmt(v[0])}, ${fmt(v[1])})<br/>${inp.labels.frequency}: ${(v[2] * 100).toFixed(2)}%`;
      },
    },
    series: [
      {
        id: "hist",
        type: "custom",
        renderItem: (_params: CustomSeriesRenderItemParams, api: CustomSeriesRenderItemAPI): CustomSeriesRenderItemReturn => {
          const from = api.value(0) as number;
          const to = api.value(1) as number;
          const h = api.value(2) as number;
          const inside = api.value(3) as number;
          const p0 = api.coord([from, h]);
          const p1 = api.coord([to, 0]);
          return {
            type: "rect",
            shape: { x: p0[0], y: p0[1], width: Math.max(1, p1[0] - p0[0] - 1), height: Math.max(0, p1[1] - p0[1]) },
            style: { fill: inside ? inColor : outColor },
          };
        },
        encode: { x: [0, 1], y: 2 },
        data: bins.map((b) => [b.from, b.to, b.frequency, inBand(state, (b.from + b.to) / 2) ? 1 : 0]),
        markLine: { symbol: "none", silent: true, data: markLines, animation: false },
      },
    ],
  };
}

/** Overlay of several forecasts (CDF lines or frequency polygons on common bins). */
export function overlayOption(
  series: { name: string; sorted: Float64Array }[],
  view: "pdf" | "cdf",
  locale: UiLocale,
  kind: ValueKind,
  dark: boolean,
  labels: { frequency: string; cumulative: string },
): EChartsOption {
  const textColor = dark ? "#cbd5e1" : "#334155";
  const gridColor = dark ? "#334155" : "#e2e8f0";
  const fmt = (v: number) => formatStat(v, locale, kind);
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series) {
    if (!s.sorted.length) continue;
    lo = Math.min(lo, s.sorted[0]);
    hi = Math.max(hi, s.sorted[s.sorted.length - 1]);
  }
  if (!Number.isFinite(lo)) {
    lo = 0;
    hi = 1;
  }
  const out = series.map((s, i) => {
    const n = s.sorted.length;
    let data: [number, number][] = [];
    if (view === "cdf") {
      const pts = Math.min(300, n);
      for (let k = 0; k < pts; k++) {
        const idx = Math.round((k / Math.max(1, pts - 1)) * (n - 1));
        data.push([s.sorted[idx], (idx + 1) / n]);
      }
    } else {
      const nb = 40;
      const w = (hi - lo) / nb || 1;
      let prev = 0;
      data = [];
      for (let b = 0; b < nb; b++) {
        const edge = lo + (b + 1) * w;
        const c = b === nb - 1 ? n : countLE(s.sorted, edge);
        data.push([lo + (b + 0.5) * w, n ? (c - prev) / n : 0]);
        prev = c;
      }
    }
    return {
      name: s.name,
      type: "line" as const,
      showSymbol: false,
      smooth: view === "pdf",
      data,
      lineStyle: { width: 2, color: PALETTE[i % PALETTE.length] },
      itemStyle: { color: PALETTE[i % PALETTE.length] },
      areaStyle: view === "pdf" ? { opacity: 0.08 } : undefined,
    };
  });
  return {
    animation: false,
    backgroundColor: "transparent",
    legend: { top: 4, textStyle: { color: textColor, fontSize: 11 }, type: "scroll" },
    grid: { left: 56, right: 24, top: 40, bottom: 40 },
    tooltip: { trigger: "axis", confine: true, valueFormatter: (v: unknown) => (typeof v === "number" ? `${(v * 100).toFixed(2)}%` : String(v)) },
    xAxis: {
      type: "value",
      scale: true,
      axisLabel: { color: textColor, formatter: (v: number) => fmt(v), hideOverlap: true, fontSize: 11 },
      axisLine: { lineStyle: { color: gridColor } },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: view === "cdf" ? 1 : undefined,

      axisLabel: { color: textColor, formatter: (v: number) => `${Math.round(v * 100)}%`, fontSize: 11 },
      splitLine: { lineStyle: { color: gridColor } },
    },
    series: out,
  };
}

/**
 * ECharts option builders shared by the tools. Pure functions (labels are passed in already
 * translated) so they can be unit-tested and reused.
 *
 * Colours: categorical slots in a fixed, colour-blind-validated order (never cycled — more than
 * eight series are folded / truncated by the callers), a single blue ramp for magnitude and a
 * blue ↔ red diverging pair with a grey midpoint for signed values.
 */
import type { EChartsOption, SeriesOption } from "echarts";
import { fmt, fmtCompact, fmtPct, type Locale } from "./format";

export const PALETTE_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
export const PALETTE_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
export const MAX_SERIES = 8;

export function isDarkTheme(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}
export function palette(): string[] {
  return isDarkTheme() ? PALETTE_DARK : PALETTE_LIGHT;
}
function muted(): string {
  return isDarkTheme() ? "#8a8984" : "#8a8984";
}
function gridLine(): string {
  return isDarkTheme() ? "#33332f" : "#e6e5e0";
}
function ink(): string {
  return isDarkTheme() ? "#c3c2b7" : "#52514e";
}

const BLUE_RAMP = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];
const RED_RAMP = ["#fbd6d3", "#f6bcb8", "#f0a19c", "#ea8681", "#e46b66", "#e34948", "#c93a3a", "#a82f30", "#872627"];

/** Background colour for a heat-map cell. Diverging around 0 when the data straddles 0, else sequential blue. */
export function heatColor(v: number, min: number, max: number): { bg: string; fg: string } {
  if (!Number.isFinite(v)) return { bg: "transparent", fg: "inherit" };
  let bg: string;
  let level: number;
  if (min < 0 && max > 0) {
    if (v >= 0) {
      level = max === 0 ? 0 : v / max;
      bg = BLUE_RAMP[Math.round(level * (BLUE_RAMP.length - 1))];
    } else {
      level = min === 0 ? 0 : v / min;
      bg = RED_RAMP[Math.round(level * (RED_RAMP.length - 1))];
    }
    if (level < 0.06) bg = "#f0efec";
  } else {
    level = max === min ? 0.5 : (v - min) / (max - min);
    bg = BLUE_RAMP[Math.round(level * (BLUE_RAMP.length - 1))];
  }
  return { bg, fg: level > 0.55 ? "#ffffff" : "#0b0b0b" };
}

const valueAxisLabel = (locale: Locale) => ({ formatter: (v: number) => fmtCompact(v, locale), color: ink() });
const pctAxisLabel = (locale: Locale) => ({ formatter: (v: number) => fmtPct(v, 0, locale), color: ink() });

function baseOption(title?: string): EChartsOption {
  return {
    color: palette(),
    title: title ? { text: title, left: "center", textStyle: { fontSize: 13, fontWeight: 600 } } : undefined,
    textStyle: { fontFamily: "inherit" },
    animationDuration: 300,
  };
}

function valueAxis(name: string | undefined, locale: Locale, percent = false, extra: Record<string, unknown> = {}) {
  return {
    type: "value" as const,
    name,
    nameLocation: "middle" as const,
    nameGap: 42,
    scale: true,
    axisLabel: percent ? pctAxisLabel(locale) : valueAxisLabel(locale),
    splitLine: { lineStyle: { color: gridLine() } },
    axisLine: { show: false },
    ...extra,
  };
}

// ---------------------------------------------------------------------------------------------

export interface HistogramInput {
  bins: { from: number; to: number; value: number }[];
  /** Curves drawn on top (e.g. fitted PDF scaled to the same units). */
  overlays?: { name: string; x: number[]; y: number[] }[];
  /** Vertical reference lines. */
  markers?: { value: number; label: string }[];
  barName: string;
  xName?: string;
  yName?: string;
  locale: Locale;
  title?: string;
  /** Y axis in percent (frequencies). */
  yPercent?: boolean;
}

/** Histogram drawn with true bin edges (custom series), optional curve overlays and markers. */
export function histogramOption(h: HistogramInput): EChartsOption {
  const col = palette();
  const series: SeriesOption[] = [
    {
      type: "custom",
      name: h.barName,
      renderItem: (_params, api) => {
        const from = Number(api.value(0));
        const to = Number(api.value(1));
        const y = Number(api.value(2));
        const p0 = api.coord([from, 0]);
        const p1 = api.coord([to, y]);
        return {
          type: "rect",
          shape: { x: p0[0] + 1, y: p1[1], width: Math.max(p1[0] - p0[0] - 2, 1), height: Math.max(p0[1] - p1[1], 0), r: [3, 3, 0, 0] },
          style: { fill: col[0], opacity: 0.85 },
        };
      },
      encode: { x: [0, 1], y: 2, tooltip: [0, 1, 2] },
      data: h.bins.map((b) => [b.from, b.to, b.value]),
      markLine: h.markers?.length
        ? {
            symbol: "none",
            silent: true,
            lineStyle: { color: ink(), type: "dashed", width: 1.5 },
            label: { formatter: "{b}", position: "end", color: ink() },
            data: h.markers.map((m) => ({ name: m.label, xAxis: m.value })),
          }
        : undefined,
    },
    ...(h.overlays ?? []).map(
      (o, i): SeriesOption => ({
        type: "line",
        name: o.name,
        data: o.x.map((x, k) => [x, o.y[k]]),
        showSymbol: false,
        smooth: false,
        lineStyle: { width: 2, color: col[(i + 1) % col.length] },
        itemStyle: { color: col[(i + 1) % col.length] },
      }),
    ),
  ];
  const minX = h.bins.length ? h.bins[0].from : 0;
  const maxX = h.bins.length ? h.bins[h.bins.length - 1].to : 1;
  return {
    ...baseOption(h.title),
    tooltip: {
      trigger: "item",
      formatter: (p: unknown) => {
        const v = (p as { value: number[]; seriesName: string }).value;
        if (v.length >= 3) return `[${fmt(v[0], 3, h.locale)} ; ${fmt(v[1], 3, h.locale)}]<br/>${h.yPercent ? fmtPct(v[2], 2, h.locale) : fmt(v[2], 4, h.locale)}`;
        return `${(p as { seriesName: string }).seriesName}<br/>${fmt(v[0], 3, h.locale)} → ${fmt(v[1], 4, h.locale)}`;
      },
    },
    legend: (h.overlays?.length ?? 0) > 0 ? { bottom: 0 } : undefined,
    grid: { left: 64, right: 24, top: h.title ? 40 : 20, bottom: (h.overlays?.length ?? 0) > 0 ? 64 : 44 },
    xAxis: { ...valueAxis(h.xName, h.locale), min: minX, max: maxX, nameGap: 28, splitLine: { show: false } },
    yAxis: { ...valueAxis(h.yName, h.locale, h.yPercent, { scale: false }), nameGap: 50 },
    series,
  };
}

export interface LineSeriesInput {
  name: string;
  data: (number | null)[];
  dashed?: boolean;
  area?: boolean;
  /** Override x values for this series ([x, y] pairs) when xType = "value". */
  x?: number[];
  width?: number;
  colorIndex?: number;
  step?: boolean;
}

/** Generic multi-line chart (category or value x axis). */
export function lineOption(p: {
  x?: (number | string)[];
  xType?: "category" | "value";
  series: LineSeriesInput[];
  xName?: string;
  yName?: string;
  locale: Locale;
  title?: string;
  yPercent?: boolean;
  xPercent?: boolean;
  markLines?: { y?: number; x?: number | string; label: string }[];
  /** Small multiples: fewer ticks and tighter margins. */
  compact?: boolean;
}): EChartsOption {
  const col = palette();
  const xType = p.xType ?? "category";
  const series: SeriesOption[] = p.series.slice(0, MAX_SERIES * 2).map((s, i) => {
    const color = col[(s.colorIndex ?? i) % col.length];
    const data = xType === "value" ? s.data.map((y, k) => [s.x ? s.x[k] : (p.x?.[k] as number), y]) : s.data;
    return {
      type: "line",
      name: s.name,
      data,
      showSymbol: s.data.length <= 40,
      symbolSize: 6,
      step: s.step ? "end" : undefined,
      connectNulls: false,
      lineStyle: { width: s.width ?? 2, type: s.dashed ? "dashed" : "solid", color },
      itemStyle: { color },
      areaStyle: s.area ? { opacity: 0.12, color } : undefined,
      markLine:
        i === 0 && p.markLines?.length
          ? {
              symbol: "none",
              silent: true,
              lineStyle: { color: muted(), type: "dashed", width: 1.2 },
              label: { formatter: "{b}", color: ink() },
              data: p.markLines.map((m) => (m.y !== undefined ? { name: m.label, yAxis: m.y } : { name: m.label, xAxis: m.x as number })),
            }
          : undefined,
    } as SeriesOption;
  });
  const yAxis = valueAxis(p.yName, p.locale, p.yPercent);
  return {
    ...baseOption(p.title),
    tooltip: {
      trigger: "axis",
      valueFormatter: (v: unknown) => (typeof v === "number" ? (p.yPercent ? fmtPct(v, 2, p.locale) : fmt(v, 4, p.locale)) : String(v ?? "—")),
    },
    legend: p.series.length > 1 ? { bottom: 0, type: "scroll" } : undefined,
    grid: p.compact
      ? { left: 70, right: 28, top: p.title ? 30 : 10, bottom: 24 }
      : { left: 70, right: 28, top: p.title ? 40 : 20, bottom: p.series.length > 1 ? 66 : 44 },
    xAxis:
      xType === "category"
        ? { type: "category", data: p.x, name: p.xName, nameLocation: "middle", nameGap: 28, boundaryGap: false, axisLabel: { color: ink() } }
        : { ...valueAxis(p.xName, p.locale, p.xPercent), nameGap: 28, splitLine: { show: false } },
    yAxis: p.compact ? { ...yAxis, splitNumber: 3 } : yAxis,
    series,
  };
}

/** Horizontal bar chart (rankings). Signed values use blue (+) / red (−). */
export function barRankOption(p: {
  categories: string[];
  values: number[];
  name: string;
  locale: Locale;
  percent?: boolean;
  signed?: boolean;
  title?: string;
  xName?: string;
}): EChartsOption {
  const col = palette();
  const neg = isDarkTheme() ? PALETTE_DARK[7] : PALETTE_LIGHT[7];
  // reverse so the largest bar is on top
  const cats = [...p.categories].reverse();
  const vals = [...p.values].reverse();
  return {
    ...baseOption(p.title),
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: unknown) => (p.percent ? fmtPct(Number(v), 2, p.locale) : fmt(Number(v), 4, p.locale)) },
    grid: { left: 8, right: 56, top: p.title ? 40 : 16, bottom: 36, containLabel: true },
    xAxis: { ...valueAxis(p.xName, p.locale, p.percent, { scale: false }), nameGap: 26 },
    yAxis: { type: "category", data: cats, axisLabel: { color: ink(), width: 160, overflow: "truncate" }, axisTick: { show: false } },
    series: [
      {
        type: "bar",
        name: p.name,
        barMaxWidth: 22,
        data: vals.map((v) => ({ value: v, itemStyle: { color: p.signed && v < 0 ? neg : col[0], borderRadius: v < 0 ? [4, 0, 0, 4] : [0, 4, 4, 0] } })),
        label: {
          show: cats.length <= 15,
          position: "right",
          color: ink(),
          formatter: (x: { value: unknown }) => (p.percent ? fmtPct(Number(x.value), 1, p.locale) : fmt(Number(x.value), 3, p.locale)),
        },
      },
    ],
  };
}

/** Tornado chart: horizontal bars from the base output to the output at the low / high input (real value axis). */
export function tornadoOption(p: {
  names: string[];
  outputAtLow: number[];
  outputAtHigh: number[];
  base: number;
  lowLabel: string;
  highLabel: string;
  baseLabel: string;
  locale: Locale;
}): EChartsOption {
  const col = palette();
  // reverse so the largest swing is on top
  const names = [...p.names].reverse();
  const lo = [...p.outputAtLow].reverse();
  const hi = [...p.outputAtHigh].reverse();
  const barSeries = (name: string, values: number[], color: string): SeriesOption => ({
    type: "custom",
    name,
    itemStyle: { color },
    renderItem: (_params, api) => {
      const idx = Number(api.value(0));
      const v = Number(api.value(1));
      const a = api.coord([p.base, idx]);
      const b = api.coord([v, idx]);
      const band = (api.size?.([0, 1]) as number[] | undefined)?.[1] ?? 20;
      const h = Math.min(26, band * 0.6);
      return {
        type: "rect",
        shape: { x: Math.min(a[0], b[0]), y: a[1] - h / 2, width: Math.max(1, Math.abs(b[0] - a[0])), height: h, r: 3 },
        style: { fill: color },
      };
    },
    encode: { x: 1, y: 0 },
    data: values.map((v, i) => [i, v]),
  });
  return {
    ...baseOption(),
    tooltip: {
      trigger: "item",
      formatter: (q: unknown) => {
        const { seriesName, value } = q as { seriesName: string; value: [number, number] };
        return `${names[value[0]]}<br/>${seriesName}: ${fmt(value[1], 2, p.locale)}<br/>${p.baseLabel}: ${fmt(p.base, 2, p.locale)}`;
      },
    },
    legend: { bottom: 0, data: [p.lowLabel, p.highLabel] },
    grid: { left: 8, right: 32, top: 28, bottom: 52, containLabel: true },
    xAxis: { type: "value", scale: true, axisLabel: { formatter: (v: number) => fmtCompact(v, p.locale), color: ink() }, splitLine: { lineStyle: { color: gridLine() } } },
    yAxis: { type: "category", data: names, axisTick: { show: false }, axisLabel: { color: ink(), width: 160, overflow: "truncate" } },
    series: [
      barSeries(p.lowLabel, lo, col[1]),
      barSeries(p.highLabel, hi, col[0]),
      {
        // invisible point so the axis extent always includes the base value, plus the base line
        type: "scatter",
        data: [[p.base, 0]],
        symbolSize: 0,
        silent: true,
        tooltip: { show: false },
        markLine: {
          symbol: "none",
          silent: true,
          lineStyle: { color: ink(), width: 1.5, type: "dashed" },
          label: { formatter: `${p.baseLabel}: ${fmt(p.base, 2, p.locale)}`, position: "end", color: ink() },
          data: [{ xAxis: p.base }],
        },
      },
    ],
  };
}

/** Forecast chart: actual, fitted, forecast and 80/95 % bands (stacked-area trick). */
export function forecastBandOption(p: {
  actual: number[];
  fitted: number[];
  forecast: number[];
  /**
   * Prediction bands, one per confidence level (any order; drawn widest first, the wider the
   * more transparent). When omitted, the legacy 80 % / 95 % fields below are used.
   */
  bands?: { level: number; lower: number[]; upper: number[]; label: string }[];
  lower80?: number[];
  upper80?: number[];
  lower95?: number[];
  upper95?: number[];
  labels: { actual: string; fitted: string; forecast: string; band80?: string; band95?: string; period: string };
  locale: Locale;
}): EChartsOption {
  const col = palette();
  const n = p.actual.length;
  const h = p.forecast.length;
  const x = Array.from({ length: n + h }, (_, i) => String(i + 1));
  const pad = (arr: (number | null)[], before: number) => [...Array<number | null>(before).fill(null), ...arr];
  const clean = (arr: number[]) => arr.map((v) => (Number.isFinite(v) ? v : null));
  // forecast line starts at the last actual point so it connects visually
  const fc = [...Array<number | null>(n - 1).fill(null), p.actual[n - 1], ...clean(p.forecast)];
  const band = (lower: number[], upper: number[], name: string, opacity: number, stack: string): SeriesOption[] => [
    { type: "line", name, stack, stackStrategy: "all", data: pad(clean(lower), n), lineStyle: { opacity: 0 }, showSymbol: false, silent: true, tooltip: { show: false } },
    {
      type: "line",
      name,
      stack,
      stackStrategy: "all",
      data: pad(
        upper.map((u, i) => (Number.isFinite(u) && Number.isFinite(lower[i]) ? u - lower[i] : null)),
        n,
      ),
      lineStyle: { opacity: 0 },
      showSymbol: false,
      areaStyle: { color: col[0], opacity },
      silent: true,
      tooltip: { show: false },
    },
  ];
  const bands = (
    p.bands ??
    [
      p.lower80 && p.upper80 ? { level: 0.8, lower: p.lower80, upper: p.upper80, label: p.labels.band80 ?? "80 %" } : null,
      p.lower95 && p.upper95 ? { level: 0.95, lower: p.lower95, upper: p.upper95, label: p.labels.band95 ?? "95 %" } : null,
    ].filter((b): b is NonNullable<typeof b> => b !== null)
  )
    .slice()
    .sort((a, b) => b.level - a.level); // widest first
  const nb = bands.length;
  // widest band: lightest; inner bands progressively more opaque (they also overlap the outer ones)
  const opacityOf = (i: number) => (nb <= 1 ? 0.18 : 0.1 + (0.12 * i) / (nb - 1));
  return {
    ...baseOption(),
    tooltip: { trigger: "axis", valueFormatter: (v: unknown) => (typeof v === "number" ? fmt(v, 3, p.locale) : "—") },
    legend: {
      bottom: 0,
      data: [
        p.labels.actual,
        p.labels.fitted,
        p.labels.forecast,
        // band swatches in the band colour (inner → outer), not the invisible base series' colour
        ...bands
          .map((b, i) => ({ name: b.label, icon: "roundRect", itemStyle: { color: col[0], opacity: Math.min(1, 0.25 + 2.5 * opacityOf(i)) } }))
          .reverse(),
      ],
    },
    grid: { left: 70, right: 24, top: 20, bottom: 64 },
    xAxis: { type: "category", data: x, name: p.labels.period, nameLocation: "middle", nameGap: 28, boundaryGap: false, axisLabel: { color: ink() } },
    yAxis: valueAxis(undefined, p.locale),
    series: [
      ...bands.flatMap((b, i) => band(b.lower, b.upper, b.label, opacityOf(i), `band${i}`)),
      { type: "line", name: p.labels.actual, data: p.actual, showSymbol: n <= 60, symbolSize: 5, lineStyle: { width: 2, color: ink() }, itemStyle: { color: ink() } },
      { type: "line", name: p.labels.fitted, data: clean(p.fitted), showSymbol: false, lineStyle: { width: 2, type: "dashed", color: col[1] }, itemStyle: { color: col[1] } },
      { type: "line", name: p.labels.forecast, data: fc, showSymbol: h <= 40, symbolSize: 6, lineStyle: { width: 2.5, color: col[0] }, itemStyle: { color: col[0] } },
    ],
  };
}

/** Fan chart of simulated paths: percentile bands + median + a few sample paths. */
export function fanChartOption(p: {
  x: (number | string)[];
  bands: { lower: number[]; upper: number[]; label: string }[];
  median: number[];
  samplePaths: number[][];
  labels: { median: string; paths: string; time: string; value: string };
  locale: Locale;
}): EChartsOption {
  const col = palette();
  const series: SeriesOption[] = [];
  p.samplePaths.forEach((path) =>
    series.push({
      type: "line",
      name: p.labels.paths,
      data: path,
      showSymbol: false,
      silent: true,
      lineStyle: { width: 1, color: col[1], opacity: 0.35 },
      itemStyle: { color: col[1] },
      tooltip: { show: false },
      z: 1,
      legendHoverLink: false,
    }),
  );
  p.bands.forEach((b, i) => {
    const stack = `band${i}`;
    series.push(
      { type: "line", name: b.label, stack, stackStrategy: "all", data: b.lower, lineStyle: { opacity: 0 }, showSymbol: false, silent: true, tooltip: { show: false } },
      {
        type: "line",
        name: b.label,
        stack,
        stackStrategy: "all",
        data: b.upper.map((u, k) => u - b.lower[k]),
        lineStyle: { opacity: 0 },
        showSymbol: false,
        areaStyle: { color: col[0], opacity: 0.1 + 0.08 * i },
        itemStyle: { color: col[0] },
        silent: true,
        tooltip: { show: false },
      },
    );
  });
  series.push({ type: "line", name: p.labels.median, data: p.median, showSymbol: false, lineStyle: { width: 2.5, color: col[0] }, itemStyle: { color: col[0] }, z: 5 });
  return {
    ...baseOption(),
    tooltip: { trigger: "axis", valueFormatter: (v: unknown) => (typeof v === "number" ? fmt(v, 3, p.locale) : "—") },
    legend: {
      bottom: 0,
      data: [
        p.labels.median,
        ...p.bands.map((b, i) => ({ name: b.label, icon: "roundRect", itemStyle: { color: col[0], opacity: Math.min(1, 0.25 + 2.5 * (0.1 + 0.08 * i)) } })),
        p.labels.paths,
      ],
    },
    grid: { left: 70, right: 24, top: 20, bottom: 64 },
    xAxis: { type: "category", data: p.x, name: p.labels.time, nameLocation: "middle", nameGap: 28, boundaryGap: false, axisLabel: { color: ink() } },
    yAxis: valueAxis(p.labels.value, p.locale),
    series,
  };
}

/** NPV profile with the IRR(s) and the discount rate marked. */
export function npvProfileOption(p: {
  points: { rate: number; npv: number }[];
  irrs: number[];
  discountRate?: number;
  labels: { npv: string; rate: string; irr: string; discount: string };
  locale: Locale;
}): EChartsOption {
  const col = palette();
  const marks: { name: string; xAxis: number }[] = p.irrs.filter(Number.isFinite).map((r) => ({ name: `${p.labels.irr} ${fmtPct(r, 2, p.locale)}`, xAxis: r }));
  if (p.discountRate !== undefined && Number.isFinite(p.discountRate)) marks.push({ name: `${p.labels.discount} ${fmtPct(p.discountRate, 1, p.locale)}`, xAxis: p.discountRate });
  return {
    ...baseOption(),
    tooltip: {
      trigger: "axis",
      formatter: (ps: unknown) => {
        const arr = ps as { value: [number, number] }[];
        if (!arr.length) return "";
        const [r, v] = arr[0].value;
        return `${p.labels.rate}: ${fmtPct(r, 2, p.locale)}<br/>${p.labels.npv}: ${fmt(v, 2, p.locale)}`;
      },
    },
    grid: { left: 76, right: 28, top: 24, bottom: 44 },
    xAxis: { ...valueAxis(p.labels.rate, p.locale, true, { scale: false }), nameGap: 28, splitLine: { show: false } },
    yAxis: valueAxis(p.labels.npv, p.locale, false, { nameGap: 58 }),
    series: [
      {
        type: "line",
        name: p.labels.npv,
        data: p.points.map((q) => [q.rate, q.npv]),
        showSymbol: false,
        lineStyle: { width: 2.5, color: col[0] },
        itemStyle: { color: col[0] },
        markLine: {
          symbol: "none",
          silent: true,
          label: { formatter: "{b}", color: ink(), position: "insideEndTop" },
          lineStyle: { color: muted(), type: "dashed" },
          data: [{ name: "", yAxis: 0, lineStyle: { type: "solid", color: muted() } }, ...marks],
        },
        markPoint: {
          symbol: "circle",
          symbolSize: 10,
          itemStyle: { color: col[1] },
          label: { show: false },
          data: p.irrs.filter(Number.isFinite).map((r) => ({ name: "", coord: [r, 0] })),
        },
      },
    ],
  };
}

/** ACF / PACF bars with ±1.96/√n significance bounds. */
export function correlogramOption(p: { values: number[]; n: number; name: string; locale: Locale; lagLabel: string; title?: string }): EChartsOption {
  const col = palette();
  const bound = 1.96 / Math.sqrt(Math.max(1, p.n));
  return {
    ...baseOption(p.title),
    tooltip: { trigger: "axis", valueFormatter: (v: unknown) => fmt(Number(v), 3, p.locale) },
    grid: { left: 52, right: 20, top: p.title ? 36 : 16, bottom: 40 },
    xAxis: { type: "category", data: p.values.map((_, i) => String(i + 1)), name: p.lagLabel, nameLocation: "middle", nameGap: 26, axisLabel: { color: ink() } },
    yAxis: { type: "value", min: -1, max: 1, axisLabel: { color: ink() }, splitLine: { lineStyle: { color: gridLine() } } },
    series: [
      {
        type: "bar",
        name: p.name,
        barMaxWidth: 10,
        data: p.values.map((v) => ({ value: v, itemStyle: { color: Math.abs(v) > bound ? col[0] : muted() } })),
        markLine: {
          symbol: "none",
          silent: true,
          lineStyle: { color: col[7], type: "dashed" },
          label: { show: false },
          data: [{ yAxis: bound }, { yAxis: -bound }],
        },
      },
    ],
  };
}

/** Scatter plot, optionally with the 45° line (Q–Q / P–P / actual vs fitted) or a zero line (residuals). */
export function scatterOption(p: {
  points: [number, number][];
  name: string;
  xName: string;
  yName: string;
  locale: Locale;
  diagonal?: boolean;
  zeroLine?: boolean;
  title?: string;
}): EChartsOption {
  const col = palette();
  let lo = Infinity;
  let hi = -Infinity;
  for (const [x, y] of p.points) {
    lo = Math.min(lo, x, y);
    hi = Math.max(hi, x, y);
  }
  const extra: SeriesOption[] = p.diagonal && Number.isFinite(lo)
    ? [{ type: "line", name: "45°", data: [[lo, lo], [hi, hi]], showSymbol: false, silent: true, lineStyle: { color: muted(), type: "dashed", width: 1.5 }, tooltip: { show: false } }]
    : [];
  return {
    ...baseOption(p.title),
    tooltip: {
      trigger: "item",
      formatter: (q: unknown) => {
        const v = (q as { value: [number, number] }).value;
        return `${p.xName}: ${fmt(v[0], 4, p.locale)}<br/>${p.yName}: ${fmt(v[1], 4, p.locale)}`;
      },
    },
    grid: { left: 70, right: 24, top: p.title ? 40 : 20, bottom: 46 },
    xAxis: { ...valueAxis(p.xName, p.locale), nameGap: 28, splitLine: { show: false } },
    yAxis: valueAxis(p.yName, p.locale),
    series: [
      {
        type: "scatter",
        name: p.name,
        data: p.points,
        symbolSize: 7,
        itemStyle: { color: col[0], opacity: 0.75, borderColor: isDarkTheme() ? "#1a1a19" : "#ffffff", borderWidth: 1 },
        markLine: p.zeroLine ? { symbol: "none", silent: true, lineStyle: { color: muted(), type: "dashed" }, label: { show: false }, data: [{ yAxis: 0 }] } : undefined,
      },
      ...extra,
    ],
  };
}

/** Vertical (stacked or grouped) bar chart by category. */
export function columnOption(p: {
  categories: (string | number)[];
  series: { name: string; data: number[]; colorIndex?: number }[];
  stacked?: boolean;
  locale: Locale;
  xName?: string;
  yName?: string;
  yPercent?: boolean;
  title?: string;
  markLines?: { y: number; label: string }[];
  signed?: boolean;
}): EChartsOption {
  const col = palette();
  const neg = isDarkTheme() ? PALETTE_DARK[7] : PALETTE_LIGHT[7];
  return {
    ...baseOption(p.title),
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      valueFormatter: (v: unknown) => (p.yPercent ? fmtPct(Number(v), 2, p.locale) : fmt(Number(v), 2, p.locale)),
    },
    legend: p.series.length > 1 ? { bottom: 0 } : undefined,
    grid: { left: 72, right: 24, top: p.title ? 40 : 20, bottom: p.series.length > 1 ? 64 : 44 },
    xAxis: { type: "category", data: p.categories.map(String), name: p.xName, nameLocation: "middle", nameGap: 28, axisLabel: { color: ink() } },
    yAxis: valueAxis(p.yName, p.locale, p.yPercent, { scale: false, nameGap: 56 }),
    series: p.series.slice(0, MAX_SERIES).map((s, i) => {
      const color = col[(s.colorIndex ?? i) % col.length];
      return {
        type: "bar",
        name: s.name,
        stack: p.stacked ? "total" : undefined,
        barMaxWidth: 36,
        itemStyle: { color, borderColor: isDarkTheme() ? "#1a1a19" : "#ffffff", borderWidth: p.stacked ? 1 : 0 },
        data: p.signed ? s.data.map((v) => ({ value: v, itemStyle: { color: v < 0 ? neg : color } })) : s.data,
        markLine:
          i === 0 && p.markLines?.length
            ? {
                symbol: "none",
                silent: true,
                lineStyle: { color: ink(), type: "dashed" },
                label: { formatter: "{b}", color: ink(), position: "insideEndTop" },
                data: p.markLines.map((m) => ({ name: m.label, yAxis: m.y })),
              }
            : undefined,
      } as SeriesOption;
    }),
  };
}

/** Break-even chart: revenue, total cost and fixed cost vs units, with the break-even point marked. */
export function breakEvenOption(p: {
  fixedCosts: number;
  price: number;
  variableCost: number;
  breakEvenUnits: number;
  labels: { revenue: string; totalCost: string; fixedCost: string; units: string; amount: string; breakEven: string };
  locale: Locale;
}): EChartsOption {
  const col = palette();
  const maxU = Number.isFinite(p.breakEvenUnits) && p.breakEvenUnits > 0 ? p.breakEvenUnits * 2 : 100;
  const xs = Array.from({ length: 41 }, (_, i) => (maxU * i) / 40);
  const line = (name: string, f: (u: number) => number, c: string, dashed = false): SeriesOption => ({
    type: "line",
    name,
    data: xs.map((u) => [u, f(u)]),
    showSymbol: false,
    lineStyle: { width: 2, color: c, type: dashed ? "dashed" : "solid" },
    itemStyle: { color: c },
  });
  const be = p.breakEvenUnits;
  return {
    ...baseOption(),
    tooltip: { trigger: "axis", valueFormatter: (v: unknown) => fmt(Number(v), 2, p.locale) },
    legend: { bottom: 0 },
    grid: { left: 80, right: 28, top: 24, bottom: 64 },
    xAxis: { ...valueAxis(p.labels.units, p.locale, false, { scale: false }), nameGap: 28, splitLine: { show: false } },
    yAxis: valueAxis(p.labels.amount, p.locale, false, { scale: false, nameGap: 62 }),
    series: [
      {
        ...line(p.labels.revenue, (u) => u * p.price, col[0]),
        markPoint: Number.isFinite(be)
          ? {
              symbol: "circle",
              symbolSize: 12,
              itemStyle: { color: col[1] },
              label: { show: true, position: "top", formatter: `${p.labels.breakEven}: ${fmt(be, 0, p.locale)}`, color: ink() },
              data: [{ coord: [be, be * p.price] }],
            }
          : undefined,
      } as SeriesOption,
      line(p.labels.totalCost, (u) => p.fixedCosts + u * p.variableCost, col[7]),
      line(p.labels.fixedCost, () => p.fixedCosts, col[3], true),
    ],
  };
}

/**
 * Simulation report → spreadsheet sheets (bilingual es/en).
 */
import type { DistributionSpec, RiskModel, SimulationResult } from "@openrisksim/core";
import { getDistributionMeta } from "@openrisksim/distributions";
import type { ReportSheet } from "./types";

type Locale = "es" | "en";
type Row = (string | number | null)[];

const MAX_RAW_ROWS = 10000;

const T = {
  summary: { es: "Resumen", en: "Summary" },
  forecasts: { es: "Pronósticos", en: "Forecasts" },
  assumptions: { es: "Supuestos", en: "Assumptions" },
  sensitivity: { es: "Sensibilidad", en: "Sensitivity" },
  data: { es: "Datos de simulación", en: "Simulation data" },
  title: { es: "OpenRiskSim — Informe de simulación", en: "OpenRiskSim — Simulation report" },
  generated: { es: "Generado", en: "Generated" },
  settings: { es: "Configuración", en: "Settings" },
  trialsRequested: { es: "Pruebas solicitadas", en: "Trials requested" },
  trialsRun: { es: "Pruebas ejecutadas", en: "Trials run" },
  seed: { es: "Semilla", en: "Seed" },
  random: { es: "aleatoria", en: "random" },
  sampling: { es: "Método de muestreo", en: "Sampling method" },
  monteCarlo: { es: "Monte Carlo", en: "Monte Carlo" },
  latinHypercube: { es: "Hipercubo latino", en: "Latin hypercube" },
  correlations: { es: "Correlaciones", en: "Correlations" },
  applied: { es: "aplicadas", en: "applied" },
  notApplied: { es: "no aplicadas", en: "not applied" },
  elapsed: { es: "Tiempo (s)", en: "Elapsed (s)" },
  speed: { es: "Pruebas por segundo", en: "Trials per second" },
  stoppedEarly: { es: "Detenida por control de precisión", en: "Stopped by precision control" },
  yes: { es: "Sí", en: "Yes" },
  no: { es: "No", en: "No" },
  nAssumptions: { es: "Supuestos (habilitados)", en: "Assumptions (enabled)" },
  nForecasts: { es: "Pronósticos", en: "Forecasts" },
  nDecisions: { es: "Variables de decisión", en: "Decision variables" },
  statistic: { es: "Estadístico", en: "Statistic" },
  cell: { es: "Celda", en: "Cell" },
  name: { es: "Nombre", en: "Name" },
  distribution: { es: "Distribución", en: "Distribution" },
  parameters: { es: "Parámetros", en: "Parameters" },
  truncation: { es: "Truncamiento", en: "Truncation" },
  enabled: { es: "Habilitado", en: "Enabled" },
  sampleMean: { es: "Media muestral", en: "Sample mean" },
  sampleSd: { es: "Desv. est. muestral", en: "Sample std. dev." },
  sampleMin: { es: "Mínimo muestral", en: "Sample min" },
  sampleMax: { es: "Máximo muestral", en: "Sample max" },
  assumption: { es: "Supuesto", en: "Assumption" },
  rankCorr: { es: "Correlación de rangos", en: "Rank correlation" },
  contribution: { es: "Contribución a la varianza", en: "Contribution to variance" },
  trial: { es: "Prueba", en: "Trial" },
  rawNote: { es: "Primeras {n} pruebas de {t}", en: "First {n} of {t} trials" },
  rho: { es: "Coeficiente", en: "Coefficient" },
  count: { es: "Pruebas válidas", en: "Valid trials" },
  errors: { es: "Pruebas con error", en: "Trials with errors" },
  mean: { es: "Media", en: "Mean" },
  median: { es: "Mediana", en: "Median" },
  mode: { es: "Moda", en: "Mode" },
  stdDev: { es: "Desviación estándar", en: "Standard deviation" },
  variance: { es: "Varianza", en: "Variance" },
  cv: { es: "Coeficiente de variación", en: "Coefficient of variation" },
  min: { es: "Mínimo", en: "Minimum" },
  max: { es: "Máximo", en: "Maximum" },
  range: { es: "Rango", en: "Range" },
  skewness: { es: "Asimetría", en: "Skewness" },
  kurtosis: { es: "Curtosis (exceso)", en: "Kurtosis (excess)" },
  sem: { es: "Error estándar de la media", en: "Standard error of the mean" },
  ciLow: { es: "IC 95% media (inferior)", en: "Mean 95% CI (lower)" },
  ciHigh: { es: "IC 95% media (superior)", en: "Mean 95% CI (upper)" },
  percentiles: { es: "Percentiles", en: "Percentiles" },
  certainty: { es: "Certeza", en: "Certainty" },
  pBelow0: { es: "P(x < 0)", en: "P(x < 0)" },
  pAbove0: { es: "P(x ≥ 0)", en: "P(x ≥ 0)" },
} as const;

function t(key: keyof typeof T, locale: Locale): string {
  return T[key][locale];
}

function finite(x: number | undefined): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

function quickStats(v: ArrayLike<number> | undefined): { mean: number; sd: number; min: number; max: number } {
  let n = 0;
  let mean = 0;
  let m2 = 0;
  let min = Infinity;
  let max = -Infinity;
  if (v) {
    for (let i = 0; i < v.length; i++) {
      const x = v[i];
      if (!Number.isFinite(x)) continue;
      n++;
      const d = x - mean;
      mean += d / n;
      m2 += d * (x - mean);
      if (x < min) min = x;
      if (x > max) max = x;
    }
  }
  return { mean: n ? mean : NaN, sd: n > 1 ? Math.sqrt(m2 / (n - 1)) : NaN, min: n ? min : NaN, max: n ? max : NaN };
}

/** Localised distribution name (falls back to the id). */
export function distributionLabel(spec: DistributionSpec, locale: Locale): string {
  try {
    return getDistributionMeta(spec.id).name[locale];
  } catch {
    return spec.id;
  }
}

/** "mean = 10; stdDev = 2" with localised parameter labels where available. */
export function distributionParamsText(spec: DistributionSpec, locale: Locale): string {
  if (spec.id === "custom") {
    const n = spec.values?.length ?? 0;
    return locale === "es" ? `${n} valores${spec.weights ? " ponderados" : ""}` : `${n} values${spec.weights ? " (weighted)" : ""}`;
  }
  let labels: Record<string, string> = {};
  try {
    labels = Object.fromEntries(getDistributionMeta(spec.id).params.map((p) => [p.key, p.label[locale]]));
  } catch {
    /* no meta */
  }
  return Object.entries(spec.params)
    .map(([k, v]) => `${labels[k] ?? k} = ${formatNum(v)}`)
    .join("; ");
}

function formatNum(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  return Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-4 && v !== 0) ? v.toExponential(4) : String(Math.round(v * 1e6) / 1e6);
}

function cellText(sheet: string, address: string): string {
  return `${sheet}!${address}`;
}

/** Build the report sheets for a finished simulation. */
export function buildSimulationReport(model: RiskModel, result: SimulationResult, locale: Locale): ReportSheet[] {
  const L = (k: keyof typeof T) => t(k, locale);
  const enabled = model.assumptions.filter((a) => a.enabled);
  const forecasts = model.forecasts.filter((f) => result.forecasts[f.id]);

  // ---- Summary
  const s = model.settings;
  const summary: Row[] = [
    [L("title")],
    [L("generated"), new Date().toISOString().replace("T", " ").slice(0, 19)],
    [],
    [L("settings")],
    [L("trialsRequested"), s.trials],
    [L("trialsRun"), result.trials],
    [L("seed"), result.seed ?? L("random")],
    [L("sampling"), s.sampling === "latinHypercube" ? L("latinHypercube") : L("monteCarlo")],
    [L("correlations"), s.applyCorrelations && model.correlations.length ? L("applied") : L("notApplied")],
    [L("elapsed"), Math.round(result.elapsedMs) / 1000],
    [L("speed"), result.elapsedMs > 0 ? Math.round((result.trials / result.elapsedMs) * 1000) : null],
    [L("stoppedEarly"), result.stoppedEarly ? L("yes") : L("no")],
    [L("nAssumptions"), enabled.length],
    [L("nForecasts"), forecasts.length],
    [L("nDecisions"), model.decisions.length],
    [],
    [L("forecasts"), L("cell"), L("mean"), L("stdDev"), "P5", "P50", "P95"],
  ];
  for (const f of forecasts) {
    const st = result.forecasts[f.id].stats;
    summary.push([
      f.name,
      cellText(f.cell.sheet, f.cell.address),
      finite(st?.mean),
      finite(st?.stdDev),
      finite(st?.percentiles?.[5]),
      finite(st?.percentiles?.[50]),
      finite(st?.percentiles?.[95]),
    ]);
  }

  // ---- Forecast statistics (one column per forecast)
  const fRows: Row[] = [[L("statistic"), ...forecasts.map((f) => f.name)], [L("cell"), ...forecasts.map((f) => cellText(f.cell.sheet, f.cell.address))]];
  const statKeys: [keyof typeof T, (id: string) => number | undefined][] = [
    ["count", (id) => result.forecasts[id].stats?.count],
    ["errors", (id) => result.forecasts[id].errors],
    ["mean", (id) => result.forecasts[id].stats?.mean],
    ["median", (id) => result.forecasts[id].stats?.median],
    ["mode", (id) => result.forecasts[id].stats?.mode],
    ["stdDev", (id) => result.forecasts[id].stats?.stdDev],
    ["variance", (id) => result.forecasts[id].stats?.variance],
    ["cv", (id) => result.forecasts[id].stats?.cv],
    ["min", (id) => result.forecasts[id].stats?.min],
    ["max", (id) => result.forecasts[id].stats?.max],
    ["range", (id) => result.forecasts[id].stats?.range],
    ["skewness", (id) => result.forecasts[id].stats?.skewness],
    ["kurtosis", (id) => result.forecasts[id].stats?.kurtosis],
    ["sem", (id) => result.forecasts[id].stats?.stdErrorMean],
    ["ciLow", (id) => result.forecasts[id].stats?.meanCI95?.[0]],
    ["ciHigh", (id) => result.forecasts[id].stats?.meanCI95?.[1]],
  ];
  for (const [key, get] of statKeys) fRows.push([L(key), ...forecasts.map((f) => finite(get(f.id)))]);
  fRows.push([]);
  fRows.push([L("percentiles")]);
  for (let p = 5; p <= 95; p += 5) {
    fRows.push([`P${p}`, ...forecasts.map((f) => finite(result.forecasts[f.id].stats?.percentiles?.[p]))]);
  }
  fRows.push([]);
  fRows.push([L("certainty")]);
  const below: (number | null)[] = [];
  const above: (number | null)[] = [];
  for (const f of forecasts) {
    const v = result.forecasts[f.id].values;
    let n = 0;
    let neg = 0;
    for (let i = 0; i < v.length; i++) {
      const x = v[i];
      if (Number.isNaN(x)) continue;
      n++;
      if (x < 0) neg++;
    }
    below.push(n ? neg / n : null);
    above.push(n ? (n - neg) / n : null);
  }
  fRows.push([L("pBelow0"), ...below]);
  fRows.push([L("pAbove0"), ...above]);

  // ---- Assumptions
  const aRows: Row[] = [
    [L("name"), L("cell"), L("distribution"), L("parameters"), L("truncation"), L("enabled"), L("sampleMean"), L("sampleSd"), L("sampleMin"), L("sampleMax")],
  ];
  for (const a of model.assumptions) {
    const q = quickStats(result.assumptionSamples[a.id]);
    const tr = a.distribution.truncate;
    const trText = tr && (tr.min !== undefined || tr.max !== undefined) ? `[${tr.min ?? "-∞"}, ${tr.max ?? "∞"}]` : "";
    aRows.push([
      a.name,
      cellText(a.cell.sheet, a.cell.address),
      distributionLabel(a.distribution, locale),
      distributionParamsText(a.distribution, locale),
      trText,
      a.enabled ? L("yes") : L("no"),
      finite(q.mean),
      finite(q.sd),
      finite(q.min),
      finite(q.max),
    ]);
  }
  if (model.correlations.length) {
    aRows.push([]);
    aRows.push([L("correlations")]);
    aRows.push([L("assumption"), L("assumption"), L("rho")]);
    const nameOf = (id: string) => model.assumptions.find((a) => a.id === id)?.name ?? id;
    for (const c of model.correlations) aRows.push([nameOf(c.a), nameOf(c.b), c.rho]);
  }

  // ---- Sensitivity
  const sRows: Row[] = [];
  const nameOf = (id: string) => model.assumptions.find((a) => a.id === id)?.name ?? id;
  for (const f of forecasts) {
    const entries = result.sensitivity?.[f.id] ?? [];
    sRows.push([`${L("forecasts")}: ${f.name}`]);
    sRows.push([L("assumption"), L("rankCorr"), L("contribution")]);
    for (const e of entries) sRows.push([nameOf(e.assumptionId), finite(e.rankCorrelation), finite(e.contributionToVariance)]);
    sRows.push([]);
  }

  // ---- Raw data extract
  const n = Math.min(result.trials, MAX_RAW_ROWS);
  const sampled = enabled.filter((a) => result.assumptionSamples[a.id]);
  const dRows: Row[] = [
    [L("rawNote").replace("{n}", String(n)).replace("{t}", String(result.trials))],
    [L("trial"), ...sampled.map((a) => a.name), ...forecasts.map((f) => f.name)],
  ];
  for (let i = 0; i < n; i++) {
    const row: Row = [i + 1];
    for (const a of sampled) row.push(finite(result.assumptionSamples[a.id][i]));
    for (const f of forecasts) row.push(finite(result.forecasts[f.id].values[i]));
    dRows.push(row);
  }

  return [
    { name: L("summary"), rows: summary },
    { name: L("forecasts"), rows: fRows },
    { name: L("assumptions"), rows: aRows },
    { name: L("sensitivity"), rows: sRows },
    { name: L("data"), rows: dRows },
  ];
}

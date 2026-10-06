/**
 * Simulation reports: chart images (offscreen ECharts), .xlsx report (buildSimulationReport + a
 * charts sheet) and a printable HTML report (browser "Save as PDF").
 */
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import type { RiskModel, SimulationResult } from "@openrisksim/core";
import { buildSimulationReport, writeXlsx, type ReportSheet, type WorkbookData } from "@openrisksim/workbook";
import { computeBins, forecastChartOption } from "../results/charts";
import { defaultCertainty, sortedFinite, certaintyFromBounds, levelNumber, meanConfidenceInterval, type CertaintyState } from "./certainty";
import { formatStat, type UiLocale } from "./numberFormat";
import { describeSpec } from "./modelText";

type T = (key: string, opts?: Record<string, unknown>) => string;

export function renderOptionToPng(option: EChartsOption, width = 760, height = 340): string {
  const div = document.createElement("div");
  div.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:${height}px;`;
  document.body.appendChild(div);
  const chart = echarts.init(div, undefined, { renderer: "canvas", width, height });
  try {
    chart.setOption({ ...option, animation: false, backgroundColor: "#ffffff" });
    return chart.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: "#ffffff" });
  } finally {
    chart.dispose();
    div.remove();
  }
}

export interface ForecastImage {
  forecastId: string;
  name: string;
  dataUrl: string;
  state: CertaintyState;
}

export function forecastImages(model: RiskModel, result: SimulationResult, locale: UiLocale, t: T, states: Record<string, CertaintyState>): ForecastImage[] {
  const out: ForecastImage[] = [];
  for (const f of model.forecasts) {
    const fr = result.forecasts[f.id];
    if (!fr) continue;
    const sorted = sortedFinite(fr.values);
    if (!sorted.length) continue;
    const state = states[f.id] ?? defaultCertainty(sorted, "two", f.certainty ?? 0.9);
    const option = forecastChartOption({
      sorted,
      bins: computeBins(sorted),
      state,
      view: "pdf",
      locale,
      kind: f.format,
      mean: fr.stats.mean,
      dark: false,
      title: `${f.name} — ${t("results.certainty")} ${(state.certainty * 100).toFixed(2)}%`,
      labels: { frequency: t("results.frequency"), cumulative: t("results.cumulative"), mean: t("stats.mean"), certainty: t("results.certainty") },
    });
    out.push({ forecastId: f.id, name: f.name, dataUrl: renderOptionToPng(option), state });
  }
  return out;
}

/** .xlsx = workbook + model + report sheets (+ charts sheet). */
export async function buildReportXlsx(snapshot: WorkbookData, model: RiskModel, result: SimulationResult | null, locale: UiLocale, t: T, states: Record<string, CertaintyState>, includeReport: boolean): Promise<ArrayBuffer> {
  let reports: ReportSheet[] | undefined;
  if (includeReport && result) {
    reports = buildSimulationReport(model, result, locale);
    const imgs = forecastImages(model, result, locale, t, states);
    if (imgs.length) {
      const rows: (string | number | null)[][] = [[t("report.chartsSheetTitle")]];
      const images: NonNullable<ReportSheet["images"]> = [];
      imgs.forEach((img, i) => {
        const row = 2 + i * 20;
        while (rows.length < row) rows.push([]);
        rows.push([img.name]);
        images.push({ pngBase64: img.dataUrl.replace(/^data:image\/png;base64,/, ""), at: `A${row + 2}`, width: 760, height: 340 });
      });
      reports.push({ name: t("report.chartsSheet"), rows, images });
    }
  }
  return writeXlsx(snapshot, { includeModel: true, reports });
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Build a self-contained printable HTML report. */
export function buildHtmlReport(model: RiskModel, result: SimulationResult, locale: UiLocale, t: T, states: Record<string, CertaintyState>, fileName: string): string {
  const imgs = forecastImages(model, result, locale, t, states);
  const s = model.settings;
  const date = new Date().toLocaleString(locale === "es" ? "es-ES" : "en-US");
  const nameOf = (id: string) => model.assumptions.find((a) => a.id === id)?.name ?? id;
  const parts: string[] = [];
  parts.push(`<header><h1>${esc(t("report.title"))}</h1><div class="meta">${esc(fileName)} · ${esc(date)} · OpenRiskSim</div></header>`);
  parts.push(`<section><h2>${esc(t("report.settings"))}</h2><table class="kv">
    <tr><th>${esc(t("settings.trials"))}</th><td>${result.trials.toLocaleString(locale)}${result.trials < s.trials ? ` / ${s.trials.toLocaleString(locale)}` : ""}</td></tr>
    <tr><th>${esc(t("settings.seed"))}</th><td>${result.seed ?? esc(t("settings.random"))}</td></tr>
    <tr><th>${esc(t("settings.sampling"))}</th><td>${esc(t(s.sampling === "latinHypercube" ? "settings.lhs" : "settings.mc"))}</td></tr>
    <tr><th>${esc(t("settings.applyCorrelations"))}</th><td>${s.applyCorrelations && model.correlations.length ? esc(t("common.yes")) : esc(t("common.no"))}</td></tr>
    <tr><th>${esc(t("report.elapsed"))}</th><td>${(result.elapsedMs / 1000).toFixed(2)} s${result.stoppedEarly ? ` (${esc(t("report.stoppedEarly"))})` : ""}</td></tr>
  </table></section>`);

  parts.push(`<section><h2>${esc(t("explorer.assumptions"))}</h2><table><thead><tr><th>${esc(t("common.name"))}</th><th>${esc(t("common.cell"))}</th><th>${esc(t("assumption.distribution"))}</th><th>${esc(t("common.enabled"))}</th></tr></thead><tbody>
    ${model.assumptions.map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(`${a.cell.sheet}!${a.cell.address}`)}</td><td>${esc(describeSpec(a.distribution, locale))}</td><td>${a.enabled ? "✓" : "—"}</td></tr>`).join("")}
  </tbody></table>
  ${
    model.correlations.length
      ? `<h3>${esc(t("corr.title"))}</h3><table><tbody>${model.correlations.map((c) => `<tr><td>${esc(nameOf(c.a))}</td><td>${esc(nameOf(c.b))}</td><td class="num">${c.rho.toFixed(3)}</td></tr>`).join("")}</tbody></table>`
      : ""
  }</section>`);

  for (const f of model.forecasts) {
    const fr = result.forecasts[f.id];
    if (!fr) continue;
    const st = fr.stats;
    const kind = f.format;
    const fmt = (v: number) => esc(formatStat(v, locale, kind));
    const img = imgs.find((i) => i.forecastId === f.id);
    const sorted = sortedFinite(fr.values);
    const state = img?.state ?? defaultCertainty(sorted, "two", f.certainty ?? 0.9);
    const confidence = f.confidence ?? 0.95;
    const ci = meanConfidenceInterval(st, confidence);
    const pPos = certaintyFromBounds(sorted, "right", 0, Infinity);
    const sens = (result.sensitivity[f.id] ?? []).slice(0, 10);
    const certText =
      state.mode === "two"
        ? t("results.sentenceTwo", { pct: (state.certainty * 100).toFixed(2), lo: formatStat(state.lower, locale, kind), hi: formatStat(state.upper, locale, kind) })
        : state.mode === "left"
          ? t("results.sentenceLeft", { pct: (state.certainty * 100).toFixed(2), hi: formatStat(state.upper, locale, kind) })
          : t("results.sentenceRight", { pct: (state.certainty * 100).toFixed(2), lo: formatStat(state.lower, locale, kind) });
    parts.push(`<section class="forecast"><h2>${esc(t("defs.forecast"))}: ${esc(f.name)} <small>${esc(`${f.cell.sheet}!${f.cell.address}`)}</small></h2>
      ${img ? `<img src="${img.dataUrl}" alt="${esc(f.name)}"/>` : ""}
      <p class="cert">${esc(certText)}</p>
      <div class="cols">
        <table class="kv">
          <tr><th>${esc(t("stats.count"))}</th><td>${st.count.toLocaleString(locale)}</td></tr>
          <tr><th>${esc(t("stats.mean"))}</th><td>${fmt(st.mean)}</td></tr>
          <tr><th>${esc(t("stats.median"))}</th><td>${fmt(st.median)}</td></tr>
          <tr><th>${esc(t("stats.stdDev"))}</th><td>${fmt(st.stdDev)}</td></tr>
          <tr><th>${esc(t("stats.cv"))}</th><td>${Number.isFinite(st.cv) ? (st.cv * 100).toFixed(2) + "%" : "—"}</td></tr>
          <tr><th>${esc(t("stats.min"))}</th><td>${fmt(st.min)}</td></tr>
          <tr><th>${esc(t("stats.max"))}</th><td>${fmt(st.max)}</td></tr>
          <tr><th>${esc(t("stats.skewness"))}</th><td>${esc(formatStat(st.skewness, locale, "number", 4))}</td></tr>
          <tr><th>${esc(t("stats.kurtosis"))}</th><td>${esc(formatStat(st.kurtosis, locale, "number", 4))}</td></tr>
          <tr><th>${esc(t("stats.meanCI", { level: levelNumber(confidence, locale) }))}</th><td>[${fmt(ci[0])}; ${fmt(ci[1])}]</td></tr>
          <tr><th>${esc(t("stats.probPositive"))}</th><td>${(pPos * 100).toFixed(2)}%</td></tr>
        </table>
        <table class="kv">
          ${[5, 10, 25, 50, 75, 90, 95].map((p) => `<tr><th>P${p}</th><td>${fmt(st.percentiles[p])}</td></tr>`).join("")}
        </table>
      </div>
      ${
        sens.length
          ? `<h3>${esc(t("report.sensitivity"))}</h3><table><thead><tr><th>${esc(t("defs.assumption"))}</th><th class="num">${esc(t("report.rankCorr"))}</th><th class="num">${esc(t("report.contribution"))}</th><th></th></tr></thead><tbody>${sens
              .map(
                (e) =>
                  `<tr><td>${esc(nameOf(e.assumptionId))}</td><td class="num">${e.rankCorrelation.toFixed(3)}</td><td class="num">${(e.contributionToVariance * 100).toFixed(1)}%</td><td><div class="bar" style="width:${Math.round(e.contributionToVariance * 160)}px;background:${e.rankCorrelation < 0 ? "#dc2626" : "#1d4ed8"}"></div></td></tr>`,
              )
              .join("")}</tbody></table>`
          : ""
      }
    </section>`);
  }
  parts.push(`<footer>${esc(t("report.footer"))}</footer>`);

  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${esc(t("report.title"))} — ${esc(fileName)}</title>
<style>
  *{box-sizing:border-box} body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#0f172a;margin:24px;font-size:12px}
  header{border-bottom:3px solid #1f3864;margin-bottom:12px;padding-bottom:6px} h1{font-size:20px;margin:0;color:#1f3864} .meta{color:#475569}
  h2{font-size:15px;color:#1f3864;margin:18px 0 6px;border-bottom:1px solid #cbd5e1;padding-bottom:3px} h2 small{color:#64748b;font-weight:normal;font-size:11px}
  h3{font-size:13px;margin:10px 0 4px}
  table{border-collapse:collapse;width:100%;margin:4px 0} th,td{border:1px solid #e2e8f0;padding:3px 6px;text-align:left} thead th{background:#f1f5f9}
  table.kv{width:auto;min-width:260px} table.kv th{background:#f8fafc;font-weight:600;width:55%} table.kv td{text-align:right;font-variant-numeric:tabular-nums}
  td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
  .cols{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap} img{width:100%;max-width:760px;display:block;margin:4px auto}
  .cert{text-align:center;font-weight:600;background:#eff6ff;padding:4px;border-radius:4px}
  .bar{height:10px;border-radius:2px} section.forecast{page-break-inside:avoid;break-inside:avoid}
  footer{margin-top:24px;color:#64748b;font-size:10px;border-top:1px solid #e2e8f0;padding-top:6px}
  @media print{body{margin:10mm} section.forecast{page-break-before:auto}}
</style></head><body>${parts.join("\n")}</body></html>`;
}

/** Print HTML through a hidden iframe (the user can choose "Save as PDF"). */
export function printHtml(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  const win = iframe.contentWindow!;
  const go = () => {
    win.focus();
    win.print();
    setTimeout(() => iframe.remove(), 60_000);
  };
  const imgs = Array.from(doc.images);
  Promise.all(imgs.map((im) => (im.complete ? Promise.resolve() : new Promise((r) => ((im.onload = r), (im.onerror = r)))))).then(() => setTimeout(go, 100));
}

/** Open the HTML report in a new tab (alternative to printing). */
export function openHtmlInTab(html: string): boolean {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
  return !!w;
}

/**
 * Multiple linear regression (optionally stepwise) with coefficient table, ANOVA, VIF,
 * Durbin–Watson and residual plots.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Plus, Trash2 } from "lucide-react";
import { multipleRegression, stepwiseRegression, type RegressionResult } from "@openrisksim/forecast";
import { histogram } from "@openrisksim/engine";
import { Button, Chart, Field, Select, Table, Tabs } from "../../components/ui";
import { useToolsT } from "../common/i18n";
import { DataSourceInput, emptySource, resolveMatrix, type DataSourceState } from "../common/RangeInput";
import { Checkbox, ErrorNote, ExportButton, HelpBox, Note, NumField, Section, SplitLayout, StatGrid } from "../common/ui";
import { fmt, fmtAuto, fmtP, fmtPEq } from "../common/format";
import { histogramOption, scatterOption } from "../common/charts";
import { hstackColumns } from "../common/parse";
import { ToolError } from "../common/workbook";
import { levelNumber } from "../../lib/certainty";
import { ConfidenceLevels } from "./ConfidenceLevels";

type HeaderMode = "auto" | "yes" | "no";
type PlotTab = "resFit" | "actFit" | "resHist" | "resOrder";

interface Res {
  r: RegressionResult & { selected?: string[] };
  yName: string;
  xNames: string[];
  y: number[];
  dropped: number;
  stepwise: boolean;
}

export default function RegressionTool(_props: { onClose(): void }) {
  const { t, locale } = useToolsT();
  const [ySrc, setYSrc] = useState<DataSourceState>(emptySource());
  const [xSrcs, setXSrcs] = useState<DataSourceState[]>([emptySource()]);
  const [header, setHeader] = useState<HeaderMode>("auto");
  const [intercept, setIntercept] = useState(true);
  const [stepwise, setStepwise] = useState(false);
  const [pEnter, setPEnter] = useState(0.05);
  const [pRemove, setPRemove] = useState(0.1);
  const [confidence, setConfidence] = useState(0.95);
  const [res, setRes] = useState<Res | null>(null);
  const [tab, setTab] = useState<PlotTab>("resFit");
  const [error, setError] = useState<unknown>(null);

  const run = () => {
    setError(null);
    try {
      const mats = [resolveMatrix(ySrc), ...xSrcs.map(resolveMatrix)];
      const hm = header === "auto" ? "auto" : header === "yes";
      const cols = hstackColumns(mats, hm, ["Y", ...xSrcs.map(() => "X")]);
      const yWidth = mats[0].length ? Math.max(...mats[0].map((r) => r.length)) : 0;
      if (yWidth !== 1) throw new ToolError("regression.errors.yOneColumn");
      const y = cols.columns[0];
      const xCols = cols.columns.slice(1);
      const xNames = cols.names.slice(1);
      if (!xCols.length) throw new ToolError("regression.errors.noX");
      const n = y.length;
      const k = xCols.length + (intercept ? 1 : 0);
      if (n <= k + 1) throw new ToolError("regression.errors.tooFew", { n, k });
      const X = y.map((_, i) => xCols.map((c) => c[i]));
      const r = stepwise ? stepwiseRegression(y, X, xNames, { pEnter, pRemove, confidence }) : multipleRegression(y, X, xNames, { intercept, confidence });
      setRes({ r, yName: cols.names[0], xNames, y, dropped: cols.dropped, stepwise });
    } catch (e) {
      setRes(null);
      setError(e);
    }
  };

  // Changing the confidence level after a run re-estimates with the same inputs.
  const firstConf = useRef(true);
  useEffect(() => {
    if (firstConf.current) {
      firstConf.current = false;
      return;
    }
    if (res) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confidence]);

  const r = res?.r;
  const lvl = levelNumber(r?.confidenceLevel ?? confidence, locale);
  const coefName = (n: string) => (n === "Intercept" ? t("regression.interceptName") : n);
  // VIF array is per regressor (no intercept)
  const vifFor = (i: number): number | null => {
    if (!r) return null;
    const offset = r.coefficients.length - r.vif.length;
    const j = i - offset;
    return j >= 0 && j < r.vif.length ? r.vif[j] : null;
  };

  const equation = useMemo(() => {
    if (!r || !res) return "";
    const parts = r.coefficients.map((c, i) => {
      const v = fmt(Math.abs(c.value), 4, locale);
      const isIntercept = i === 0 && r.coefficients.length > r.vif.length;
      const sign = c.value < 0 ? "−" : i === 0 ? "" : "+";
      return `${sign} ${v}${isIntercept ? "" : ` · ${c.name}`}`.trim();
    });
    return `${res.yName} = ${parts.join(" ")}`;
  }, [r, res, locale]);

  const plot = useMemo(() => {
    if (!r || !res) return null;
    const pts = (xs: number[], ys: number[]): [number, number][] => xs.map((x, i) => [x, ys[i]] as [number, number]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
    switch (tab) {
      case "resFit":
        return scatterOption({ points: pts(r.fitted, r.residuals), name: t("regression.residuals"), xName: t("regression.fitted"), yName: t("regression.residuals"), locale, zeroLine: true });
      case "actFit":
        return scatterOption({ points: pts(r.fitted, res.y), name: t("regression.actual"), xName: t("regression.fitted"), yName: t("regression.actual"), locale, diagonal: true });
      case "resOrder":
        return scatterOption({ points: pts(r.residuals.map((_, i) => i + 1), r.residuals), name: t("regression.residuals"), xName: t("regression.observation"), yName: t("regression.residuals"), locale, zeroLine: true });
      case "resHist": {
        const h = histogram(r.residuals.filter(Number.isFinite), "auto");
        return histogramOption({ bins: h.map((b) => ({ from: b.from, to: b.to, value: b.frequency })), barName: t("regression.residuals"), xName: t("regression.residuals"), yName: t("common.frequency"), yPercent: true, locale });
      }
    }
  }, [r, res, tab, locale, t]);

  const significant = r ? r.coefficients.filter((c, i) => c.pValue < 0.05 && !(i === 0 && r.coefficients.length > r.vif.length)) : [];
  const highVif = r ? r.vif.some((v) => v > 10) : false;
  const dw = r?.durbinWatson ?? NaN;

  const form = (
    <>
      <DataSourceInput value={ySrc} onChange={setYSrc} label={t("regression.y")} rows={4} />
      {xSrcs.map((s, i) => (
        <div key={i} className="relative">
          <DataSourceInput value={s} onChange={(v) => setXSrcs(xSrcs.map((x, j) => (j === i ? v : x)))} label={t("regression.x", { n: i + 1 })} rows={4} matrix />
          {xSrcs.length > 1 && (
            <button type="button" className="absolute right-0 top-0 p-1 text-slate-500 hover:text-red-600" aria-label={t("common.remove")} onClick={() => setXSrcs(xSrcs.filter((_, j) => j !== i))}>
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
      <Button size="sm" onClick={() => setXSrcs([...xSrcs, emptySource()])}>
        <Plus size={14} />
        {t("regression.addX")}
      </Button>
      <Field label={t("regression.header")}>
        <Select
          value={header}
          onChange={setHeader}
          options={[
            { value: "auto", label: t("regression.headerAuto") },
            { value: "yes", label: t("common.yes") },
            { value: "no", label: t("common.no") },
          ]}
        />
      </Field>
      <Checkbox checked={intercept} onChange={setIntercept} label={t("regression.intercept")} />
      <Checkbox checked={stepwise} onChange={setStepwise} label={t("regression.stepwise")} />
      {stepwise && (
        <div className="grid grid-cols-2 gap-2">
          <NumField label={t("regression.pEnter")} value={pEnter} min={0.001} max={0.5} onChange={setPEnter} />
          <NumField label={t("regression.pRemove")} value={pRemove} min={0.001} max={0.5} onChange={setPRemove} />
        </div>
      )}
      <ConfidenceLevels single value={[confidence]} onChange={(l) => setConfidence(l[0] ?? 0.95)} hint={t("regression.confidenceHint")} />
      <Button variant="primary" onClick={run}>
        <Play size={14} />
        {t("regression.run")}
      </Button>
      <ErrorNote error={error} />
    </>
  );

  return (
    <div>
      <HelpBox>
        <p>{t("regression.help1")}</p>
        <p>{t("regression.help2")}</p>
      </HelpBox>
      <SplitLayout form={form}>
        {!r || !res ? (
          <Note>{t("regression.empty")}</Note>
        ) : (
          <>
            <div className="rounded-md bg-slate-100 px-3 py-2 font-mono text-sm dark:bg-slate-800">{equation}</div>
            {res.dropped > 0 && <Note tone="warn">{t("regression.dropped", { n: res.dropped })}</Note>}
            {res.stepwise && r.selected && <Note>{t("regression.selected", { vars: r.selected.join(", ") || "—" })}</Note>}
            <StatGrid
              items={[
                { label: "R²", value: fmt(r.r2, 4, locale) },
                { label: t("regression.adjR2"), value: fmt(r.adjR2, 4, locale) },
                { label: t("regression.fStat"), value: fmt(r.fStatistic, 3, locale), hint: fmtPEq(r.fPValue, locale) },
                { label: t("regression.se"), value: fmtAuto(r.standardError, locale) },
                { label: "Durbin–Watson", value: fmt(dw, 3, locale) },
                { label: "n", value: fmt(r.n, 0, locale) },
              ]}
            />
            <Note tone={r.fPValue < 0.05 ? "good" : "warn"}>
              <p>{t("regression.interpR2", { r2: fmt(r.r2 * 100, 1, locale) })}</p>
              <p>{r.fPValue < 0.05 ? t("regression.fSig", { p: fmtPEq(r.fPValue, locale) }) : t("regression.fNotSig", { p: fmtPEq(r.fPValue, locale) })}</p>
              {significant.map((c) => (
                <p key={c.name}>
                  {t("regression.interpCoef", { name: c.name, y: res.yName, b: fmtAuto(Math.abs(c.value), locale), dir: c.value >= 0 ? t("regression.increases") : t("regression.decreases") })}{" "}
                  {t("regression.interpCi", { level: lvl, name: c.name, lo: fmtAuto(c.ci[0], locale), hi: fmtAuto(c.ci[1], locale) })}
                </p>
              ))}
              <p>{dw < 1.5 || dw > 2.5 ? t("regression.dwBad") : t("regression.dwOk")}</p>
              {highVif && <p>{t("regression.vifBad")}</p>}
            </Note>
            <Section
              title={t("regression.coefficients")}
              actions={
                <ExportButton
                  sheetName={t("regression.sheetName")}
                  build={() => [
                    [equation],
                    [],
                    [t("regression.variable"), t("regression.coef"), t("regression.stdError"), "t", t("regression.pValue"), t("regression.ciLowLevel", { level: lvl }), t("regression.ciHighLevel", { level: lvl }), "VIF"],
                    ...r.coefficients.map((c, i) => [coefName(c.name), c.value, c.stdError, c.t, c.pValue, c.ci[0], c.ci[1], vifFor(i)]),
                    [],
                    ["R²", r.r2],
                    [t("regression.adjR2"), r.adjR2],
                    [t("regression.fStat"), r.fStatistic],
                    ["p (F)", r.fPValue],
                    [t("regression.se"), r.standardError],
                    ["Durbin–Watson", r.durbinWatson],
                    ["n", r.n],
                    [],
                    [t("regression.observation"), t("regression.actual"), t("regression.fitted"), t("regression.residuals")],
                    ...res.y.map((v, i) => [i + 1, v, r.fitted[i], r.residuals[i]]),
                  ]}
                />
              }
            >
              <Table
                columns={[
                  { key: "name", label: t("regression.variable") },
                  { key: "value", label: t("regression.coef"), align: "right", format: (v) => fmtAuto(v as number, locale) },
                  { key: "se", label: t("regression.stdError"), align: "right", format: (v) => fmtAuto(v as number, locale) },
                  { key: "t", label: "t", align: "right", format: (v) => fmt(v as number, 3, locale) },
                  { key: "p", label: t("regression.pValue"), align: "right", format: (v) => `${fmtP(v as number, locale)}${(v as number) < 0.05 ? " *" : ""}` },
                  { key: "ci", label: t("regression.ciLevel", { level: lvl }), align: "right" },
                  { key: "vif", label: "VIF", align: "right", format: (v) => (v == null ? "—" : `${fmt(v as number, 2, locale)}${(v as number) > 10 ? " ⚠" : ""}`) },
                ]}
                rows={r.coefficients.map((c, i) => ({
                  name: coefName(c.name),
                  value: c.value,
                  se: c.stdError,
                  t: c.t,
                  p: c.pValue,
                  ci: `[${fmtAuto(c.ci[0], locale)} ; ${fmtAuto(c.ci[1], locale)}]`,
                  vif: vifFor(i),
                }))}
              />
              <p className="text-xs text-slate-500">{t("regression.pHint")}</p>
            </Section>
            <Section title={t("regression.anova")}>
              <Table
                columns={[
                  { key: "src", label: t("regression.source") },
                  { key: "ss", label: t("regression.ss"), align: "right" },
                  { key: "df", label: t("regression.dfCol"), align: "right" },
                  { key: "ms", label: t("regression.ms"), align: "right" },
                  { key: "f", label: "F", align: "right" },
                  { key: "p", label: t("regression.pValue"), align: "right" },
                ]}
                rows={[
                  {
                    src: t("regression.regressionRow"),
                    ss: fmtAuto(r.anova.regressionSS, locale),
                    df: r.anova.dfReg,
                    ms: fmtAuto(r.anova.regressionSS / r.anova.dfReg, locale),
                    f: fmt(r.fStatistic, 3, locale),
                    p: fmtP(r.fPValue, locale),
                  },
                  { src: t("regression.residualRow"), ss: fmtAuto(r.anova.residualSS, locale), df: r.anova.dfRes, ms: fmtAuto(r.anova.residualSS / r.anova.dfRes, locale), f: "", p: "" },
                  { src: t("regression.totalRow"), ss: fmtAuto(r.anova.totalSS, locale), df: r.anova.dfReg + r.anova.dfRes, ms: "", f: "", p: "" },
                ]}
              />
            </Section>
            <Section title={t("regression.residualPlots")}>
              <Tabs
                tabs={[
                  { id: "resFit" as PlotTab, label: t("regression.plotResFit") },
                  { id: "actFit" as PlotTab, label: t("regression.plotActFit") },
                  { id: "resOrder" as PlotTab, label: t("regression.plotResOrder") },
                  { id: "resHist" as PlotTab, label: t("regression.plotResHist") },
                ]}
                value={tab}
                onChange={setTab}
              />
              {plot && <Chart option={plot} height={300} />}
              <p className="text-xs text-slate-500">{t("regression.residualHint")}</p>
            </Section>
          </>
        )}
      </SplitLayout>
    </div>
  );
}

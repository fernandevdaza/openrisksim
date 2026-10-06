/**
 * Time-series forecasting: smoothing, Holt–Winters, ARIMA, trend lines, automatic selection,
 * plus ACF/PACF, decomposition and stationarity diagnostics.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, LoaderCircle } from "lucide-react";
import {
  autoForecast,
  movingAverage,
  simpleExponentialSmoothing,
  holt,
  holtWinters,
  arima,
  autoArima,
  trendForecast,
  acf,
  pacf,
  decompose,
  ljungBox,
  adfTest,
  seasonalityTest,
  type ForecastOutput,
} from "@openrisksim/forecast";
import { Button, Chart, Field, Select, Table, Tabs } from "../../components/ui";
import { useToolsT } from "../common/i18n";
import { DataSourceInput, emptySource, resolveDataSource, type DataSourceState } from "../common/RangeInput";
import { ErrorNote, ExportButton, HelpBox, Note, NumField, Section, SplitLayout, StatGrid } from "../common/ui";
import { fmt, fmtAuto, fmtPEq, fmtPct } from "../common/format";
import { correlogramOption, forecastBandOption, lineOption } from "../common/charts";
import { ToolError } from "../common/workbook";
import { levelNumber } from "../../lib/certainty";
import { ConfidenceLevels } from "./ConfidenceLevels";

type Method = "auto" | "ma" | "ses" | "holt" | "damped" | "hwAdd" | "hwMult" | "arima" | "autoArima" | "trend";
type TrendKind = "linear" | "exponential" | "logarithmic" | "power" | "polynomial2" | "polynomial3";
type ResultTab = "forecast" | "acf" | "decomp" | "diag";
const METHODS: Method[] = ["auto", "ma", "ses", "holt", "damped", "hwAdd", "hwMult", "arima", "autoArima", "trend"];
const TRENDS: TrendKind[] = ["linear", "exponential", "logarithmic", "power", "polynomial2", "polynomial3"];

interface Res {
  y: number[];
  out: ForecastOutput;
  ranking: { method: string; rmse: number; aic?: number }[] | null;
  period: number;
  /** Confidence levels the intervals were computed for (ascending). */
  levels: number[];
}

export default function TimeSeriesTool(_props: { onClose(): void }) {
  const { t, locale } = useToolsT();
  const [source, setSource] = useState<DataSourceState>(emptySource());
  const [method, setMethod] = useState<Method>("auto");
  const [h, setH] = useState(6);
  const [period, setPeriod] = useState(12);
  const [windowSize, setWindow] = useState(3);
  const [order, setOrder] = useState({ p: 1, d: 1, q: 1 });
  const [trend, setTrend] = useState<TrendKind>("linear");
  const [levels, setLevels] = useState<number[]>([0.8, 0.95]);
  const [res, setRes] = useState<Res | null>(null);
  const [tab, setTab] = useState<ResultTab>("forecast");
  const [error, setError] = useState<unknown>(null);

  const seasonal = method === "hwAdd" || method === "hwMult";

  const [running, setRunning] = useState(false);
  const run = () => {
    setError(null);
    setRunning(true);
    // let the UI paint the spinner first: auto-ARIMA / auto selection may take a moment
    setTimeout(() => {
      compute();
      setRunning(false);
    }, 30);
  };

  const compute = () => {
    try {
      const y = resolveDataSource(source, 4);
      const H = Math.max(1, Math.min(500, Math.round(h)));
      const P = Math.max(1, Math.round(period));
      if (seasonal && y.length < 2 * P) throw new ToolError("timeSeries.errors.season", { n: 2 * P });
      if (method === "hwMult" && y.some((v) => v <= 0)) throw new ToolError("timeSeries.errors.positive");
      let out: ForecastOutput;
      let ranking: Res["ranking"] = null;
      const lv = { levels };
      switch (method) {
        case "auto": {
          const r = autoForecast(y, H, P > 1 ? P : undefined, lv);
          out = r.best;
          ranking = r.ranking;
          break;
        }
        case "ma":
          out = movingAverage(y, H, Math.max(1, Math.round(windowSize)), lv);
          break;
        case "ses":
          out = simpleExponentialSmoothing(y, H, undefined, lv);
          break;
        case "holt":
          out = holt(y, H, lv);
          break;
        case "damped":
          out = holt(y, H, { damped: true, ...lv });
          break;
        case "hwAdd":
          out = holtWinters(y, H, P, { seasonal: "additive", ...lv });
          break;
        case "hwMult":
          out = holtWinters(y, H, P, { seasonal: "multiplicative", ...lv });
          break;
        case "arima":
          out = arima(y, H, { p: Math.round(order.p), d: Math.round(order.d), q: Math.round(order.q) }, lv);
          break;
        case "autoArima":
          out = autoArima(y, H, lv);
          break;
        case "trend":
          out = trendForecast(y, H, trend, lv);
          break;
      }
      setRes({ y, out, ranking, period: P, levels: out.intervals.map((i) => i.level) });
    } catch (e) {
      setRes(null);
      setError(e);
    }
  };

  // Changing the confidence levels after a run recomputes the intervals with the same inputs.
  const firstLevels = useRef(true);
  useEffect(() => {
    if (firstLevels.current) {
      firstLevels.current = false;
      return;
    }
    if (res) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels]);

  const lvl = (level: number) => levelNumber(level, locale);

  const fcChart = useMemo(() => {
    if (!res) return null;
    const o = res.out;
    return forecastBandOption({
      actual: res.y,
      fitted: o.fitted,
      forecast: o.forecast,
      bands: o.intervals.map((iv) => ({ ...iv, label: t("timeSeries.bandLevel", { level: levelNumber(iv.level, locale) }) })),
      labels: { actual: t("timeSeries.actual"), fitted: t("timeSeries.fitted"), forecast: t("timeSeries.forecast"), period: t("timeSeries.period") },
      locale,
    });
  }, [res, locale, t]);

  const diag = useMemo(() => {
    if (!res) return null;
    const n = res.y.length;
    const maxLag = Math.max(1, Math.min(24, Math.floor(n / 2) - 1));
    const strip = (v: number[]) => (v.length === maxLag + 1 ? v.slice(1) : v);
    const safe = <T,>(f: () => T): T | null => {
      try {
        return f();
      } catch {
        return null;
      }
    };
    const resid = res.out.residuals.filter((v) => Number.isFinite(v));
    return {
      acf: safe(() => strip(acf(res.y, maxLag))),
      pacf: safe(() => strip(pacf(res.y, maxLag))),
      adf: safe(() => adfTest(res.y)),
      lb: resid.length > 5 ? safe(() => ljungBox(resid, Math.max(1, Math.min(10, Math.floor(resid.length / 5))))) : null,
      seas: safe(() => seasonalityTest(res.y).slice(0, 5)),
      decomp: res.period > 1 && n >= 2 * res.period ? safe(() => decompose(res.y, res.period, res.y.every((v) => v > 0) && method === "hwMult" ? "multiplicative" : "additive")) : null,
    };
  }, [res, method]);

  const m = res?.out.metrics;
  const methodLabel = (x: string) => {
    if (x.startsWith("trend:")) return `${t("timeSeries.methodKeys.trend")} (${t(`timeSeries.trends.${x.slice(6)}`, { defaultValue: x.slice(6) })})`;
    const ar = /^arima\((\d+),(\d+),(\d+)\)$/.exec(x);
    if (ar) return `ARIMA(${ar[1]},${ar[2]},${ar[3]})`;
    if (x === "arima" && res?.out.method === "arima") {
      const p = res.out.params;
      if (p.p !== undefined) return `ARIMA(${p.p},${p.d},${p.q})`;
    }
    return t(`timeSeries.methodKeys.${x}`, { defaultValue: x });
  };

  const form = (
    <>
      <DataSourceInput value={source} onChange={setSource} label={t("timeSeries.series")} />
      <Field label={t("timeSeries.method")}>
        <Select value={method} onChange={setMethod} options={METHODS.map((x) => ({ value: x, label: t(`timeSeries.methods.${x}`) }))} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <NumField label={t("timeSeries.horizon")} value={h} min={1} max={500} onChange={setH} />
        <NumField label={t("timeSeries.seasonPeriod")} value={period} min={1} max={366} onChange={setPeriod} hint={t("timeSeries.seasonHint")} />
      </div>
      {method === "ma" && <NumField label={t("timeSeries.window")} value={windowSize} min={1} onChange={setWindow} />}
      {method === "arima" && (
        <div className="grid grid-cols-3 gap-2">
          <NumField label="p" value={order.p} min={0} max={5} onChange={(p) => setOrder({ ...order, p })} />
          <NumField label="d" value={order.d} min={0} max={2} onChange={(d) => setOrder({ ...order, d })} />
          <NumField label="q" value={order.q} min={0} max={5} onChange={(q) => setOrder({ ...order, q })} />
        </div>
      )}
      {method === "trend" && (
        <Field label={t("timeSeries.trendKind")}>
          <Select value={trend} onChange={setTrend} options={TRENDS.map((x) => ({ value: x, label: t(`timeSeries.trends.${x}`) }))} />
        </Field>
      )}
      <ConfidenceLevels value={levels} onChange={setLevels} max={3} />
      <Button variant="primary" onClick={run} disabled={running}>
        {running ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={14} />}
        {running ? t("common.computing") : t("timeSeries.run")}
      </Button>
      <ErrorNote error={error} />
    </>
  );

  return (
    <div>
      <HelpBox>
        <p>{t("timeSeries.help1")}</p>
        <p>{t("timeSeries.help2")}</p>
      </HelpBox>
      <SplitLayout form={form}>
        {!res ? (
          <Note>{t("timeSeries.empty")}</Note>
        ) : (
          <>
            <Tabs
              tabs={[
                { id: "forecast" as ResultTab, label: t("timeSeries.tabForecast") },
                { id: "acf" as ResultTab, label: t("timeSeries.tabAcf") },
                { id: "decomp" as ResultTab, label: t("timeSeries.tabDecomp") },
                { id: "diag" as ResultTab, label: t("timeSeries.tabDiag") },
              ]}
              value={tab}
              onChange={setTab}
            />
            {tab === "forecast" && (
              <>
                <Section
                  title={t("timeSeries.chartTitle", { method: methodLabel(res.out.method) })}
                  actions={
                    <ExportButton
                      sheetName={t("timeSeries.sheetName")}
                      build={() => {
                        const o = res.out;
                        // outer → inner lower bounds, then inner → outer upper bounds
                        const lowers = [...o.intervals].reverse();
                        const uppers = o.intervals;
                        const rows: (number | string | null)[][] = [
                          [t("timeSeries.chartTitle", { method: methodLabel(o.method) })],
                          [
                            t("timeSeries.period"),
                            t("timeSeries.actual"),
                            t("timeSeries.fitted"),
                            t("timeSeries.forecast"),
                            ...lowers.map((iv) => t("timeSeries.lowerLevel", { level: lvl(iv.level) })),
                            ...uppers.map((iv) => t("timeSeries.upperLevel", { level: lvl(iv.level) })),
                          ],
                        ];
                        const blanks = o.intervals.map(() => null);
                        res.y.forEach((v, i) => rows.push([i + 1, v, Number.isFinite(o.fitted[i]) ? o.fitted[i] : null, null, ...blanks, ...blanks]));
                        o.forecast.forEach((v, i) => rows.push([res.y.length + i + 1, null, null, v, ...lowers.map((iv) => iv.lower[i]), ...uppers.map((iv) => iv.upper[i])]));
                        return rows;
                      }}
                    />
                  }
                >
                  {fcChart && <Chart option={fcChart} height={360} />}
                </Section>
                {m && (
                  <StatGrid
                    cols={5}
                    items={[
                      { label: "RMSE", value: fmtAuto(m.rmse, locale) },
                      { label: "MAE", value: fmtAuto(m.mae, locale) },
                      { label: "MAPE", value: fmtPct(m.mape, 2, locale) },
                      { label: "R²", value: fmt(m.r2, 4, locale) },
                      { label: t("timeSeries.theilU"), value: fmt(m.theilU, 3, locale) },
                    ]}
                  />
                )}
                {res.out.forecast.length > 0 && (
                  <Note tone="good">
                    {res.out.intervals.map((iv) => (
                      <p key={iv.level}>
                        {t("timeSeries.interpretInterval", {
                          level: lvl(iv.level),
                          period: res.y.length + 1,
                          lo: fmtAuto(iv.lower[0], locale),
                          hi: fmtAuto(iv.upper[0], locale),
                        })}
                      </p>
                    ))}
                    {res.out.forecast.length > 1 && res.out.intervals.length > 0 && (
                      <p>
                        {t("timeSeries.interpretWiden", {
                          level: lvl(res.out.intervals[res.out.intervals.length - 1].level),
                          period: res.y.length + res.out.forecast.length,
                          lo: fmtAuto(res.out.intervals[res.out.intervals.length - 1].lower[res.out.forecast.length - 1], locale),
                          hi: fmtAuto(res.out.intervals[res.out.intervals.length - 1].upper[res.out.forecast.length - 1], locale),
                        })}
                      </p>
                    )}
                  </Note>
                )}
                <Note>
                  <p>{t("timeSeries.interpretMetrics")}</p>
                  {m && Number.isFinite(m.theilU) && <p>{m.theilU < 1 ? t("timeSeries.theilGood") : t("timeSeries.theilBad")}</p>}
                </Note>
                <Section title={t("timeSeries.forecastTable")}>
                  <Table
                    maxHeight={260}
                    columns={[
                      { key: "t", label: t("timeSeries.period"), align: "right" },
                      ...[...res.out.intervals].reverse().map((iv, j) => ({ key: `l${j}`, label: t("timeSeries.lowShort", { level: lvl(iv.level) }), align: "right" as const })),
                      { key: "f", label: t("timeSeries.forecast"), align: "right" },
                      ...res.out.intervals.map((iv, j) => ({ key: `u${j}`, label: t("timeSeries.highShort", { level: lvl(iv.level) }), align: "right" as const })),
                    ]}
                    rows={res.out.forecast.map((f, i) => {
                      const row: Record<string, string | number> = { t: res.y.length + i + 1, f: fmtAuto(f, locale) };
                      [...res.out.intervals].reverse().forEach((iv, j) => (row[`l${j}`] = fmtAuto(iv.lower[i], locale)));
                      res.out.intervals.forEach((iv, j) => (row[`u${j}`] = fmtAuto(iv.upper[i], locale)));
                      return row;
                    })}
                  />
                </Section>
                <Section title={t("timeSeries.params")}>
                  <div className="grid items-start gap-4 md:grid-cols-2">
                    <Table
                      columns={[
                        { key: "k", label: t("timeSeries.param") },
                        { key: "v", label: t("common.value"), align: "right" },
                      ]}
                      rows={Object.entries(res.out.params).map(([k, v]) => ({ k, v: fmtAuto(v, locale) }))}
                    />
                    {m && (
                      <Table
                        columns={[
                          { key: "k", label: t("timeSeries.metric") },
                          { key: "v", label: t("common.value"), align: "right" },
                        ]}
                        rows={[
                          { k: "MSE", v: fmtAuto(m.mse, locale) },
                          { k: "sMAPE", v: fmtPct(m.smape, 2, locale) },
                          { k: "AIC", v: m.aic !== undefined ? fmt(m.aic, 2, locale) : "—" },
                          { k: "BIC", v: m.bic !== undefined ? fmt(m.bic, 2, locale) : "—" },
                        ]}
                      />
                    )}
                  </div>
                </Section>
                {res.ranking && (
                  <Section title={t("timeSeries.ranking")}>
                    <Table
                      columns={[
                        { key: "i", label: "#", align: "right" },
                        { key: "method", label: t("timeSeries.method") },
                        { key: "rmse", label: "RMSE", align: "right" },
                        { key: "aic", label: "AIC", align: "right" },
                      ]}
                      rows={res.ranking.map((r, i) => ({ i: i + 1, method: methodLabel(r.method), rmse: fmtAuto(r.rmse, locale), aic: r.aic !== undefined ? fmt(r.aic, 2, locale) : "—" }))}
                    />
                  </Section>
                )}
              </>
            )}
            {tab === "acf" && diag && (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  {diag.acf && <Chart option={correlogramOption({ values: diag.acf, n: res.y.length, name: "ACF", lagLabel: t("timeSeries.lag"), locale, title: t("timeSeries.acfTitle") })} height={260} />}
                  {diag.pacf && <Chart option={correlogramOption({ values: diag.pacf, n: res.y.length, name: "PACF", lagLabel: t("timeSeries.lag"), locale, title: t("timeSeries.pacfTitle") })} height={260} />}
                </div>
                <Note>{t("timeSeries.acfHint")}</Note>
              </>
            )}
            {tab === "decomp" &&
              (diag?.decomp ? (
                <div className="space-y-1">
                  {(
                    [
                      ["observed", res.y],
                      ["trend", diag.decomp.trend],
                      ["seasonal", diag.decomp.seasonal],
                      ["residual", diag.decomp.residual],
                    ] as [string, number[]][]
                  ).map(([k, arr], i) => (
                    <Chart
                      key={k}
                      height={150}
                      option={lineOption({
                        x: arr.map((_, j) => String(j + 1)),
                        series: [{ name: t(`timeSeries.decomp.${k}`), data: arr.map((v) => (Number.isFinite(v) ? v : null)), colorIndex: i }],
                        locale,
                        compact: true,
                        title: t(`timeSeries.decomp.${k}`),
                      })}
                    />
                  ))}
                  <Note>{t("timeSeries.decompHint")}</Note>
                </div>
              ) : (
                <Note tone="warn">{t("timeSeries.decompNeed", { n: 2 * res.period })}</Note>
              ))}
            {tab === "diag" && diag && (
              <div className="space-y-3">
                {diag.adf && (
                  <Note tone={diag.adf.stationary ? "good" : "warn"}>
                    <p>
                      <strong>{t("timeSeries.adf")}</strong>: {fmt(diag.adf.statistic, 3, locale)} · {fmtPEq(diag.adf.pValue, locale)}
                    </p>
                    <p>{diag.adf.stationary ? t("timeSeries.adfStationary") : t("timeSeries.adfNonStationary")}</p>
                  </Note>
                )}
                {diag.lb && (
                  <Note tone={diag.lb.pValue >= 0.05 ? "good" : "warn"}>
                    <p>
                      <strong>{t("timeSeries.ljungBox")}</strong>: Q = {fmt(diag.lb.q, 3, locale)} · {fmtPEq(diag.lb.pValue, locale)}
                    </p>
                    <p>{diag.lb.pValue >= 0.05 ? t("timeSeries.lbOk") : t("timeSeries.lbBad")}</p>
                  </Note>
                )}
                {diag.seas && diag.seas.length > 0 && (
                  <Section title={t("timeSeries.seasonality")}>
                    <Table
                      columns={[
                        { key: "period", label: t("timeSeries.seasonPeriod"), align: "right" },
                        { key: "strength", label: t("timeSeries.strength"), align: "right" },
                      ]}
                      rows={diag.seas.map((s) => ({ period: s.period, strength: fmt(s.strength, 3, locale) }))}
                    />
                    <p className="text-xs text-slate-500">{t("timeSeries.seasonalityHint")}</p>
                  </Section>
                )}
              </div>
            )}
          </>
        )}
      </SplitLayout>
    </div>
  );
}

/**
 * Stochastic processes: geometric Brownian motion, mean reversion (Ornstein–Uhlenbeck) and
 * jump diffusion (Merton). Parameters can be estimated from a historical price series.
 */
import { useMemo, useState } from "react";
import { Play, Sigma } from "lucide-react";
import { geometricBrownianMotion, meanReversion, jumpDiffusion, estimateGbm } from "@openrisksim/forecast";
import { Button, Chart, Field, Select, Table } from "../../components/ui";
import { useToolsT } from "../common/i18n";
import { DataSourceInput, emptySource, resolveDataSource, type DataSourceState } from "../common/RangeInput";
import { ErrorNote, ExportButton, HelpBox, Note, NumField, PctField, Section, SplitLayout } from "../common/ui";
import { fmt, fmtAuto, fmtPct } from "../common/format";
import { fanChartOption } from "../common/charts";
import { estimateMeanReversion, pathPercentiles } from "../common/stats";
import { ToolError } from "../common/workbook";

type Process = "gbm" | "meanReversion" | "jump";
const PS = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95];

interface Params {
  s0: number;
  drift: number;
  volatility: number;
  longRunMean: number;
  speed: number;
  jumpRate: number;
  jumpMean: number;
  jumpStdDev: number;
  dt: number;
  steps: number;
  paths: number;
  seed: number;
}

export default function StochasticProcessTool(_props: { onClose(): void }) {
  const { t, locale } = useToolsT();
  const [proc, setProc] = useState<Process>("gbm");
  const [p, setP] = useState<Params>({
    s0: 100,
    drift: 0.08,
    volatility: 0.25,
    longRunMean: 100,
    speed: 1.5,
    jumpRate: 1,
    jumpMean: -0.05,
    jumpStdDev: 0.1,
    dt: 1 / 12,
    steps: 36,
    paths: 1000,
    seed: 12345,
  });
  const [source, setSource] = useState<DataSourceState>(emptySource());
  const [estDt, setEstDt] = useState(1 / 12);
  const [estMsg, setEstMsg] = useState<string | null>(null);
  const [paths, setPaths] = useState<number[][] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const set = (patch: Partial<Params>) => setP({ ...p, ...patch });

  const estimate = () => {
    setError(null);
    setEstMsg(null);
    try {
      const prices = resolveDataSource(source, 5);
      const last = prices[prices.length - 1];
      if (proc === "meanReversion") {
        const est = estimateMeanReversion(prices, estDt);
        if (!est) throw new ToolError("stochastic.errors.noReversion");
        set({ ...est, s0: last, dt: estDt });
        setEstMsg(t("stochastic.estimatedMr", { mean: fmtAuto(est.longRunMean, locale), speed: fmt(est.speed, 3, locale), vol: fmtAuto(est.volatility, locale) }));
      } else {
        if (prices.some((v) => v <= 0)) throw new ToolError("stochastic.errors.positive");
        const est = estimateGbm(prices, estDt);
        set({ drift: est.drift, volatility: est.volatility, s0: last, dt: estDt });
        setEstMsg(t("stochastic.estimatedGbm", { drift: fmtPct(est.drift, 2, locale), vol: fmtPct(est.volatility, 2, locale) }));
      }
    } catch (e) {
      setError(e);
    }
  };

  const run = () => {
    setError(null);
    try {
      const common = { s0: p.s0, dt: p.dt, steps: Math.max(1, Math.round(p.steps)), paths: Math.max(10, Math.min(20000, Math.round(p.paths))), seed: p.seed };
      if (!(p.dt > 0)) throw new ToolError("stochastic.errors.dt");
      const out =
        proc === "gbm"
          ? geometricBrownianMotion({ ...common, drift: p.drift, volatility: p.volatility })
          : proc === "meanReversion"
            ? meanReversion({ ...common, longRunMean: p.longRunMean, speed: p.speed, volatility: p.volatility })
            : jumpDiffusion({ ...common, drift: p.drift, volatility: p.volatility, jumpRate: p.jumpRate, jumpMean: p.jumpMean, jumpStdDev: p.jumpStdDev });
      setPaths(out);
    } catch (e) {
      setPaths(null);
      setError(e);
    }
  };

  const pct = useMemo(() => (paths ? pathPercentiles(paths, PS) : null), [paths]);
  const xLabels = useMemo(() => (paths ? paths[0].map((_, i) => fmt(i * p.dt, 3, locale)) : []), [paths, p.dt, locale]);

  const chart = useMemo(() => {
    if (!paths || !pct) return null;
    return fanChartOption({
      x: xLabels,
      bands: [
        { lower: pct[0], upper: pct[6], label: t("stochastic.band90") },
        { lower: pct[1], upper: pct[5], label: t("stochastic.band80") },
        { lower: pct[2], upper: pct[4], label: t("stochastic.band50") },
      ],
      median: pct[3],
      samplePaths: paths.slice(0, 8),
      labels: { median: t("stochastic.median"), paths: t("stochastic.samplePaths"), time: t("stochastic.time"), value: t("common.value") },
      locale,
    });
  }, [paths, pct, xLabels, locale, t]);

  const finalStats = pct ? PS.map((q, i) => ({ q, v: pct[i][pct[i].length - 1] })) : [];
  const finalMean = paths ? paths.reduce((a, path) => a + path[path.length - 1], 0) / paths.length : NaN;

  const form = (
    <>
      <Field label={t("stochastic.process")}>
        <Select
          value={proc}
          onChange={setProc}
          options={[
            { value: "gbm", label: t("stochastic.gbm") },
            { value: "meanReversion", label: t("stochastic.meanReversion") },
            { value: "jump", label: t("stochastic.jump") },
          ]}
        />
      </Field>
      <NumField label={t("stochastic.s0")} value={p.s0} onChange={(s0) => set({ s0 })} />
      {proc !== "meanReversion" && <PctField label={t("stochastic.drift")} value={p.drift} onChange={(drift) => set({ drift })} hint={t("stochastic.annualHint")} />}
      {proc === "meanReversion" ? (
        <>
          <NumField label={t("stochastic.longRunMean")} value={p.longRunMean} onChange={(longRunMean) => set({ longRunMean })} />
          <NumField label={t("stochastic.speed")} value={p.speed} min={0} onChange={(speed) => set({ speed })} hint={t("stochastic.speedHint")} />
          <NumField label={t("stochastic.volAbs")} value={p.volatility} min={0} onChange={(volatility) => set({ volatility })} />
        </>
      ) : (
        <PctField label={t("stochastic.volatility")} value={p.volatility} onChange={(volatility) => set({ volatility })} hint={t("stochastic.annualHint")} />
      )}
      {proc === "jump" && (
        <div className="grid grid-cols-3 gap-2">
          <NumField label={t("stochastic.jumpRate")} value={p.jumpRate} min={0} onChange={(jumpRate) => set({ jumpRate })} />
          <PctField label={t("stochastic.jumpMean")} value={p.jumpMean} onChange={(jumpMean) => set({ jumpMean })} />
          <PctField label={t("stochastic.jumpStdDev")} value={p.jumpStdDev} onChange={(jumpStdDev) => set({ jumpStdDev })} />
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <NumField label={t("stochastic.dt")} value={p.dt} min={0.0001} onChange={(dt) => set({ dt })} hint={t("stochastic.dtHint")} />
        <NumField label={t("stochastic.steps")} value={p.steps} min={1} max={5000} onChange={(steps) => set({ steps })} />
        <NumField label={t("stochastic.paths")} value={p.paths} min={10} max={20000} onChange={(paths) => set({ paths })} />
      </div>
      <NumField label={t("common.seed")} value={p.seed} onChange={(seed) => set({ seed })} />
      <Button variant="primary" onClick={run}>
        <Play size={14} />
        {t("stochastic.run")}
      </Button>
      <details className="rounded-md border border-slate-200 p-2 text-sm dark:border-slate-700">
        <summary className="cursor-pointer font-medium">{t("stochastic.estimateTitle")}</summary>
        <div className="mt-2 space-y-2">
          <DataSourceInput value={source} onChange={setSource} label={t("stochastic.priceSeries")} rows={4} />
          <NumField label={t("stochastic.dataDt")} value={estDt} min={0.0001} onChange={setEstDt} hint={t("stochastic.dtHint")} />
          <Button size="sm" onClick={estimate}>
            <Sigma size={14} />
            {t("stochastic.estimate")}
          </Button>
          {estMsg && <Note tone="good">{estMsg}</Note>}
        </div>
      </details>
      <ErrorNote error={error} />
    </>
  );

  return (
    <div>
      <HelpBox>
        <p>{t("stochastic.help1")}</p>
        <p>{t(`stochastic.helpProc.${proc}`)}</p>
      </HelpBox>
      <SplitLayout form={form}>
        {!paths || !pct ? (
          <Note>{t("stochastic.empty")}</Note>
        ) : (
          <>
            <Section
              title={t("stochastic.chartTitle", { n: paths.length })}
              actions={
                <ExportButton
                  sheetName={t("stochastic.sheetName")}
                  build={() => [
                    [t("stochastic.time"), ...PS.map((q) => `P${Math.round(q * 100)}`)],
                    ...pct[0].map((_, k) => [k * p.dt, ...PS.map((__, i) => pct[i][k])]),
                  ]}
                />
              }
            >
              {chart && <Chart option={chart} height={380} />}
            </Section>
            <Note>
              {t("stochastic.interpretation", {
                horizon: fmt(p.steps * p.dt, 2, locale),
                p5: fmtAuto(finalStats[0]?.v, locale),
                p95: fmtAuto(finalStats[6]?.v, locale),
                median: fmtAuto(finalStats[3]?.v, locale),
              })}
            </Note>
            <Section title={t("stochastic.finalTitle")}>
              <Table
                columns={[
                  { key: "k", label: t("descriptive.statistic") },
                  { key: "v", label: t("common.value"), align: "right" },
                ]}
                rows={[{ k: t("common.mean"), v: fmtAuto(finalMean, locale) }, ...finalStats.map((s) => ({ k: `${t("common.percentile")} ${Math.round(s.q * 100)}`, v: fmtAuto(s.v, locale) }))]}
              />
            </Section>
          </>
        )}
      </SplitLayout>
    </div>
  );
}

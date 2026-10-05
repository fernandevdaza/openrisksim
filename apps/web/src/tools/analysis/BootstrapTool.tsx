/**
 * Nonparametric bootstrap: distribution and confidence interval of a statistic.
 */
import { useMemo, useState } from "react";
import { Play } from "lucide-react";
import { bootstrap, histogram } from "@openrisksim/engine";
import { createRng } from "@openrisksim/distributions";
import { Button, Chart, Field, Select } from "../../components/ui";
import { useToolsT } from "../common/i18n";
import { DataSourceInput, emptySource, resolveDataSource, type DataSourceState } from "../common/RangeInput";
import { ErrorNote, ExportButton, HelpBox, Note, NumField, Section, SplitLayout, StatGrid } from "../common/ui";
import { fmt, fmtAuto, fmtPct } from "../common/format";
import { histogramOption } from "../common/charts";
import { BOOTSTRAP_STATISTICS, percentileInterval, statisticFn, stdDev, type BootstrapStatistic } from "../common/stats";

interface Res {
  stat: BootstrapStatistic;
  estimate: number;
  ci: [number, number];
  confidence: number;
  samples: Float64Array;
  se: number;
  n: number;
}

export default function BootstrapTool(_props: { onClose(): void }) {
  const { t, locale } = useToolsT();
  const [source, setSource] = useState<DataSourceState>(emptySource("forecast"));
  const [stat, setStat] = useState<BootstrapStatistic>("mean");
  const [resamples, setResamples] = useState(2000);
  const [confidence, setConfidence] = useState("0.95");
  const [seed, setSeed] = useState(12345);
  const [res, setRes] = useState<Res | null>(null);
  const [error, setError] = useState<unknown>(null);

  const run = () => {
    setError(null);
    try {
      const values = resolveDataSource(source, 5);
      const r = bootstrap(values, statisticFn(stat), Math.max(100, Math.min(20000, Math.round(resamples))), createRng(seed));
      const conf = Number(confidence);
      const ci = conf === 0.95 ? r.ci95 : percentileInterval(r.samples, conf);
      setRes({ stat, estimate: r.estimate, ci, confidence: conf, samples: r.samples, se: stdDev(r.samples), n: values.length });
    } catch (e) {
      setRes(null);
      setError(e);
    }
  };

  const chart = useMemo(() => {
    if (!res) return null;
    const h = histogram(res.samples, "auto");
    return histogramOption({
      bins: h.map((b) => ({ from: b.from, to: b.to, value: b.frequency })),
      barName: t("bootstrap.distribution"),
      xName: t(`bootstrap.stats.${res.stat}`),
      yName: t("common.frequency"),
      yPercent: true,
      locale,
      markers: [
        { value: res.ci[0], label: fmtAuto(res.ci[0], locale) },
        { value: res.estimate, label: t("bootstrap.estimate") },
        { value: res.ci[1], label: fmtAuto(res.ci[1], locale) },
      ],
    });
  }, [res, locale, t]);

  const form = (
    <>
      <DataSourceInput value={source} onChange={setSource} allowForecast label={t("common.data")} />
      <Field label={t("bootstrap.statistic")}>
        <Select value={stat} onChange={setStat} options={BOOTSTRAP_STATISTICS.map((s) => ({ value: s, label: t(`bootstrap.stats.${s}`) }))} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <NumField label={t("bootstrap.resamples")} value={resamples} min={100} max={20000} onChange={setResamples} />
        <Field label={t("bootstrap.confidence")}>
          <Select
            value={confidence}
            onChange={setConfidence}
            options={[
              { value: "0.9", label: "90 %" },
              { value: "0.95", label: "95 %" },
              { value: "0.99", label: "99 %" },
            ]}
          />
        </Field>
      </div>
      <NumField label={t("common.seed")} value={seed} onChange={setSeed} />
      <Button variant="primary" onClick={run}>
        <Play size={14} />
        {t("common.calculate")}
      </Button>
      <ErrorNote error={error} />
    </>
  );

  return (
    <div>
      <HelpBox>
        <p>{t("bootstrap.help1")}</p>
        <p>{t("bootstrap.help2")}</p>
      </HelpBox>
      <SplitLayout form={form}>
        {!res ? (
          <Note>{t("bootstrap.empty")}</Note>
        ) : (
          <>
            <StatGrid
              items={[
                { label: t("bootstrap.estimate"), value: fmtAuto(res.estimate, locale) },
                { label: t("bootstrap.ciLabel", { c: fmtPct(res.confidence, 0, locale) }), value: `[${fmtAuto(res.ci[0], locale)} ; ${fmtAuto(res.ci[1], locale)}]` },
                { label: t("bootstrap.se"), value: fmtAuto(res.se, locale) },
                { label: t("bootstrap.n"), value: fmt(res.n, 0, locale) },
              ]}
            />
            <Note>
              {t("bootstrap.interpretation", {
                c: fmtPct(res.confidence, 0, locale),
                stat: t(`bootstrap.stats.${res.stat}`).toLowerCase(),
                lo: fmtAuto(res.ci[0], locale),
                hi: fmtAuto(res.ci[1], locale),
              })}
            </Note>
            <Section
              title={t("bootstrap.chartTitle")}
              actions={
                <ExportButton
                  sheetName={t("bootstrap.sheetName")}
                  build={() => [
                    [t("bootstrap.statistic"), t(`bootstrap.stats.${res.stat}`)],
                    [t("bootstrap.estimate"), res.estimate],
                    [t("bootstrap.ciLabel", { c: fmtPct(res.confidence, 0, locale) }), res.ci[0], res.ci[1]],
                    [t("bootstrap.se"), res.se],
                    [],
                    [t("bootstrap.samplesHeader")],
                    ...Array.from(res.samples, (v) => [v]),
                  ]}
                />
              }
            >
              {chart && <Chart option={chart} height={320} />}
            </Section>
          </>
        )}
      </SplitLayout>
    </div>
  );
}

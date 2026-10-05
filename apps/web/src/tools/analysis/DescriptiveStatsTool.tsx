/**
 * Descriptive statistics of a data range: summary table, percentiles, histogram and empirical CDF.
 */
import { useMemo, useState } from "react";
import { Play } from "lucide-react";
import { describe, histogram, empiricalCdf } from "@openrisksim/engine";
import type { DescriptiveStats } from "@openrisksim/core";
import { Button, Chart, Table, Tabs } from "../../components/ui";
import { useModelStore } from "../../store/model";
import { useToolsT } from "../common/i18n";
import { DataSourceInput, emptySource, resolveDataSource, sourceLabel, type DataSourceState } from "../common/RangeInput";
import { ErrorNote, ExportButton, HelpBox, Note, Section, SplitLayout } from "../common/ui";
import { fmt, fmtAuto, fmtPct } from "../common/format";
import { histogramOption, lineOption } from "../common/charts";

type ChartTab = "hist" | "cdf";
const PCTS = [1, 5, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 95, 99];

export default function DescriptiveStatsTool(_props: { onClose(): void }) {
  const { t, locale } = useToolsT();
  const forecasts = useModelStore((s) => s.model.forecasts);
  const [source, setSource] = useState<DataSourceState>(emptySource());
  const [data, setData] = useState<number[] | null>(null);
  const [stats, setStats] = useState<DescriptiveStats | null>(null);
  const [label, setLabel] = useState("");
  const [tab, setTab] = useState<ChartTab>("hist");
  const [error, setError] = useState<unknown>(null);

  const run = () => {
    setError(null);
    try {
      const values = resolveDataSource(source, 2);
      setData(values);
      setStats(describe(values));
      setLabel(sourceLabel(source, (id) => forecasts.find((f) => f.id === id)?.name));
    } catch (e) {
      setData(null);
      setStats(null);
      setError(e);
    }
  };

  const histChart = useMemo(() => {
    if (!data || !stats) return null;
    const h = histogram(data, "auto");
    return histogramOption({
      bins: h.map((b) => ({ from: b.from, to: b.to, value: b.frequency })),
      barName: t("common.frequency"),
      xName: label || t("common.value"),
      yName: t("common.frequency"),
      yPercent: true,
      locale,
      markers: [{ value: stats.mean, label: t("common.mean") }],
    });
  }, [data, stats, label, locale, t]);

  const cdfChart = useMemo(() => {
    if (!data) return null;
    const c = empiricalCdf(data, 300);
    return lineOption({ xType: "value", series: [{ name: t("common.cumulativeProbability"), data: c.p, x: c.x }], xName: label || t("common.value"), yName: t("common.cumulativeProbability"), yPercent: true, locale });
  }, [data, label, locale, t]);

  const rows: { key: string; value: number; fmt?: "pct" | "int" }[] = stats
    ? [
        { key: "count", value: stats.count, fmt: "int" },
        { key: "mean", value: stats.mean },
        { key: "median", value: stats.median },
        { key: "mode", value: stats.mode },
        { key: "stdDev", value: stats.stdDev },
        { key: "variance", value: stats.variance },
        { key: "cv", value: stats.cv, fmt: "pct" },
        { key: "min", value: stats.min },
        { key: "max", value: stats.max },
        { key: "range", value: stats.range },
        { key: "skewness", value: stats.skewness },
        { key: "kurtosis", value: stats.kurtosis },
        { key: "stdErrorMean", value: stats.stdErrorMean },
        { key: "ciLow", value: stats.meanCI95[0] },
        { key: "ciHigh", value: stats.meanCI95[1] },
      ]
    : [];
  const fmtRow = (r: { value: number; fmt?: "pct" | "int" }) => (r.fmt === "pct" ? fmtPct(r.value, 2, locale) : r.fmt === "int" ? fmt(r.value, 0, locale) : fmtAuto(r.value, locale));

  const skewHint = (s: number) => (Math.abs(s) < 0.5 ? t("descriptive.skewSym") : s > 0 ? t("descriptive.skewRight") : t("descriptive.skewLeft"));
  const kurtHint = (k: number) => (Math.abs(k) < 0.5 ? t("descriptive.kurtNormal") : k > 0 ? t("descriptive.kurtFat") : t("descriptive.kurtThin"));

  const form = (
    <>
      <DataSourceInput value={source} onChange={setSource} allowForecast label={t("common.data")} />
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
        <p>{t("descriptive.help1")}</p>
      </HelpBox>
      <SplitLayout form={form}>
        {!stats ? (
          <Note>{t("descriptive.empty")}</Note>
        ) : (
          <>
            <Tabs
              tabs={[
                { id: "hist" as ChartTab, label: t("descriptive.histogram") },
                { id: "cdf" as ChartTab, label: t("descriptive.cdf") },
              ]}
              value={tab}
              onChange={setTab}
            />
            {tab === "hist" && histChart && <Chart option={histChart} height={300} />}
            {tab === "cdf" && cdfChart && <Chart option={cdfChart} height={300} />}
            <Note>
              <p>{t("descriptive.interpCenter", { mean: fmtAuto(stats.mean, locale), median: fmtAuto(stats.median, locale), sd: fmtAuto(stats.stdDev, locale) })}</p>
              <p>
                {skewHint(stats.skewness)} {kurtHint(stats.kurtosis)}
              </p>
              <p>{t("descriptive.interpCi", { lo: fmtAuto(stats.meanCI95[0], locale), hi: fmtAuto(stats.meanCI95[1], locale) })}</p>
            </Note>
            <div className="grid gap-4 md:grid-cols-2">
              <Section
                title={t("descriptive.summary")}
                actions={
                  <ExportButton
                    sheetName={t("descriptive.sheetName")}
                    build={() => [
                      [t("descriptive.summary"), label],
                      ...rows.map((r) => [t(`descriptive.stats.${r.key}`), r.value]),
                      [],
                      [t("common.percentile"), t("common.value")],
                      ...PCTS.map((p) => [p / 100, stats.percentiles[p] ?? null]),
                    ]}
                  />
                }
              >
                <Table
                  columns={[
                    { key: "label", label: t("descriptive.statistic") },
                    { key: "value", label: t("common.value"), align: "right" },
                  ]}
                  rows={rows.map((r) => ({ label: t(`descriptive.stats.${r.key}`), value: fmtRow(r) }))}
                />
              </Section>
              <Section title={t("descriptive.percentiles")}>
                <Table
                  columns={[
                    { key: "p", label: t("common.percentile"), align: "right" },
                    { key: "v", label: t("common.value"), align: "right" },
                  ]}
                  rows={PCTS.map((p) => ({ p: `${p} %`, v: fmtAuto(stats.percentiles[p], locale) }))}
                />
              </Section>
            </div>
          </>
        )}
      </SplitLayout>
    </div>
  );
}

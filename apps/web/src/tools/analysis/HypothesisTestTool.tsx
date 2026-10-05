/**
 * Two-sample hypothesis test (Welch t-test) on forecasts or data ranges.
 */
import { useMemo, useState } from "react";
import { Play } from "lucide-react";
import { describe, tTestTwoSample, empiricalCdf } from "@openrisksim/engine";
import { studentTQuantile } from "@openrisksim/distributions";
import type { DescriptiveStats } from "@openrisksim/core";
import { Button, Chart, Field, Select, Table } from "../../components/ui";
import { useModelStore } from "../../store/model";
import { useToolsT } from "../common/i18n";
import { DataSourceInput, emptySource, resolveDataSource, sourceLabel, type DataSourceState } from "../common/RangeInput";
import { ErrorNote, HelpBox, Note, Section, SplitLayout, StatGrid } from "../common/ui";
import { fmt, fmtAuto, fmtP, fmtPEq, fmtPct } from "../common/format";
import { lineOption } from "../common/charts";
import { welchInterval } from "../common/stats";

type Alt = "two" | "greater" | "less";

interface Res {
  a: DescriptiveStats;
  b: DescriptiveStats;
  nameA: string;
  nameB: string;
  t: number;
  df: number;
  pTwo: number;
  p: number;
  alt: Alt;
  alpha: number;
  ci: { diff: number; lower: number; upper: number };
  cdfA: { x: number[]; p: number[] };
  cdfB: { x: number[]; p: number[] };
}

export default function HypothesisTestTool(_props: { onClose(): void }) {
  const { t, locale } = useToolsT();
  const forecasts = useModelStore((s) => s.model.forecasts);
  const [srcA, setSrcA] = useState<DataSourceState>(emptySource("forecast"));
  const [srcB, setSrcB] = useState<DataSourceState>(emptySource("forecast"));
  const [alpha, setAlpha] = useState("0.05");
  const [alt, setAlt] = useState<Alt>("two");
  const [res, setRes] = useState<Res | null>(null);
  const [error, setError] = useState<unknown>(null);
  const fName = (id: string) => forecasts.find((f) => f.id === id)?.name;

  const run = () => {
    setError(null);
    try {
      const a = resolveDataSource(srcA, 3);
      const b = resolveDataSource(srcB, 3);
      const tt = tTestTwoSample(a, b);
      const da = describe(a);
      const db = describe(b);
      // one-sided p-values from the two-sided one and the sign of t
      const half = tt.pValue / 2;
      const p = alt === "two" ? tt.pValue : alt === "greater" ? (tt.t > 0 ? half : 1 - half) : tt.t < 0 ? half : 1 - half;
      const conf = 1 - Number(alpha);
      const ci = welchInterval(
        { mean: da.mean, variance: da.variance, n: da.count },
        { mean: db.mean, variance: db.variance, n: db.count },
        conf,
        studentTQuantile,
      );
      setRes({
        a: da,
        b: db,
        nameA: sourceLabel(srcA, fName) || "A",
        nameB: sourceLabel(srcB, fName) || "B",
        t: tt.t,
        df: tt.df,
        pTwo: tt.pValue,
        p,
        alt,
        alpha: Number(alpha),
        ci,
        cdfA: empiricalCdf(a, 200),
        cdfB: empiricalCdf(b, 200),
      });
    } catch (e) {
      setRes(null);
      setError(e);
    }
  };

  const chart = useMemo(() => {
    if (!res) return null;
    return lineOption({
      xType: "value",
      series: [
        { name: `A: ${res.nameA}`, data: res.cdfA.p, x: res.cdfA.x },
        { name: `B: ${res.nameB}`, data: res.cdfB.p, x: res.cdfB.x },
      ],
      xName: t("common.value"),
      yName: t("common.cumulativeProbability"),
      yPercent: true,
      locale,
    });
  }, [res, locale, t]);

  const significant = res ? res.p < res.alpha : false;
  const altText = (x: Alt) => t(`hypothesis.alt.${x}`);

  const form = (
    <>
      <DataSourceInput value={srcA} onChange={setSrcA} allowForecast label={t("hypothesis.sampleA")} rows={4} />
      <DataSourceInput value={srcB} onChange={setSrcB} allowForecast label={t("hypothesis.sampleB")} rows={4} />
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("hypothesis.alpha")}>
          <Select
            value={alpha}
            onChange={setAlpha}
            options={[
              { value: "0.01", label: "1 %" },
              { value: "0.05", label: "5 %" },
              { value: "0.1", label: "10 %" },
            ]}
          />
        </Field>
        <Field label={t("hypothesis.alternative")}>
          <Select value={alt} onChange={setAlt} options={(["two", "greater", "less"] as Alt[]).map((x) => ({ value: x, label: altText(x) }))} />
        </Field>
      </div>
      <Button variant="primary" onClick={run}>
        <Play size={14} />
        {t("hypothesis.run")}
      </Button>
      <ErrorNote error={error} />
    </>
  );

  return (
    <div>
      <HelpBox>
        <p>{t("hypothesis.help1")}</p>
        <p>{t("hypothesis.help2")}</p>
      </HelpBox>
      <SplitLayout form={form}>
        {!res ? (
          <Note>{t("hypothesis.empty")}</Note>
        ) : (
          <>
            <StatGrid
              items={[
                { label: t("hypothesis.tStat"), value: fmt(res.t, 4, locale) },
                { label: t("hypothesis.df"), value: fmt(res.df, 1, locale) },
                { label: t("hypothesis.pValue"), value: fmtP(res.p, locale), hint: altText(res.alt) },
                {
                  label: t("hypothesis.ciDiff", { c: fmtPct(1 - res.alpha, 0, locale) }),
                  value: `[${fmtAuto(res.ci.lower, locale)} ; ${fmtAuto(res.ci.upper, locale)}]`,
                },
              ]}
            />
            <Note tone={significant ? "good" : "info"}>
              <p>
                <strong>{significant ? t("hypothesis.reject") : t("hypothesis.noReject")}</strong>
              </p>
              <p>
                {t(significant ? `hypothesis.meaningReject.${res.alt}` : "hypothesis.meaningNoReject", {
                  p: fmtPEq(res.p, locale),
                  alpha: fmt(res.alpha, 2, locale),
                  a: res.nameA,
                  b: res.nameB,
                })}
              </p>
              <p className="text-xs">{t("hypothesis.ruleOfThumb")}</p>
            </Note>
            <Section title={t("hypothesis.groups")}>
              <Table
                columns={[
                  { key: "name", label: t("hypothesis.sample") },
                  { key: "n", label: "n", align: "right", format: (v) => fmt(v as number, 0, locale) },
                  { key: "mean", label: t("common.mean"), align: "right", format: (v) => fmtAuto(v as number, locale) },
                  { key: "sd", label: t("common.stdDev"), align: "right", format: (v) => fmtAuto(v as number, locale) },
                  { key: "median", label: t("common.median"), align: "right", format: (v) => fmtAuto(v as number, locale) },
                ]}
                rows={[
                  { name: `A: ${res.nameA}`, n: res.a.count, mean: res.a.mean, sd: res.a.stdDev, median: res.a.median },
                  { name: `B: ${res.nameB}`, n: res.b.count, mean: res.b.mean, sd: res.b.stdDev, median: res.b.median },
                  { name: t("hypothesis.difference"), n: NaN, mean: res.ci.diff, sd: NaN, median: res.a.median - res.b.median },
                ]}
              />
            </Section>
            <Section title={t("hypothesis.cdfTitle")}>{chart && <Chart option={chart} height={300} />}</Section>
          </>
        )}
      </SplitLayout>
    </div>
  );
}

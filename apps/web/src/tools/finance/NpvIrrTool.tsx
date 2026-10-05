/**
 * NPV / IRR calculator for an arbitrary cash-flow series.
 */
import { useMemo, useState } from "react";
import { Play } from "lucide-react";
import { npv, irr, allIrrs, mirr, paybackPeriod, discountedPaybackPeriod, profitabilityIndex, equivalentAnnualAnnuity } from "@openrisksim/finance";
import { Button, Chart, Table } from "../../components/ui";
import { useToolsT } from "../common/i18n";
import { DataSourceInput, resolveDataSource, type DataSourceState } from "../common/RangeInput";
import { ErrorNote, ExportButton, HelpBox, Note, PctField, Section, SplitLayout, StatGrid } from "../common/ui";
import { fmt, fmtPct, fmtPeriods } from "../common/format";
import { columnOption, npvProfileOption } from "../common/charts";
import { npvProfile, profileRates } from "../common/stats";

interface Res {
  cf: number[];
  rate: number;
  npv: number;
  irr: number;
  irrs: number[];
  mirr: number;
  payback: number;
  dpayback: number;
  pi: number;
  eaa: number;
}

export default function NpvIrrTool(_props: { onClose(): void }) {
  const { t, locale } = useToolsT();
  const [source, setSource] = useState<DataSourceState>({ mode: "paste", range: "", text: "-1000\n300\n400\n500\n200", forecastId: "" });
  const [rate, setRate] = useState(0.1);
  const [finRate, setFinRate] = useState(0.1);
  const [reinvRate, setReinvRate] = useState(0.1);
  const [res, setRes] = useState<Res | null>(null);
  const [error, setError] = useState<unknown>(null);

  const run = () => {
    setError(null);
    try {
      const cf = resolveDataSource(source, 2);
      const irrs = allIrrs(cf);
      setRes({
        cf,
        rate,
        npv: npv(rate, cf),
        irr: irr(cf),
        irrs,
        mirr: mirr(cf, finRate, reinvRate),
        payback: paybackPeriod(cf),
        dpayback: discountedPaybackPeriod(rate, cf),
        pi: profitabilityIndex(rate, cf),
        eaa: equivalentAnnualAnnuity(rate, cf),
      });
    } catch (e) {
      setRes(null);
      setError(e);
    }
  };

  const profileChart = useMemo(() => {
    if (!res) return null;
    return npvProfileOption({
      points: npvProfile(res.cf, profileRates(res.irrs.length ? res.irrs : [res.irr], res.rate), npv),
      irrs: res.irrs.length ? res.irrs : [res.irr],
      discountRate: res.rate,
      labels: { npv: t("project.npv"), rate: t("project.rate"), irr: t("project.irr"), discount: t("project.discountRateShort") },
      locale,
    });
  }, [res, locale, t]);

  const cfChart = useMemo(() => {
    if (!res) return null;
    let cum = 0;
    let dcum = 0;
    const cumulative = res.cf.map((c) => (cum += c));
    const dcumulative = res.cf.map((c, i) => (dcum += c / Math.pow(1 + res.rate, i)));
    return columnOption({
      categories: res.cf.map((_, i) => i),
      series: [
        { name: t("npvIrr.flow"), data: res.cf },
        { name: t("npvIrr.cumulative"), data: cumulative },
        { name: t("npvIrr.discountedCumulative"), data: dcumulative },
      ],
      locale,
      xName: t("project.period"),
    });
  }, [res, locale, t]);

  const form = (
    <>
      <DataSourceInput value={source} onChange={setSource} label={t("npvIrr.flows")} rows={8} />
      <p className="text-xs text-slate-500">{t("npvIrr.flowsHint")}</p>
      <PctField label={t("npvIrr.rate")} value={rate} onChange={setRate} />
      <div className="grid grid-cols-2 gap-2">
        <PctField label={t("npvIrr.financeRate")} value={finRate} onChange={setFinRate} />
        <PctField label={t("npvIrr.reinvestRate")} value={reinvRate} onChange={setReinvRate} />
      </div>
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
        <p>{t("npvIrr.help1")}</p>
        <p>{t("npvIrr.help2")}</p>
      </HelpBox>
      <SplitLayout form={form}>
        {!res ? (
          <Note>{t("npvIrr.empty")}</Note>
        ) : (
          <>
            <StatGrid
              items={[
                { label: t("project.npv"), value: fmt(res.npv, 2, locale) },
                { label: t("project.irr"), value: fmtPct(res.irr, 2, locale) },
                { label: t("project.mirr"), value: fmtPct(res.mirr, 2, locale) },
                { label: t("project.pi"), value: fmt(res.pi, 3, locale) },
                { label: t("project.payback"), value: fmtPeriods(res.payback, locale) },
                { label: t("project.discountedPayback"), value: fmtPeriods(res.dpayback, locale) },
                { label: t("project.eaa"), value: fmt(res.eaa, 2, locale) },
              ]}
            />
            <Note tone={res.npv > 0 ? "good" : res.npv < 0 ? "bad" : "info"}>
              <p>
                <strong>{res.npv > 0 ? t("project.verdictAccept") : res.npv < 0 ? t("project.verdictReject") : t("project.verdictIndifferent")}</strong>
              </p>
              <p>{t("project.npvMeaning", { npv: fmt(res.npv, 2, locale), rate: fmtPct(res.rate, 1, locale) })}</p>
              {Number.isFinite(res.irr) ? <p>{t("project.irrMeaning", { irr: fmtPct(res.irr, 2, locale), rate: fmtPct(res.rate, 1, locale) })}</p> : <p>{t("npvIrr.noIrr")}</p>}
            </Note>
            {res.irrs.length > 1 && <Note tone="warn">{t("project.multipleIrr", { irrs: res.irrs.map((r) => fmtPct(r, 2, locale)).join(", ") })}</Note>}
            <div className="grid gap-4 xl:grid-cols-2">
              <Section title={t("project.profile")}>{profileChart && <Chart option={profileChart} height={280} />}</Section>
              <Section title={t("npvIrr.flowsChart")}>{cfChart && <Chart option={cfChart} height={280} />}</Section>
            </div>
            <Section
              title={t("common.table")}
              actions={
                <ExportButton
                  sheetName={t("npvIrr.sheetName")}
                  build={() => {
                    const rows: (number | string | null)[][] = [[t("project.period"), t("npvIrr.flow"), t("npvIrr.discountFactor"), t("npvIrr.presentValue")]];
                    res.cf.forEach((c, i) => rows.push([i, c, `=1/(1+$F$2)^A${i + 2}`, `=B${i + 2}*C${i + 2}`]));
                    const last = res.cf.length + 1;
                    rows[0].push(null, t("npvIrr.rate"));
                    rows[1].push(null, res.rate);
                    rows.push([], [t("project.npv"), `=SUM(D2:D${last})`], [t("project.irr"), `=IRR(B2:B${last})`], [t("project.mirr"), `=MIRR(B2:B${last},${finRate},${reinvRate})`]);
                    return rows;
                  }}
                />
              }
            >
              <Table
                maxHeight={260}
                columns={[
                  { key: "t", label: t("project.period"), align: "right" },
                  { key: "cf", label: t("npvIrr.flow"), align: "right" },
                  { key: "df", label: t("npvIrr.discountFactor"), align: "right" },
                  { key: "pv", label: t("npvIrr.presentValue"), align: "right" },
                ]}
                rows={res.cf.map((c, i) => {
                  const df = 1 / Math.pow(1 + res.rate, i);
                  return { t: i, cf: fmt(c, 2, locale), df: fmt(df, 4, locale, true), pv: fmt(c * df, 2, locale) };
                })}
              />
            </Section>
          </>
        )}
      </SplitLayout>
    </div>
  );
}

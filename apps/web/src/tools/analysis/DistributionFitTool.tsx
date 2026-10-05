/**
 * Distribution fitting: rank candidate distributions for a data set (KS, AD, χ², AIC, BIC),
 * show the histogram with the fitted density, P–P / Q–Q plots, and create an assumption from it.
 */
import { useMemo, useState } from "react";
import { Play, Plus } from "lucide-react";
import { fitDistributions, createDistribution, distributionCurve, type FitResult } from "@openrisksim/distributions";
import { histogram } from "@openrisksim/engine";
import { newId } from "@openrisksim/core";
import { Button, Chart, Field, Select, Tabs, clsx } from "../../components/ui";
import { useModelStore } from "../../store/model";
import { useWorkbookStore } from "../../store/workbook";
import { useToolsT } from "../common/i18n";
import { DataSourceInput, emptySource, resolveDataSource, type DataSourceState } from "../common/RangeInput";
import { ErrorNote, HelpBox, Note, Section, SplitLayout, ExportButton } from "../common/ui";
import { fmt, fmtP, fmtPEq } from "../common/format";
import { specLabel } from "../common/distLabel";
import { histogramOption, scatterOption } from "../common/charts";
import { probabilityPlotPoints } from "../common/stats";
import { ToolError } from "../common/workbook";

type RankBy = "aic" | "bic" | "ks" | "ad";
type Kind = "auto" | "continuous" | "discrete";
type PlotTab = "hist" | "pp" | "qq";

export default function DistributionFitTool(_props: { onClose(): void }) {
  const { t, locale } = useToolsT();
  const [source, setSource] = useState<DataSourceState>(emptySource());
  const [rankBy, setRankBy] = useState<RankBy>("aic");
  const [kind, setKind] = useState<Kind>("auto");
  const [data, setData] = useState<number[] | null>(null);
  const [fits, setFits] = useState<FitResult[]>([]);
  const [sel, setSel] = useState(0);
  const [tab, setTab] = useState<PlotTab>("hist");
  const [error, setError] = useState<unknown>(null);
  const [created, setCreated] = useState<string | null>(null);
  const selection = useWorkbookStore((s) => s.selection);
  const model = useModelStore((s) => s.model);

  const run = () => {
    setError(null);
    setCreated(null);
    try {
      const values = resolveDataSource(source, 5);
      const results = fitDistributions(values, { rankBy, discrete: kind === "auto" ? undefined : kind === "discrete" });
      if (!results.length) throw new ToolError("fit.errors.none");
      setData(values);
      setFits(results);
      setSel(0);
    } catch (e) {
      setFits([]);
      setData(null);
      setError(e);
    }
  };

  const chosen = fits[sel];
  const dist = useMemo(() => {
    if (!chosen) return null;
    try {
      return createDistribution(chosen.spec);
    } catch {
      return null;
    }
  }, [chosen]);

  const histChart = useMemo(() => {
    if (!data || !dist) return null;
    if (dist.kind === "discrete") {
      const lo = Math.floor(Math.min(...data));
      const hi = Math.ceil(Math.max(...data));
      if (hi - lo <= 200) {
        const counts = new Map<number, number>();
        for (const v of data) counts.set(Math.round(v), (counts.get(Math.round(v)) ?? 0) + 1);
        const bins = [];
        const xs: number[] = [];
        const ys: number[] = [];
        for (let k = lo; k <= hi; k++) {
          bins.push({ from: k - 0.45, to: k + 0.45, value: (counts.get(k) ?? 0) / data.length });
          xs.push(k);
          ys.push(dist.pdf(k));
        }
        return histogramOption({ bins, overlays: [{ name: t("fit.fitted"), x: xs, y: ys }], barName: t("fit.observed"), xName: t("common.value"), yName: t("fit.probability"), locale, yPercent: true });
      }
    }
    const h = histogram(data, "auto");
    const bins = h.map((b) => ({ from: b.from, to: b.to, value: b.to > b.from ? b.frequency / (b.to - b.from) : 0 }));
    const curve = distributionCurve(dist, 200);
    const lo = h[0]?.from ?? 0;
    const hi = h[h.length - 1]?.to ?? 1;
    const xs: number[] = [];
    const ys: number[] = [];
    curve.x.forEach((x, i) => {
      if (x >= lo && x <= hi && Number.isFinite(curve.pdf[i])) {
        xs.push(x);
        ys.push(curve.pdf[i]);
      }
    });
    return histogramOption({ bins, overlays: [{ name: t("fit.fitted"), x: xs, y: ys }], barName: t("fit.observed"), xName: t("common.value"), yName: t("fit.density"), locale });
  }, [data, dist, locale, t]);

  const probPlots = useMemo(() => (data && dist ? probabilityPlotPoints(data, (x) => dist.cdf(x), (p) => dist.quantile(p)) : null), [data, dist]);

  const createAssumption = () => {
    if (!chosen) return;
    const sel0 = useWorkbookStore.getState().selection;
    if (!sel0?.range) return;
    const address = sel0.range.split(":")[0].replace(/\$/g, "").toUpperCase();
    const cell = { sheet: sel0.sheet, address };
    const st = useModelStore.getState();
    const existing = st.model.assumptions.find((x) => x.cell.sheet === cell.sheet && x.cell.address === address);
    st.upsertAssumption({
      id: existing?.id ?? newId("as"),
      name: existing?.name ?? `${cell.sheet}!${address}`,
      cell,
      distribution: { ...chosen.spec, params: { ...chosen.spec.params } },
      enabled: true,
    });
    setCreated(t("fit.created", { cell: `${cell.sheet}!${address}`, dist: specLabel(chosen.spec, locale) }));
  };

  const targetCell = selection?.range ? `${selection.sheet}!${selection.range.split(":")[0]}` : null;
  const targetHasAssumption = targetCell ? model.assumptions.some((a) => `${a.cell.sheet}!${a.cell.address}` === targetCell) : false;

  const form = (
    <>
      <DataSourceInput value={source} onChange={setSource} allowForecast label={t("common.data")} />
      <Field label={t("fit.rankBy")}>
        <Select
          value={rankBy}
          onChange={setRankBy}
          options={[
            { value: "aic", label: "AIC" },
            { value: "bic", label: "BIC" },
            { value: "ks", label: "Kolmogorov–Smirnov" },
            { value: "ad", label: "Anderson–Darling" },
          ]}
        />
      </Field>
      <Field label={t("fit.kind")}>
        <Select
          value={kind}
          onChange={setKind}
          options={[
            { value: "auto", label: t("fit.kindAuto") },
            { value: "continuous", label: t("fit.kindContinuous") },
            { value: "discrete", label: t("fit.kindDiscrete") },
          ]}
        />
      </Field>
      <Button variant="primary" onClick={run}>
        <Play size={14} />
        {t("fit.run")}
      </Button>
      <ErrorNote error={error} />
    </>
  );

  return (
    <div>
      <HelpBox>
        <p>{t("fit.help1")}</p>
        <p>{t("fit.help2")}</p>
      </HelpBox>
      <SplitLayout form={form}>
        {!fits.length ? (
          <Note>{t("fit.empty")}</Note>
        ) : (
          <>
            <Section
              title={t("fit.ranking", { n: data?.length ?? 0 })}
              actions={
                <ExportButton
                  sheetName={t("fit.sheetName")}
                  build={() => [
                    [t("fit.rank"), t("fit.distribution"), "KS", "KS p", "AD", "AD p", "χ²", "χ² p", "AIC", "BIC"],
                    ...fits.map((f) => [
                      f.rank,
                      specLabel(f.spec, locale),
                      f.ks.statistic,
                      f.ks.pValue,
                      f.ad.statistic,
                      f.ad.pValue,
                      f.chiSquare?.statistic ?? null,
                      f.chiSquare?.pValue ?? null,
                      f.aic,
                      f.bic,
                    ]),
                  ]}
                />
              }
            >
              <div className="max-h-64 overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
                <table className="w-full border-collapse text-sm tabular-nums">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                    <tr>
                      <th className="px-2 py-1.5 text-left">#</th>
                      <th className="px-2 py-1.5 text-left">{t("fit.distribution")}</th>
                      <th className="px-2 py-1.5 text-right">KS</th>
                      <th className="px-2 py-1.5 text-right">{t("fit.pKs")}</th>
                      <th className="px-2 py-1.5 text-right">AD</th>
                      <th className="px-2 py-1.5 text-right">{t("fit.pAd")}</th>
                      <th className="px-2 py-1.5 text-right">χ²</th>
                      <th className="px-2 py-1.5 text-right">{t("fit.pChi")}</th>
                      <th className="px-2 py-1.5 text-right">AIC</th>
                      <th className="px-2 py-1.5 text-right">BIC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fits.map((f, i) => (
                      <tr
                        key={i}
                        onClick={() => setSel(i)}
                        aria-selected={i === sel}
                        className={clsx(
                          "cursor-pointer border-t border-slate-100 dark:border-slate-800",
                          i === sel ? "bg-blue-100 dark:bg-blue-900/50" : "hover:bg-slate-50 dark:hover:bg-slate-800/60",
                        )}
                      >
                        <td className="px-2 py-1">{f.rank}</td>
                        <td className="px-2 py-1 text-left">{specLabel(f.spec, locale)}</td>
                        <td className="px-2 py-1 text-right">{fmt(f.ks.statistic, 4, locale)}</td>
                        <td className="px-2 py-1 text-right">{fmtP(f.ks.pValue, locale)}</td>
                        <td className="px-2 py-1 text-right">{fmt(f.ad.statistic, 3, locale)}</td>
                        <td className="px-2 py-1 text-right">{fmtP(f.ad.pValue, locale)}</td>
                        <td className="px-2 py-1 text-right">{f.chiSquare ? fmt(f.chiSquare.statistic, 2, locale) : "—"}</td>
                        <td className="px-2 py-1 text-right">{f.chiSquare ? fmtP(f.chiSquare.pValue, locale) : "—"}</td>
                        <td className="px-2 py-1 text-right">{fmt(f.aic, 1, locale)}</td>
                        <td className="px-2 py-1 text-right">{fmt(f.bic, 1, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
            {chosen && (
              <>
                <Note tone={chosen.ks.pValue >= 0.05 ? "good" : "warn"}>
                  <p>
                    <strong>{specLabel(chosen.spec, locale)}</strong>
                  </p>
                  <p>{chosen.ks.pValue >= 0.05 ? t("fit.ksOk", { p: fmtPEq(chosen.ks.pValue, locale) }) : t("fit.ksBad", { p: fmtPEq(chosen.ks.pValue, locale) })}</p>
                  <p className="text-xs">{t("fit.criteriaHint")}</p>
                </Note>
                <Tabs
                  tabs={[
                    { id: "hist" as PlotTab, label: t("fit.histTab") },
                    { id: "pp" as PlotTab, label: "P–P" },
                    { id: "qq" as PlotTab, label: "Q–Q" },
                  ]}
                  value={tab}
                  onChange={setTab}
                />
                {tab === "hist" && histChart && <Chart option={histChart} height={320} />}
                {tab === "pp" && probPlots && (
                  <>
                    <Chart option={scatterOption({ points: probPlots.pp, name: "P–P", xName: t("fit.empiricalP"), yName: t("fit.theoreticalP"), locale, diagonal: true })} height={320} />
                    <p className="text-xs text-slate-500">{t("fit.ppHint")}</p>
                  </>
                )}
                {tab === "qq" && probPlots && (
                  <>
                    <Chart option={scatterOption({ points: probPlots.qq, name: "Q–Q", xName: t("fit.theoreticalQ"), yName: t("fit.empiricalQ"), locale, diagonal: true })} height={320} />
                    <p className="text-xs text-slate-500">{t("fit.qqHint")}</p>
                  </>
                )}
                <Section title={t("fit.createTitle")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="primary" onClick={createAssumption} disabled={!targetCell}>
                      <Plus size={14} />
                      {t("fit.createButton")}
                    </Button>
                    <span className="text-sm text-slate-600 dark:text-slate-300">
                      {targetCell ? t(targetHasAssumption ? "fit.targetReplace" : "fit.target", { cell: targetCell }) : t("fit.noTarget")}
                    </span>
                  </div>
                  {created && <Note tone="good">{created}</Note>}
                </Section>
              </>
            )}
          </>
        )}
      </SplitLayout>
    </div>
  );
}

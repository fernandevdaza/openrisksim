/**
 * Overlay chart: compare the simulated distributions of several forecasts (PDF or CDF).
 */
import { useMemo, useState } from "react";
import { empiricalCdf, describe } from "@openrisksim/engine";
import { Chart, Table, Tabs } from "../../components/ui";
import { useModelStore } from "../../store/model";
import { useSimulationStore } from "../../store/simulation";
import { useToolsT } from "../common/i18n";
import { Checkbox, HelpBox, Note, NumField, Section } from "../common/ui";
import { fmtAuto } from "../common/format";
import { lineOption, MAX_SERIES } from "../common/charts";
import { binFrequencies, commonEdges } from "../common/stats";

type Kind = "pdf" | "cdf";

export default function OverlayChartTool(_props: { onClose(): void }) {
  const { t, locale } = useToolsT();
  const forecasts = useModelStore((s) => s.model.forecasts);
  const result = useSimulationStore((s) => s.result);
  const available = forecasts.filter((f) => result?.forecasts[f.id]);
  const [selected, setSelected] = useState<string[]>(() => available.slice(0, 3).map((f) => f.id));
  const [kind, setKind] = useState<Kind>("pdf");
  const [bins, setBins] = useState(40);

  const chosen = available.filter((f) => selected.includes(f.id)).slice(0, MAX_SERIES);
  const data = chosen.map((f) => ({ f, values: result!.forecasts[f.id].values.filter((v) => Number.isFinite(v)) }));

  const option = useMemo(() => {
    if (!data.length) return null;
    if (kind === "pdf") {
      const edges = commonEdges(data.map((d) => d.values), Math.max(5, Math.min(200, Math.round(bins))));
      const mids = edges.slice(0, -1).map((e, i) => (e + edges[i + 1]) / 2);
      return lineOption({
        xType: "value",
        x: mids,
        series: data.map((d) => ({ name: d.f.name, data: binFrequencies(d.values, edges), area: true })),
        xName: t("common.value"),
        yName: t("common.frequency"),
        yPercent: true,
        locale,
      });
    }
    return lineOption({
      xType: "value",
      series: data.map((d) => {
        const c = empiricalCdf(d.values, 300);
        return { name: d.f.name, data: c.p, x: c.x };
      }),
      xName: t("common.value"),
      yName: t("common.cumulativeProbability"),
      yPercent: true,
      locale,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, kind, bins, result, locale]);

  const toggle = (id: string, on: boolean) => setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));

  return (
    <div className="space-y-3">
      <HelpBox>
        <p>{t("overlay.help1")}</p>
      </HelpBox>
      {!result || !available.length ? (
        <Note tone="warn">{t("common.errors.noResults")}</Note>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <div className="space-y-2">
            <div className="text-sm font-medium">{t("overlay.forecasts")}</div>
            {available.map((f) => (
              <Checkbox key={f.id} checked={selected.includes(f.id)} onChange={(on) => toggle(f.id, on)} label={f.name} />
            ))}
            {selected.length > MAX_SERIES && <Note tone="warn">{t("overlay.max", { n: MAX_SERIES })}</Note>}
            {kind === "pdf" && <NumField label={t("overlay.bins")} value={bins} min={5} max={200} onChange={setBins} />}
          </div>
          <div className="min-w-0 space-y-3">
            <Tabs
              tabs={[
                { id: "pdf" as Kind, label: t("overlay.pdf") },
                { id: "cdf" as Kind, label: t("overlay.cdf") },
              ]}
              value={kind}
              onChange={setKind}
            />
            {option ? <Chart option={option} height={360} /> : <Note>{t("overlay.choose")}</Note>}
            {data.length > 0 && (
              <Section title={t("overlay.summary")}>
                <Table
                  columns={[
                    { key: "name", label: t("common.forecast") },
                    { key: "mean", label: t("common.mean"), align: "right" },
                    { key: "sd", label: t("common.stdDev"), align: "right" },
                    { key: "p5", label: "P5", align: "right" },
                    { key: "p95", label: "P95", align: "right" },
                  ]}
                  rows={data.map((d) => {
                    const s = result.forecasts[d.f.id].stats ?? describe(d.values);
                    return { name: d.f.name, mean: fmtAuto(s.mean, locale), sd: fmtAuto(s.stdDev, locale), p5: fmtAuto(s.percentiles[5], locale), p95: fmtAuto(s.percentiles[95], locale) };
                  })}
                />
              </Section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

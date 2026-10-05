/**
 * Dynamic sensitivity from the last simulation: rank correlations and contribution to variance.
 */
import { useMemo, useState } from "react";
import { Chart, Table } from "../../components/ui";
import { useModelStore } from "../../store/model";
import { useSimulationStore } from "../../store/simulation";
import { useToolsT } from "../common/i18n";
import { ExportButton, ForecastSelect, HelpBox, Note, Section } from "../common/ui";
import { fmt, fmtPct } from "../common/format";
import { barRankOption } from "../common/charts";

export default function SensitivityTool(_props: { onClose(): void }) {
  const { t, locale } = useToolsT();
  const model = useModelStore((s) => s.model);
  const result = useSimulationStore((s) => s.result);
  const available = model.forecasts.filter((f) => result?.sensitivity[f.id]);
  const [forecastId, setForecastId] = useState(available[0]?.id ?? model.forecasts[0]?.id ?? "");
  const entries = result?.sensitivity[forecastId] ?? [];
  const forecast = model.forecasts.find((f) => f.id === forecastId);

  const nameOf = (id: string) => {
    const a = model.assumptions.find((x) => x.id === id);
    return a ? a.name || `${a.cell.sheet}!${a.cell.address}` : id;
  };

  const corrChart = useMemo(
    () =>
      entries.length
        ? barRankOption({
            categories: entries.map((e) => nameOf(e.assumptionId)),
            values: entries.map((e) => e.rankCorrelation),
            name: t("sensitivity.rankCorrelation"),
            signed: true,
            locale,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, locale],
  );
  const varEntries = useMemo(() => [...entries].sort((a, b) => b.contributionToVariance - a.contributionToVariance), [entries]);
  const varChart = useMemo(
    () =>
      varEntries.length
        ? barRankOption({
            categories: varEntries.map((e) => nameOf(e.assumptionId)),
            values: varEntries.map((e) => e.contributionToVariance),
            name: t("sensitivity.contribution"),
            percent: true,
            locale,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [varEntries, locale],
  );

  const top = entries[0];
  return (
    <div className="space-y-4">
      <HelpBox>
        <p>{t("sensitivity.help1")}</p>
        <p>{t("sensitivity.help2")}</p>
      </HelpBox>
      {!result ? (
        <Note tone="warn">{t("common.errors.noResults")}</Note>
      ) : (
        <>
          <div className="max-w-sm">
            <ForecastSelect value={forecastId} onChange={setForecastId} onlyWithResults />
          </div>
          {!entries.length ? (
            <Note tone="warn">{t("sensitivity.none")}</Note>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <Section title={t("sensitivity.corrTitle")}>
                  {corrChart && <Chart option={corrChart} height={Math.max(220, 34 * entries.length + 70)} />}
                </Section>
                <Section title={t("sensitivity.varTitle")}>
                  {varChart && <Chart option={varChart} height={Math.max(220, 34 * entries.length + 70)} />}
                </Section>
              </div>
              {top && (
                <Note>
                  {t("sensitivity.interpretation", {
                    name: nameOf(top.assumptionId),
                    forecast: forecast?.name ?? "",
                    rho: fmt(top.rankCorrelation, 2, locale),
                    dir: top.rankCorrelation >= 0 ? t("sensitivity.positive") : t("sensitivity.negative"),
                    share: fmtPct(top.contributionToVariance, 0, locale),
                  })}
                </Note>
              )}
              <Note>{t("sensitivity.hint")}</Note>
              <Section
                title={t("common.table")}
                actions={
                  <ExportButton
                    sheetName={t("sensitivity.sheetName")}
                    build={() => [
                      [t("sensitivity.title", { name: forecast?.name ?? "" })],
                      [t("common.assumption"), t("sensitivity.rankCorrelation"), t("sensitivity.contribution")],
                      ...entries.map((e) => [nameOf(e.assumptionId), e.rankCorrelation, e.contributionToVariance]),
                    ]}
                  />
                }
              >
                <Table
                  columns={[
                    { key: "name", label: t("common.assumption") },
                    { key: "rho", label: t("sensitivity.rankCorrelation"), align: "right", format: (v) => fmt(v as number, 4, locale) },
                    { key: "cv", label: t("sensitivity.contribution"), align: "right", format: (v) => fmtPct(v as number, 2, locale) },
                  ]}
                  rows={entries.map((e) => ({ name: nameOf(e.assumptionId), rho: e.rankCorrelation, cv: e.contributionToVariance }))}
                  maxHeight={300}
                />
              </Section>
            </>
          )}
        </>
      )}
    </div>
  );
}

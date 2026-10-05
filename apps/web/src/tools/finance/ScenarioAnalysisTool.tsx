/**
 * Discrete scenario analysis (pessimistic / base / optimistic ...) with probabilities.
 */
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { scenarioAnalysis } from "@openrisksim/finance";
import { Button, Chart, Input, NumberInput } from "../../components/ui";
import { useToolsT } from "../common/i18n";
import { ExportButton, HelpBox, Note, Section, StatGrid } from "../common/ui";
import { fmt, fmtPct } from "../common/format";
import { columnOption } from "../common/charts";

interface Row {
  name: string;
  probability: number;
  value: number;
}

export default function ScenarioAnalysisTool(_props: { onClose(): void }) {
  const { t, locale } = useToolsT();
  const [rows, setRows] = useState<Row[]>(() => [
    { name: t("scenarios.pessimistic"), probability: 0.25, value: -20000 },
    { name: t("scenarios.base"), probability: 0.5, value: 35000 },
    { name: t("scenarios.optimistic"), probability: 0.25, value: 80000 },
  ]);
  const sumP = rows.reduce((a, r) => a + r.probability, 0);
  const res = useMemo(() => scenarioAnalysis(rows), [rows]);
  const probNeg = sumP > 0 ? rows.filter((r) => r.value < 0).reduce((a, r) => a + r.probability, 0) / sumP : NaN;
  const setRow = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const chart = useMemo(
    () =>
      columnOption({
        categories: rows.map((r) => r.name),
        series: [{ name: t("scenarios.value"), data: rows.map((r) => r.value) }],
        locale,
        signed: true,
        markLines: Number.isFinite(res.expected) ? [{ y: res.expected, label: `${t("scenarios.expected")}: ${fmt(res.expected, 2, locale)}` }] : [],
      }),
    [rows, res.expected, locale, t],
  );

  return (
    <div className="space-y-4">
      <HelpBox>
        <p>{t("scenarios.help1")}</p>
        <p>{t("scenarios.help2")}</p>
      </HelpBox>
      <Section
        title={t("scenarios.table")}
        actions={
          <>
            <Button size="sm" onClick={() => setRows([...rows, { name: `${t("scenarios.scenario")} ${rows.length + 1}`, probability: 0, value: 0 }])}>
              <Plus size={14} />
              {t("scenarios.add")}
            </Button>
            <ExportButton
              sheetName={t("scenarios.sheetName")}
              build={() => {
                const n = rows.length;
                return [
                  [t("scenarios.scenario"), t("scenarios.probability"), t("scenarios.value")],
                  ...rows.map((r) => [r.name, r.probability, r.value]),
                  [],
                  [t("scenarios.expected"), `=SUMPRODUCT(B2:B${n + 1},C2:C${n + 1})/SUM(B2:B${n + 1})`],
                  [t("scenarios.stdDev"), `=SQRT(SUMPRODUCT(B2:B${n + 1},(C2:C${n + 1}-B${n + 3})^2)/SUM(B2:B${n + 1}))`],
                  [t("scenarios.cv"), `=B${n + 4}/ABS(B${n + 3})`],
                ];
              }}
            />
          </>
        }
      >
        <div className="overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800">
              <tr>
                <th className="px-2 py-1.5 text-left">{t("scenarios.scenario")}</th>
                <th className="px-2 py-1.5 text-right">{t("scenarios.probability")} (%)</th>
                <th className="px-2 py-1.5 text-right">{t("scenarios.value")}</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-1 py-0.5">
                    <Input value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} />
                  </td>
                  <td className="px-1 py-0.5">
                    <NumberInput value={Math.round(r.probability * 1e6) / 1e4} onChange={(v) => setRow(i, { probability: v / 100 })} />
                  </td>
                  <td className="px-1 py-0.5">
                    <NumberInput value={r.value} onChange={(v) => setRow(i, { value: v })} />
                  </td>
                  <td className="px-1">
                    {rows.length > 1 && (
                      <button type="button" className="p-1 text-slate-500 hover:text-red-600" aria-label={t("common.remove")} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 font-semibold dark:border-slate-700">
                <td className="px-2 py-1">{t("scenarios.total")}</td>
                <td className="px-2 py-1 text-right tabular-nums">{fmtPct(sumP, 1, locale)}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
        {Math.abs(sumP - 1) > 1e-6 && <Note tone="warn">{t("scenarios.sumWarning", { sum: fmtPct(sumP, 1, locale) })}</Note>}
      </Section>
      <StatGrid
        items={[
          { label: t("scenarios.expected"), value: fmt(res.expected, 2, locale) },
          { label: t("scenarios.stdDev"), value: fmt(res.stdDev, 2, locale) },
          { label: t("scenarios.cv"), value: fmt(res.cv, 3, locale) },
          { label: t("scenarios.probNeg"), value: fmtPct(probNeg, 1, locale) },
        ]}
      />
      <Note tone={res.expected > 0 ? "good" : "warn"}>
        <p>{t("scenarios.meaning", { e: fmt(res.expected, 2, locale), sd: fmt(res.stdDev, 2, locale) })}</p>
        <p>{Number.isFinite(res.cv) ? (res.cv > 1 ? t("scenarios.cvHigh", { cv: fmt(res.cv, 2, locale) }) : t("scenarios.cvLow", { cv: fmt(res.cv, 2, locale) })) : ""}</p>
        <p className="text-xs">{t("scenarios.mcHint")}</p>
      </Note>
      <Chart option={chart} height={280} />
    </div>
  );
}

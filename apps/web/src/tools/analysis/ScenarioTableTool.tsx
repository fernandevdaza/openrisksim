/**
 * Scenario table (two-way data table): vary two assumptions over grids and tabulate a forecast.
 */
import { useState } from "react";
import { Play } from "lucide-react";
import { scenarioTable } from "@openrisksim/engine";
import { createDistribution } from "@openrisksim/distributions";
import type { AssumptionDef } from "@openrisksim/core";
import { Button, Field, Select } from "../../components/ui";
import { useModelStore } from "../../store/model";
import { useToolsT } from "../common/i18n";
import { ErrorNote, ExportButton, ForecastSelect, HelpBox, Note, NumField, Section, SplitLayout } from "../common/ui";
import { ToolError, cellNumber, enabledAssumptions, withEvaluator } from "../common/workbook";
import { fmt } from "../common/format";
import { heatColor } from "../common/charts";
import { linspace } from "../common/parse";

interface Axis {
  id: string;
  from: number;
  to: number;
  steps: number;
}

function suggest(a: AssumptionDef | undefined): { from: number; to: number } {
  if (!a) return { from: 0, to: 1 };
  try {
    const d = createDistribution(a.distribution);
    const lo = d.quantile(0.1);
    const hi = d.quantile(0.9);
    if (Number.isFinite(lo) && Number.isFinite(hi) && lo < hi) return { from: nice(lo), to: nice(hi) };
  } catch {
    /* fall back to the cell value */
  }
  const base = cellNumber(a.cell);
  if (Number.isFinite(base) && base !== 0) return { from: nice(base * 0.8), to: nice(base * 1.2) };
  return { from: 0, to: 1 };
}

function nice(v: number): number {
  if (v === 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 2);
  return Math.round(v / mag) * mag;
}

export default function ScenarioTableTool(_props: { onClose(): void }) {
  const { t, locale } = useToolsT();
  const model = useModelStore((s) => s.model);
  const assumptions = enabledAssumptions(model);
  const [forecastId, setForecastId] = useState(model.forecasts[0]?.id ?? "");
  const [a, setA] = useState<Axis>(() => ({ id: assumptions[0]?.id ?? "", steps: 5, ...suggest(assumptions[0]) }));
  const [b, setB] = useState<Axis>(() => ({ id: assumptions[1]?.id ?? assumptions[0]?.id ?? "", steps: 5, ...suggest(assumptions[1] ?? assumptions[0]) }));
  const [res, setRes] = useState<{ rowsA: number[]; colsB: number[]; values: number[][]; base: number; nameA: string; nameB: string; fName: string } | null>(null);
  const [error, setError] = useState<unknown>(null);

  const nameOf = (id: string) => {
    const x = model.assumptions.find((y) => y.id === id);
    return x ? x.name || `${x.cell.sheet}!${x.cell.address}` : id;
  };
  const options = assumptions.map((x) => ({ value: x.id, label: `${x.name} (${x.cell.sheet}!${x.cell.address})` }));

  const run = () => {
    setError(null);
    try {
      const m = useModelStore.getState().model;
      const enabled = enabledAssumptions(m);
      const fIdx = m.forecasts.findIndex((f) => f.id === forecastId);
      if (fIdx < 0) throw new ToolError("common.errors.noForecast");
      const iA = enabled.findIndex((x) => x.id === a.id);
      const iB = enabled.findIndex((x) => x.id === b.id);
      if (iA < 0 || iB < 0) throw new ToolError("common.errors.noAssumptions");
      if (iA === iB) throw new ToolError("scenarioTable.errors.same");
      const valsA = linspace(a.from, a.to, Math.max(2, Math.min(25, Math.round(a.steps))));
      const valsB = linspace(b.from, b.to, Math.max(2, Math.min(25, Math.round(b.steps))));
      const out = withEvaluator(m, (ev) => {
        const base = ev.baseInputs();
        const baseOut = ev.evaluate(base)[fIdx];
        // values[i][j] = forecast with A = valsA[i], B = valsB[j]
        const values = scenarioTable(ev, base, iA, valsA, iB, valsB, fIdx);
        return { values, base: baseOut };
      });
      setRes({ rowsA: valsA, colsB: valsB, ...out, nameA: nameOf(a.id), nameB: nameOf(b.id), fName: m.forecasts[fIdx].name });
    } catch (e) {
      setRes(null);
      setError(e);
    }
  };

  const axisForm = (label: string, ax: Axis, set: (v: Axis) => void) => (
    <div className="space-y-2 rounded-md border border-slate-200 p-2 dark:border-slate-700">
      <Field label={label}>
        <Select
          value={ax.id}
          onChange={(id) => set({ ...ax, id, ...suggest(assumptions.find((x) => x.id === id)) })}
          options={options.length ? options : [{ value: "", label: t("common.errors.noAssumptions") }]}
          disabled={!options.length}
        />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <NumField label={t("scenarioTable.from")} value={ax.from} onChange={(from) => set({ ...ax, from })} />
        <NumField label={t("scenarioTable.to")} value={ax.to} onChange={(to) => set({ ...ax, to })} />
        <NumField label={t("scenarioTable.steps")} value={ax.steps} min={2} max={25} onChange={(steps) => set({ ...ax, steps })} />
      </div>
    </div>
  );

  let min = Infinity;
  let max = -Infinity;
  res?.values.forEach((r) => r.forEach((v) => Number.isFinite(v) && ((min = Math.min(min, v)), (max = Math.max(max, v)))));

  const form = (
    <>
      <ForecastSelect value={forecastId} onChange={setForecastId} />
      {axisForm(t("scenarioTable.rows"), a, setA)}
      {axisForm(t("scenarioTable.cols"), b, setB)}
      <Button variant="primary" onClick={run} disabled={!forecastId || options.length < 2}>
        <Play size={14} />
        {t("common.calculate")}
      </Button>
      {options.length < 2 && <Note tone="warn">{t("scenarioTable.needTwo")}</Note>}
      <ErrorNote error={error} />
    </>
  );

  return (
    <div>
      <HelpBox>
        <p>{t("scenarioTable.help1")}</p>
        <p>{t("scenarioTable.help2")}</p>
      </HelpBox>
      <SplitLayout form={form}>
        {!res ? (
          <Note>{t("scenarioTable.empty")}</Note>
        ) : (
          <>
            <Section
              title={t("scenarioTable.title", { name: res.fName })}
              actions={
                <ExportButton
                  sheetName={t("scenarioTable.sheetName")}
                  build={() => [
                    [t("scenarioTable.title", { name: res.fName })],
                    [`${res.nameA} \\ ${res.nameB}`, ...res.colsB],
                    ...res.rowsA.map((va, i) => [va, ...res.values[i]]),
                  ]}
                />
              }
            >
              <div className="overflow-auto rounded-md border border-slate-200 dark:border-slate-700">
                <table className="w-full border-collapse text-sm tabular-nums">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800">
                      <th className="px-2 py-1.5 text-left text-xs font-semibold">
                        {res.nameA} ↓ / {res.nameB} →
                      </th>
                      {res.colsB.map((v, j) => (
                        <th key={j} className="px-2 py-1.5 text-right font-semibold">
                          {fmt(v, 4, locale)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {res.rowsA.map((va, i) => (
                      <tr key={i}>
                        <th className="bg-slate-100 px-2 py-1 text-right font-semibold dark:bg-slate-800">{fmt(va, 4, locale)}</th>
                        {res.values[i].map((v, j) => {
                          const c = heatColor(v, min, max);
                          return (
                            <td key={j} className="border border-white px-2 py-1 text-right dark:border-slate-900" style={{ background: c.bg, color: c.fg }} title={`${res.nameA} = ${fmt(va, 4, locale)}, ${res.nameB} = ${fmt(res.colsB[j], 4, locale)}`}>
                              {fmt(v, 2, locale)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
            <Note>
              {t("scenarioTable.summary", { base: fmt(res.base, 2, locale), min: fmt(min, 2, locale), max: fmt(max, 2, locale) })}
              {min < 0 && max > 0 ? " " + t("scenarioTable.signHint") : ""}
            </Note>
          </>
        )}
      </SplitLayout>
    </div>
  );
}

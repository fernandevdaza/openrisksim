/**
 * Tornado & spider charts (deterministic, one-at-a-time sensitivity from the current model).
 */
import { useEffect, useMemo, useState } from "react";
import { Play } from "lucide-react";
import { tornado, spider } from "@openrisksim/engine";
import type { RiskModel, SensitivityMethod, SpiderSeries, TornadoEntry } from "@openrisksim/core";
import { Button, Chart, Field, Select, Tabs, Table } from "../../components/ui";
import { useModelStore } from "../../store/model";
import { useToolsT } from "../common/i18n";
import { Checkbox, ErrorNote, ExportButton, ForecastSelect, HelpBox, Note, PctField, Section, SplitLayout, NumField } from "../common/ui";
import { ToolError, enabledAssumptions, withEvaluator } from "../common/workbook";
import { fmt, fmtPct } from "../common/format";
import { lineOption, tornadoOption, MAX_SERIES } from "../common/charts";
import { linspace } from "../common/parse";

type Mode = "tornado" | "spider";

const METHOD_KEY = "openrisksim.tornado.method";
function savedMethod(): SensitivityMethod {
  try {
    return localStorage.getItem(METHOD_KEY) === "percentChange" ? "percentChange" : "percentile";
  } catch {
    return "percentile";
  }
}

/** Enabled assumptions that share a name (e.g. "Producción" in years 1, 2 and 3) → candidate groups. */
export function sameNameGroups(model: RiskModel): string[][] {
  const byName = new Map<string, string[]>();
  for (const a of model.assumptions) {
    if (!a.enabled) continue;
    const key = a.name.trim().toLowerCase();
    if (!key) continue;
    byName.set(key, [...(byName.get(key) ?? []), a.id]);
  }
  return [...byName.values()].filter((ids) => ids.length > 1);
}

interface Computed {
  method: SensitivityMethod;
  change: number;
  forecastName: string;
  base: number;
  entries: TornadoEntry[];
  spider: SpiderSeries[];
  baseInputs: Record<string, number>;
}

function TornadoSpider({ initial }: { initial: Mode }) {
  const { t, locale } = useToolsT();
  const model = useModelStore((s) => s.model);
  const [mode, setMode] = useState<Mode>(initial);
  const [forecastId, setForecastId] = useState(model.forecasts[0]?.id ?? "");
  const [pLow, setPLow] = useState(0.1);
  const [pHigh, setPHigh] = useState(0.9);
  const [points, setPoints] = useState(9);
  const [method, setMethodState] = useState<SensitivityMethod>(savedMethod);
  const [change, setChange] = useState(0.1);
  const groupCandidates = useMemo(() => sameNameGroups(model), [model]);
  const [groupSame, setGroupSame] = useState(true);
  const setMethod = (m: SensitivityMethod) => {
    setMethodState(m);
    try {
      localStorage.setItem(METHOD_KEY, m);
    } catch {
      /* ignore */
    }
  };
  const [res, setRes] = useState<Computed | null>(null);
  const [error, setError] = useState<unknown>(null);

  const nameOf = (id: string, ids?: string[]) => {
    const a = model.assumptions.find((x) => x.id === id);
    const name = a ? a.name || `${a.cell.sheet}!${a.cell.address}` : id;
    return ids && ids.length > 1 ? t("tornado.groupedName", { name, n: ids.length }) : name;
  };
  const isGroup = (e: { assumptionIds?: string[] }) => (e.assumptionIds?.length ?? 1) > 1;

  const run = () => {
    setError(null);
    try {
      const m = useModelStore.getState().model;
      const fIdx = m.forecasts.findIndex((f) => f.id === forecastId);
      if (fIdx < 0) throw new ToolError("common.errors.noForecast");
      const enabled = enabledAssumptions(m);
      if (!enabled.length) throw new ToolError("common.errors.noAssumptions");
      if (method === "percentile" && !(pLow < pHigh)) throw new ToolError("tornado.errors.percentiles");
      if (method === "percentChange" && !(change > 0 && change < 1)) throw new ToolError("tornado.errors.change");
      const groups = groupSame ? sameNameGroups(m) : [];
      const opts = { method, pLow, pHigh, change, groups };
      const out = withEvaluator(m, (ev) => {
        const baseIn = ev.baseInputs();
        const base = ev.evaluate(baseIn)[fIdx];
        const entries = tornado(m, ev, baseIn, fIdx, opts);
        const n = Math.max(3, Math.round(points));
        const positions = method === "percentChange" ? linspace(-change, change, n) : linspace(pLow, pHigh, n);
        const sp = spider(m, ev, baseIn, fIdx, { ...opts, positions });
        const baseInputs: Record<string, number> = {};
        enabled.forEach((a, i) => (baseInputs[a.id] = baseIn[i]));
        return { base, entries, spider: sp, baseInputs };
      });
      setRes({ ...out, method, change, forecastName: m.forecasts[fIdx].name });
    } catch (e) {
      setRes(null);
      setError(e);
    }
  };

  useEffect(() => {
    if (forecastId && enabledAssumptions(model).length) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalSq = res ? res.entries.reduce((a, e) => a + e.swing * e.swing, 0) : 0;

  const tornadoChart = useMemo(() => {
    if (!res) return null;
    return tornadoOption({
      names: res.entries.map((e) => nameOf(e.assumptionId, e.assumptionIds)),
      outputAtLow: res.entries.map((e) => e.outputAtLow),
      outputAtHigh: res.entries.map((e) => e.outputAtHigh),
      base: res.base,
      lowLabel:
        res.method === "percentChange" ? t("tornado.lowChange", { p: fmtPct(res.change, 0, locale) }) : t("tornado.lowInput", { p: fmtPct(pLow, 0, locale) }),
      highLabel:
        res.method === "percentChange" ? t("tornado.highChange", { p: fmtPct(res.change, 0, locale) }) : t("tornado.highInput", { p: fmtPct(pHigh, 0, locale) }),
      baseLabel: t("tornado.base"),
      locale,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res, locale]);

  const spiderSeries = useMemo(() => {
    if (!res) return [];
    return [...res.spider]
      .sort((a, b) => range(b.outputs) - range(a.outputs))
      .slice(0, MAX_SERIES);
  }, [res]);

  const spiderChart = useMemo(() => {
    if (!res || !spiderSeries.length) return null;
    return lineOption({
      xType: "value",
      x: spiderSeries[0].percentiles,
      xPercent: true,
      series: spiderSeries.map((s) => ({ name: nameOf(s.assumptionId, s.assumptionIds), data: s.outputs, x: s.percentiles })),
      xName: res.method === "percentChange" ? t("tornado.changeAxis") : t("tornado.percentileAxis"),
      yName: res.forecastName,
      locale,
      markLines: [{ y: res.base, label: t("tornado.base") }],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res, spiderSeries, locale]);

  const form = (
    <>
      <ForecastSelect value={forecastId} onChange={setForecastId} />
      <Field
        label={t("tornado.method")}
        hint={method === "percentChange" ? t("tornado.methodHintChange") : t("tornado.methodHintPercentile")}
      >
        <Select<SensitivityMethod>
          value={method}
          onChange={setMethod}
          options={[
            { value: "percentile", label: t("tornado.methodPercentile") },
            { value: "percentChange", label: t("tornado.methodChange") },
          ]}
        />
      </Field>
      {method === "percentile" ? (
        <div className="grid grid-cols-2 gap-2">
          <PctField label={t("tornado.pLow")} value={pLow} onChange={setPLow} />
          <PctField label={t("tornado.pHigh")} value={pHigh} onChange={setPHigh} />
        </div>
      ) : (
        <PctField label={t("tornado.change")} value={change} onChange={setChange} />
      )}
      {groupCandidates.length > 0 && (
        <div className="space-y-1">
          <Checkbox checked={groupSame} onChange={setGroupSame} label={t("tornado.groupSameName")} />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t("tornado.groupHint", {
              names: groupCandidates.map((ids) => `${nameOf(ids[0])} (${ids.length})`).join(", "),
            })}
          </p>
        </div>
      )}
      {mode === "spider" && <NumField label={t("tornado.points")} value={points} min={3} max={21} onChange={setPoints} />}
      <Button variant="primary" onClick={run} disabled={!forecastId}>
        <Play size={14} />
        {t("common.calculate")}
      </Button>
      <ErrorNote error={error} />
    </>
  );

  return (
    <div>
      <HelpBox>
        <p>{t("tornado.help1")}</p>
        <p>{t("tornado.help2")}</p>
      </HelpBox>
      <SplitLayout form={form}>
        <Tabs
          tabs={[
            { id: "tornado" as Mode, label: t("tornado.tornadoTab") },
            { id: "spider" as Mode, label: t("tornado.spiderTab") },
          ]}
          value={mode}
          onChange={setMode}
        />
        {!res && !error && <Note>{t("tornado.empty")}</Note>}
        {res && mode === "tornado" && (
          <>
            <Section title={t("tornado.chartTitle", { name: res.forecastName })}>
              {tornadoChart && <Chart option={tornadoChart} height={Math.max(220, 46 * res.entries.length + 90)} />}
            </Section>
            <Note>
              {res.entries.length > 0
                ? t("tornado.interpretation", { name: nameOf(res.entries[0].assumptionId, res.entries[0].assumptionIds), share: fmtPct(totalSq ? (res.entries[0].swing ** 2) / totalSq : 0, 0, locale) })
                : t("tornado.noEntries")}
            </Note>
            <Section
              title={t("common.table")}
              actions={
                <ExportButton
                  sheetName={t("tornado.sheetName")}
                  build={() => [
                    [t("tornado.chartTitle", { name: res.forecastName })],
                    [t("tornado.base"), res.base],
                    [],
                    [t("common.assumption"), t("tornado.inputLow"), t("tornado.baseInput"), t("tornado.inputHigh"), t("tornado.outputLow"), t("tornado.outputHigh"), t("tornado.swing"), t("tornado.share")],
                    ...res.entries.map((e) => [
                      nameOf(e.assumptionId, e.assumptionIds),
                      isGroup(e) ? null : e.lowInput,
                      isGroup(e) ? null : (res.baseInputs[e.assumptionId] ?? null),
                      isGroup(e) ? null : e.highInput,
                      e.outputAtLow,
                      e.outputAtHigh,
                      e.swing,
                      totalSq ? (e.swing * e.swing) / totalSq : null,
                    ]),
                  ]}
                />
              }
            >
              <Table
                columns={[
                  { key: "name", label: t("common.assumption") },
                  { key: "lowInput", label: t("tornado.inputLow"), align: "right", format: (v) => fmt(v as number, 4, locale) },
                  { key: "baseInput", label: t("tornado.baseInput"), align: "right", format: (v) => fmt(v as number, 4, locale) },
                  { key: "highInput", label: t("tornado.inputHigh"), align: "right", format: (v) => fmt(v as number, 4, locale) },
                  { key: "outputAtLow", label: t("tornado.outputLow"), align: "right", format: (v) => fmt(v as number, 2, locale) },
                  { key: "outputAtHigh", label: t("tornado.outputHigh"), align: "right", format: (v) => fmt(v as number, 2, locale) },
                  { key: "swing", label: t("tornado.swing"), align: "right", format: (v) => fmt(v as number, 2, locale) },
                  { key: "share", label: t("tornado.share"), align: "right", format: (v) => fmtPct(v as number, 1, locale) },
                ]}
                rows={res.entries.map((e) => ({
                  ...e,
                  name: nameOf(e.assumptionId, e.assumptionIds),
                  lowInput: isGroup(e) ? NaN : e.lowInput,
                  highInput: isGroup(e) ? NaN : e.highInput,
                  baseInput: isGroup(e) ? NaN : res.baseInputs[e.assumptionId],
                  share: totalSq ? (e.swing * e.swing) / totalSq : NaN,
                }))}
                maxHeight={320}
              />
              {res.entries.some(isGroup) && <Note>{t("tornado.groupedNote")}</Note>}
            </Section>
          </>
        )}
        {res && mode === "spider" && (
          <>
            <Section title={t("tornado.spiderTitle", { name: res.forecastName })}>
              {spiderChart && <Chart option={spiderChart} height={380} />}
              {res.spider.length > MAX_SERIES && <Note tone="warn">{t("tornado.spiderTruncated", { n: MAX_SERIES })}</Note>}
            </Section>
            <Note>{t("tornado.spiderInterpretation")}</Note>
            <Section
              title={t("common.table")}
              actions={
                <ExportButton
                  sheetName={t("tornado.spiderSheetName")}
                  build={() => [
                    [t("tornado.spiderTitle", { name: res.forecastName })],
                    [t("common.assumption"), ...(res.spider[0]?.percentiles ?? []).map((p) => fmtPct(p, 0, locale))],
                    ...res.spider.map((s) => [nameOf(s.assumptionId, s.assumptionIds), ...s.outputs]),
                  ]}
                />
              }
            >
              <Table
                columns={[
                  { key: "name", label: t("common.assumption") },
                  ...(res.spider[0]?.percentiles ?? []).map((p, i) => ({
                    key: `p${i}`,
                    label: fmtPct(p, 0, locale),
                    align: "right" as const,
                    format: (v: unknown) => fmt(v as number, 2, locale),
                  })),
                ]}
                rows={res.spider.map((s) => {
                  const row: Record<string, unknown> = { name: nameOf(s.assumptionId, s.assumptionIds) };
                  s.outputs.forEach((o, i) => (row[`p${i}`] = o));
                  return row;
                })}
                maxHeight={320}
              />
            </Section>
          </>
        )}
      </SplitLayout>
    </div>
  );
}

function range(a: number[]): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of a) {
    if (!Number.isFinite(v)) continue;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return hi - lo;
}

export function TornadoTool(_props: { onClose(): void }) {
  return <TornadoSpider initial="tornado" />;
}
export function SpiderTool(_props: { onClose(): void }) {
  return <TornadoSpider initial="spider" />;
}

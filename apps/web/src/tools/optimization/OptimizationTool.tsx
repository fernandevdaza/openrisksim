/**
 * Optimization: choose the decision-variable values that maximize / minimize a forecast
 * (deterministic or a statistic of a short simulation), subject to constraints.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Plus, Square, Trash2, Check } from "lucide-react";
import { optimize, efficientFrontier, type ForecastStatistic, type OptOptions, type OptResult } from "@openrisksim/optimizer";
import { Button, Chart, Field, Input, Select, Table, Tabs } from "../../components/ui";
import { useModelStore } from "../../store/model";
import { useToolsT } from "../common/i18n";
import { RangeInput } from "../common/RangeInput";
import { Checkbox, ErrorNote, ExportButton, HelpBox, Note, NumField, Progress, Section, SplitLayout, StatGrid } from "../common/ui";
import { cellNumber, writeCells } from "../common/workbook";
import { fmt, fmtAuto } from "../common/format";
import { lineOption } from "../common/charts";
import { linspace } from "../common/parse";
import { buildProblem, constraintId, roundToType, type ConstraintRow, type Mode, type Op, type OptConfig } from "./problem";

type Algorithm = NonNullable<OptOptions["algorithm"]>;
type ResultTab = "solution" | "convergence" | "frontier";
const STATS: ForecastStatistic[] = ["mean", "median", "stdDev", "cv", "p5", "p10", "p90", "p95", "probAbove", "probBelow"];
const OPS: Op[] = ["<=", ">=", "="];

const newConstraint = (forecastId: string): ConstraintRow => ({ kind: "cell", cell: "", forecastId, statistic: "mean", threshold: 0, op: "<=", rhs: 0 });

export default function OptimizationTool(_props: { onClose(): void }) {
  const { t, locale } = useToolsT();
  const model = useModelStore((s) => s.model);
  const [cfg, setCfg] = useState<OptConfig>(() => ({
    mode: "static",
    objectiveForecastId: model.forecasts[0]?.id ?? "",
    sense: "maximize",
    statistic: "mean",
    threshold: 0,
    trials: 500,
    constraints: [],
  }));
  const [algorithm, setAlgorithm] = useState<Algorithm>("auto");
  const [maxEval, setMaxEval] = useState(1000);
  const [seed, setSeed] = useState(12345);
  const [frontier, setFrontier] = useState({ enabled: false, index: 0, from: 0, to: 1, steps: 5 });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ evaluations: number; best: number } | null>(null);
  const [liveHistory, setLiveHistory] = useState<{ evaluation: number; best: number }[]>([]);
  const [result, setResult] = useState<OptResult | null>(null);
  const [frontierRes, setFrontierRes] = useState<{ rhs: number; result: OptResult }[] | null>(null);
  const [tab, setTab] = useState<ResultTab>("solution");
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  // keep the objective valid when the model changes (another workbook / example opened)
  useEffect(() => {
    if (!model.forecasts.some((f) => f.id === cfg.objectiveForecastId) && model.forecasts.length) setCfg((c) => ({ ...c, objectiveForecastId: model.forecasts[0].id }));
  }, [model.forecasts, cfg.objectiveForecastId]);
  useEffect(() => {
    setMaxEval(cfg.mode === "static" ? 1000 : 60);
  }, [cfg.mode]);

  const set = (patch: Partial<OptConfig>) => setCfg((c) => ({ ...c, ...patch }));
  const setConstraint = (i: number, patch: Partial<ConstraintRow>) => set({ constraints: cfg.constraints.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const forecastOptions = model.forecasts.map((f) => ({ value: f.id, label: f.name }));
  const statLabel = (s: ForecastStatistic) => t(`optimization.stats.${s}`);
  const needsThreshold = (s: ForecastStatistic) => s === "probAbove" || s === "probBelow";

  const run = async () => {
    setError(null);
    setApplied(false);
    setResult(null);
    setFrontierRes(null);
    setLiveHistory([]);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);
    let built: ReturnType<typeof buildProblem> | null = null;
    try {
      const m = useModelStore.getState().model;
      built = buildProblem(m, cfg, ctrl.signal);
      const hist: { evaluation: number; best: number }[] = [];
      let lastUi = 0;
      const options: OptOptions = {
        algorithm,
        maxEvaluations: Math.max(10, Math.round(maxEval)),
        seed,
        signal: ctrl.signal,
        onProgress: (p) => {
          if (Number.isFinite(p.best)) hist.push({ evaluation: p.evaluations, best: p.best });
          const now = Date.now();
          if (now - lastUi > 150) {
            lastUi = now;
            setProgress({ evaluations: p.evaluations, best: p.best });
            setLiveHistory(hist.slice(-500));
          }
        },
      };
      if (frontier.enabled && cfg.constraints.length) {
        const rhs = linspace(frontier.from, frontier.to, Math.max(2, Math.min(30, Math.round(frontier.steps))));
        const fr = await efficientFrontier(built.problem, constraintId(Math.min(frontier.index, cfg.constraints.length - 1)), rhs, options);
        setFrontierRes(fr);
        const feasible = fr.filter((p) => p.result.feasible);
        const best = (feasible.length ? feasible : fr).reduce<{ rhs: number; result: OptResult } | null>(
          (acc, p) => (!acc || (cfg.sense === "maximize" ? p.result.value > acc.result.value : p.result.value < acc.result.value) ? p : acc),
          null,
        );
        if (best) setResult(best.result);
        setTab("frontier");
      } else {
        const r = await optimize(built.problem, options);
        setResult(r);
        setTab("solution");
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setError(e);
    } finally {
      built?.dispose();
      setRunning(false);
      setProgress(null);
      abortRef.current = null;
    }
  };

  const apply = () => {
    if (!result) return;
    const m = useModelStore.getState().model;
    const xs = roundToType(m, result.x);
    writeCells(m.decisions.map((d, i) => ({ ref: d.cell, value: xs[i] })));
    setApplied(true);
  };

  const history = result?.history.length ? result.history : liveHistory;
  const convChart = useMemo(
    () =>
      history.length
        ? lineOption({
            xType: "value",
            series: [{ name: t("optimization.bestValue"), data: history.map((h) => h.best), x: history.map((h) => h.evaluation), step: true }],
            xName: t("optimization.evaluations"),
            yName: t("optimization.objective"),
            locale,
          })
        : null,
    [history, locale, t],
  );
  const frontierChart = useMemo(() => {
    if (!frontierRes) return null;
    const feas = frontierRes.filter((p) => p.result.feasible);
    return lineOption({
      xType: "value",
      series: [{ name: t("optimization.objective"), data: feas.map((p) => p.result.value), x: feas.map((p) => p.rhs) }],
      xName: t("optimization.rhs"),
      yName: t("optimization.objective"),
      locale,
    });
  }, [frontierRes, locale, t]);

  const objName = model.forecasts.find((f) => f.id === cfg.objectiveForecastId)?.name ?? "";
  const rounded = result ? roundToType(model, result.x) : [];

  const constraintLabel = (c: ConstraintRow) =>
    c.kind === "cell"
      ? c.cell
      : cfg.mode === "stochastic"
        ? `${statLabel(c.statistic)}(${model.forecasts.find((f) => f.id === c.forecastId)?.name ?? "?"})`
        : model.forecasts.find((f) => f.id === c.forecastId)?.name ?? "?";

  const form = (
    <>
      {!model.decisions.length && <Note tone="warn">{t("optimization.errors.noDecisions")}</Note>}
      {model.decisions.length > 0 && (
        <Section title={t("optimization.decisions")}>
          <Table
            columns={[
              { key: "name", label: t("common.name") },
              { key: "range", label: t("optimization.bounds"), align: "right" },
              { key: "type", label: t("optimization.type") },
            ]}
            rows={model.decisions.map((d) => ({ name: `${d.name} (${d.cell.address})`, range: `[${fmt(d.lower, 4, locale)} ; ${fmt(d.upper, 4, locale)}]`, type: t(`optimization.types.${d.type}`) }))}
          />
        </Section>
      )}
      <Field label={t("optimization.mode")}>
        <Select
          value={cfg.mode}
          onChange={(mode: Mode) => set({ mode })}
          options={[
            { value: "static", label: t("optimization.static") },
            { value: "stochastic", label: t("optimization.stochastic") },
          ]}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("optimization.objective")}>
          <Select value={cfg.objectiveForecastId} onChange={(objectiveForecastId) => set({ objectiveForecastId })} options={forecastOptions.length ? forecastOptions : [{ value: "", label: t("common.noForecasts") }]} />
        </Field>
        <Field label={t("optimization.sense")}>
          <Select
            value={cfg.sense}
            onChange={(sense: "maximize" | "minimize") => set({ sense })}
            options={[
              { value: "maximize", label: t("optimization.maximize") },
              { value: "minimize", label: t("optimization.minimize") },
            ]}
          />
        </Field>
      </div>
      {cfg.mode === "stochastic" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("optimization.statistic")}>
            <Select value={cfg.statistic} onChange={(statistic: ForecastStatistic) => set({ statistic })} options={STATS.map((s) => ({ value: s, label: statLabel(s) }))} />
          </Field>
          {needsThreshold(cfg.statistic) ? (
            <NumField label={t("optimization.threshold")} value={cfg.threshold} onChange={(threshold) => set({ threshold })} />
          ) : (
            <NumField label={t("optimization.trials")} value={cfg.trials} min={50} max={20000} onChange={(trials) => set({ trials })} />
          )}
          {needsThreshold(cfg.statistic) && <NumField label={t("optimization.trials")} value={cfg.trials} min={50} max={20000} onChange={(trials) => set({ trials })} />}
        </div>
      )}
      <Section
        title={t("optimization.constraints")}
        actions={
          <Button size="sm" onClick={() => set({ constraints: [...cfg.constraints, newConstraint(model.forecasts[0]?.id ?? "")] })}>
            <Plus size={14} />
            {t("optimization.addConstraint")}
          </Button>
        }
      >
        {cfg.constraints.length === 0 && <p className="text-xs text-slate-500">{t("optimization.noConstraints")}</p>}
        {cfg.constraints.map((c, i) => (
          <div key={i} className="space-y-1.5 rounded-md border border-slate-200 p-2 dark:border-slate-700">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-500">c{i + 1}</span>
              <Select
                value={c.kind}
                onChange={(kind: "cell" | "forecast") => setConstraint(i, { kind })}
                options={[
                  { value: "cell", label: t("optimization.kindCell") },
                  { value: "forecast", label: t("optimization.kindForecast") },
                ]}
              />
              <button type="button" className="p-1 text-slate-500 hover:text-red-600" aria-label={t("common.remove")} onClick={() => set({ constraints: cfg.constraints.filter((_, j) => j !== i) })}>
                <Trash2 size={14} />
              </button>
            </div>
            {c.kind === "cell" ? (
              <RangeInput value={c.cell} onChange={(cell) => setConstraint(i, { cell })} placeholder="Hoja!C10" />
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                <Select value={c.forecastId} onChange={(forecastId) => setConstraint(i, { forecastId })} options={forecastOptions} />
                {cfg.mode === "stochastic" && <Select value={c.statistic} onChange={(statistic: ForecastStatistic) => setConstraint(i, { statistic })} options={STATS.map((s) => ({ value: s, label: statLabel(s) }))} />}
                {cfg.mode === "stochastic" && needsThreshold(c.statistic) && (
                  <Input value={String(c.threshold)} onChange={(e) => setConstraint(i, { threshold: Number(e.target.value.replace(",", ".")) || 0 })} placeholder={t("optimization.threshold")} />
                )}
              </div>
            )}
            <div className="grid grid-cols-[80px_1fr] gap-1.5">
              <Select value={c.op} onChange={(op: Op) => setConstraint(i, { op })} options={OPS.map((o) => ({ value: o, label: o === "<=" ? "≤" : o === ">=" ? "≥" : "=" }))} />
              <Input inputMode="decimal" value={String(c.rhs)} onChange={(e) => setConstraint(i, { rhs: Number(e.target.value.replace(",", ".")) || 0 })} aria-label={t("optimization.rhs")} />
            </div>
          </div>
        ))}
      </Section>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("optimization.algorithm")}>
          <Select
            value={algorithm}
            onChange={setAlgorithm}
            options={(["auto", "nelderMead", "genetic", "simulatedAnnealing"] as Algorithm[]).map((a) => ({ value: a, label: t(`optimization.algorithms.${a}`) }))}
          />
        </Field>
        <NumField label={t("optimization.maxEval")} value={maxEval} min={10} max={100000} onChange={setMaxEval} />
      </div>
      <NumField label={t("common.seed")} value={seed} onChange={setSeed} />
      {cfg.constraints.length > 0 && (
        <div className="space-y-1.5 rounded-md border border-slate-200 p-2 dark:border-slate-700">
          <Checkbox checked={frontier.enabled} onChange={(enabled) => setFrontier({ ...frontier, enabled })} label={t("optimization.frontier")} />
          {frontier.enabled && (
            <>
              <Select
                value={String(frontier.index)}
                onChange={(v) => setFrontier({ ...frontier, index: Number(v) })}
                options={cfg.constraints.map((c, i) => ({ value: String(i), label: `c${i + 1}: ${constraintLabel(c)}` }))}
              />
              <div className="grid grid-cols-3 gap-1.5">
                <NumField label={t("scenarioTable.from")} value={frontier.from} onChange={(from) => setFrontier({ ...frontier, from })} />
                <NumField label={t("scenarioTable.to")} value={frontier.to} onChange={(to) => setFrontier({ ...frontier, to })} />
                <NumField label={t("scenarioTable.steps")} value={frontier.steps} min={2} max={30} onChange={(steps) => setFrontier({ ...frontier, steps })} />
              </div>
            </>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="primary" onClick={run} disabled={running || !model.decisions.length || !cfg.objectiveForecastId}>
          <Play size={14} />
          {t("optimization.run")}
        </Button>
        {running && (
          <Button variant="danger" onClick={() => abortRef.current?.abort()}>
            <Square size={14} />
            {t("common.stop")}
          </Button>
        )}
      </div>
      {cfg.mode === "stochastic" && <p className="text-xs text-slate-500">{t("optimization.stochasticHint")}</p>}
      <ErrorNote error={error} />
    </>
  );

  return (
    <div>
      <HelpBox>
        <p>{t("optimization.help1")}</p>
        <p>{t("optimization.help2")}</p>
        <p>{t("optimization.help3")}</p>
      </HelpBox>
      <SplitLayout form={form}>
        {running && (
          <Progress
            value={progress ? Math.min(1, progress.evaluations / Math.max(1, maxEval * (frontier.enabled ? Math.max(2, frontier.steps) : 1))) : 0}
            label={progress ? t("optimization.progress", { n: progress.evaluations, best: fmtAuto(progress.best, locale) }) : t("optimization.starting")}
          />
        )}
        {!result && !running && !frontierRes && <Note>{t("optimization.empty")}</Note>}
        {(result || running || frontierRes) && (
          <Tabs
            tabs={[
              { id: "solution" as ResultTab, label: t("optimization.tabSolution") },
              { id: "convergence" as ResultTab, label: t("optimization.tabConvergence") },
              ...(frontierRes ? [{ id: "frontier" as ResultTab, label: t("optimization.tabFrontier") }] : []),
            ]}
            value={tab}
            onChange={setTab}
          />
        )}
        {tab === "solution" && result && (
          <>
            <StatGrid
              items={[
                { label: cfg.mode === "stochastic" ? `${statLabel(cfg.statistic)} — ${objName}` : objName, value: fmtAuto(result.value, locale) },
                { label: t("optimization.feasible"), value: result.feasible ? t("common.yes") : t("common.no") },
                { label: t("optimization.evaluations"), value: fmt(result.evaluations, 0, locale) },
                { label: t("optimization.algorithm"), value: t(`optimization.algorithms.${result.algorithm}`, { defaultValue: result.algorithm }) },
              ]}
            />
            <Note tone={result.feasible ? "good" : "warn"}>
              <p>{result.feasible ? t("optimization.feasibleMsg", { sense: t(`optimization.${cfg.sense}`).toLowerCase(), name: objName, value: fmtAuto(result.value, locale) }) : t("optimization.infeasibleMsg")}</p>
              <p className="text-xs">{optimizerMessage(result.message, t)}</p>
            </Note>
            <Section
              title={t("optimization.solution")}
              actions={
                <>
                  <ExportButton
                    sheetName={t("optimization.sheetName")}
                    build={() => [
                      [t("optimization.objective"), objName, result.value],
                      [t("optimization.feasible"), result.feasible ? t("common.yes") : t("common.no")],
                      [],
                      [t("common.name"), t("common.cell"), t("optimization.current"), t("optimization.optimal")],
                      ...model.decisions.map((d, i) => [d.name, `${d.cell.sheet}!${d.cell.address}`, cellNumber(d.cell), rounded[i]]),
                      [],
                      [t("optimization.constraints"), t("optimization.valueCol"), "", t("optimization.rhs")],
                      ...cfg.constraints.map((c, i) => [constraintLabel(c), result.constraintValues[i] ?? null, c.op, c.rhs]),
                    ]}
                  />
                  <Button size="sm" variant="primary" onClick={apply} disabled={running}>
                    <Check size={14} />
                    {t("optimization.apply")}
                  </Button>
                </>
              }
            >
              {applied && <Note tone="good">{t("optimization.applied")}</Note>}
              <Table
                columns={[
                  { key: "name", label: t("common.name") },
                  { key: "cell", label: t("common.cell") },
                  { key: "current", label: t("optimization.current"), align: "right" },
                  { key: "optimal", label: t("optimization.optimal"), align: "right" },
                ]}
                rows={model.decisions.map((d, i) => ({ name: d.name, cell: `${d.cell.sheet}!${d.cell.address}`, current: fmtAuto(cellNumber(d.cell), locale), optimal: fmtAuto(rounded[i], locale) }))}
              />
            </Section>
            {cfg.constraints.length > 0 && (
              <Section title={t("optimization.constraints")}>
                <Table
                  columns={[
                    { key: "id", label: "#" },
                    { key: "label", label: t("optimization.constraint") },
                    { key: "value", label: t("optimization.valueCol"), align: "right" },
                    { key: "rule", label: t("optimization.rule"), align: "right" },
                    { key: "ok", label: t("optimization.satisfied"), align: "center" },
                  ]}
                  rows={cfg.constraints.map((c, i) => {
                    const v = result.constraintValues[i];
                    const tol = 1e-6 * Math.max(1, Math.abs(c.rhs));
                    const ok = c.op === "<=" ? v <= c.rhs + tol : c.op === ">=" ? v >= c.rhs - tol : Math.abs(v - c.rhs) <= tol;
                    return {
                      id: `c${i + 1}`,
                      label: constraintLabel(c),
                      value: fmtAuto(v, locale),
                      rule: `${c.op === "<=" ? "≤" : c.op === ">=" ? "≥" : "="} ${fmt(c.rhs, 4, locale)}`,
                      ok: ok ? `✓ ${t("common.yes")}` : `✗ ${t("common.no")}`,
                    };
                  })}
                />
              </Section>
            )}
          </>
        )}
        {tab === "convergence" && (convChart ? <Chart option={convChart} height={320} /> : <Note>{t("optimization.noHistory")}</Note>)}
        {tab === "frontier" && frontierRes && (
          <>
            {frontierChart && <Chart option={frontierChart} height={320} />}
            <Note>{t("optimization.frontierHint")}</Note>
            <Table
              columns={[
                { key: "rhs", label: t("optimization.rhs"), align: "right" },
                { key: "value", label: t("optimization.objective"), align: "right" },
                { key: "feasible", label: t("optimization.feasible"), align: "center" },
                ...model.decisions.map((d, i) => ({ key: `x${i}`, label: d.name, align: "right" as const })),
              ]}
              rows={frontierRes.map((p) => {
                const row: Record<string, unknown> = { rhs: fmt(p.rhs, 4, locale), value: fmtAuto(p.result.value, locale), feasible: p.result.feasible ? "✓" : "✗" };
                p.result.x.forEach((x, i) => (row[`x${i}`] = fmtAuto(x, locale)));
                return row;
              })}
            />
          </>
        )}
      </SplitLayout>
    </div>
  );
}

/** Translate the optimizer's (English) status message. */
function optimizerMessage(msg: string, t: (k: string) => string): string {
  const parts: string[] = [];
  if (msg.startsWith("Aborted")) parts.push(t("optimization.messages.aborted"));
  else if (msg.startsWith("Maximum number") || msg.startsWith("Annealing")) parts.push(t("optimization.messages.budget"));
  else if (msg.startsWith("Converged")) parts.push(t("optimization.messages.converged"));
  else return msg;
  if (msg.includes("No feasible")) parts.push(t("optimization.messages.infeasible"));
  if (msg.includes("No evaluation")) parts.push(t("optimization.messages.noEvaluation"));
  const failed = msg.indexOf("Some evaluations failed:");
  if (failed >= 0) parts.push(`${t("optimization.messages.failed")} ${msg.slice(failed + 24).trim()}`);
  return parts.join(" ");
}

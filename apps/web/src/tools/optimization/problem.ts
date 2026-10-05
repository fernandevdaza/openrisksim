/**
 * Builds an optimizer problem from the current model + the optimization dialog settings.
 * Static mode: deterministic evaluation of the workbook (decision cells as evaluator inputs).
 * Stochastic mode: a short simulation (in a worker) per candidate, objective = statistic of a forecast.
 */
import type { CellRef, RiskModel } from "@openrisksim/core";
import { createWorkbookEvaluator, runSimulationInWorker } from "@openrisksim/workbook";
import { statisticOf, type ForecastStatistic, type OptConstraint, type OptProblem, type OptVariable } from "@openrisksim/optimizer";
import { useWorkbookStore } from "../../store/workbook";
import { ToolError, cellNumber, modelForCells, parseCellRef } from "../common/workbook";

export type Mode = "static" | "stochastic";
export type Op = "<=" | ">=" | "=";

export interface ConstraintRow {
  kind: "cell" | "forecast";
  cell: string;
  forecastId: string;
  statistic: ForecastStatistic;
  threshold: number;
  op: Op;
  rhs: number;
}

export interface OptConfig {
  mode: Mode;
  objectiveForecastId: string;
  sense: "maximize" | "minimize";
  statistic: ForecastStatistic;
  threshold: number;
  trials: number;
  constraints: ConstraintRow[];
}

export interface BuiltProblem {
  problem: OptProblem;
  dispose(): void;
}

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

export function constraintId(i: number): string {
  return `c${i}`;
}

/** Decision variables of the model as optimizer variables (initial = current cell values, clamped). */
export function decisionVariables(model: RiskModel): { variables: OptVariable[]; initial: number[] } {
  const variables = model.decisions.map((d): OptVariable => ({ id: d.id, lower: d.lower, upper: d.upper, type: d.type, step: d.step }));
  const initial = model.decisions.map((d) => {
    const v = cellNumber(d.cell);
    const x = Number.isFinite(v) ? v : (d.lower + d.upper) / 2;
    return Math.min(d.upper, Math.max(d.lower, x));
  });
  return { variables, initial };
}

export function buildProblem(model: RiskModel, cfg: OptConfig, signal: AbortSignal): BuiltProblem {
  if (!model.decisions.length) throw new ToolError("optimization.errors.noDecisions");
  const objForecast = model.forecasts.find((f) => f.id === cfg.objectiveForecastId);
  if (!objForecast) throw new ToolError("common.errors.noForecast");
  const { variables, initial } = decisionVariables(model);

  // resolve constraint targets to cells / forecasts
  const cellTargets: { id: string; cell: CellRef }[] = [];
  const targets = cfg.constraints.map((c, i) => {
    if (c.kind === "cell") {
      const ref = parseCellRef(c.cell);
      if (!ref) throw new ToolError("optimization.errors.badCell", { ref: c.cell });
      const id = `__cell${i}`;
      cellTargets.push({ id, cell: ref });
      return { outputId: id, row: c };
    }
    if (!model.forecasts.some((f) => f.id === c.forecastId)) throw new ToolError("common.errors.noForecast");
    return { outputId: c.forecastId, row: c };
  });

  if (cfg.mode === "static") {
    const engine = useWorkbookStore.getState().engine;
    if (!engine) throw new ToolError("common.errors.noWorkbook");
    const outputs = [{ id: objForecast.id, cell: objForecast.cell }, ...model.forecasts.filter((f) => f.id !== objForecast.id).map((f) => ({ id: f.id, cell: f.cell })), ...cellTargets];
    const m = modelForCells(
      model,
      model.decisions.map((d) => ({ id: d.id, cell: d.cell })),
      outputs,
    );
    const ev = createWorkbookEvaluator(engine, m);
    const cache = new Map<string, Float64Array>();
    let count = 0;
    const evalAt = async (x: number[]): Promise<Float64Array> => {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const key = x.join(",");
      let out = cache.get(key);
      if (!out) {
        // the evaluator reuses its output buffer → keep a copy
        out = Float64Array.from(ev.evaluate(Float64Array.from(x)));
        cache.set(key, out);
        if (cache.size > 20000) cache.clear();
        if (++count % 20 === 0) await yieldToUi();
      }
      return out;
    };
    const index = (id: string) => outputs.findIndex((o) => o.id === id);
    const constraints: OptConstraint[] = targets.map((tg, i) => {
      const k = index(tg.outputId);
      return { id: constraintId(i), label: constraintId(i), op: tg.row.op, rhs: tg.row.rhs, evaluate: async (x) => (await evalAt(x))[k] };
    });
    return {
      problem: { variables, initial, sense: cfg.sense, objective: async (x) => (await evalAt(x))[0], constraints },
      dispose: () => ev.dispose(),
    };
  }

  // stochastic
  const engine = useWorkbookStore.getState().engine;
  if (!engine) throw new ToolError("common.errors.noWorkbook");
  if (!model.assumptions.some((a) => a.enabled)) throw new ToolError("common.errors.noAssumptions");
  const simModel: RiskModel = {
    ...model,
    forecasts: [...model.forecasts, ...cellTargets.map((c) => ({ id: c.id, name: c.id, cell: c.cell }))],
    settings: { ...model.settings, trials: Math.max(50, Math.round(cfg.trials)), seed: model.settings.seed ?? 12345, precisionControl: null },
  };
  const workbook = engine.toWorkbookData(simModel);
  const cache = new Map<string, Promise<number[]>>();
  const specs: { id: string; stat: ForecastStatistic; threshold: number }[] = [
    { id: objForecast.id, stat: cfg.statistic, threshold: cfg.threshold },
    // cell constraints use the mean of the cell over the trials (deterministic cells → their value)
    ...targets.map((tg) => (tg.row.kind === "cell" ? { id: tg.outputId, stat: "mean" as ForecastStatistic, threshold: 0 } : { id: tg.outputId, stat: tg.row.statistic, threshold: tg.row.threshold })),
  ];
  const statsAt = (x: number[]): Promise<number[]> => {
    const key = x.join(",");
    let p = cache.get(key);
    if (!p) {
      const decisionValues: Record<string, number> = {};
      model.decisions.forEach((d, i) => (decisionValues[d.id] = x[i]));
      p = runSimulationInWorker({ workbook, model: simModel, decisionValues }, undefined, signal).then((res) =>
        specs.map((s) => {
          const f = res.forecasts[s.id];
          return f ? statisticOf(f.values, s.stat, s.threshold) : NaN;
        }),
      );
      cache.set(key, p);
      p.catch(() => cache.delete(key));
    }
    return p;
  };
  const constraints: OptConstraint[] = targets.map((tg, i) => ({
    id: constraintId(i),
    label: constraintId(i),
    op: tg.row.op,
    rhs: tg.row.rhs,
    evaluate: async (x) => (await statsAt(x))[i + 1],
  }));
  return {
    problem: { variables, initial, sense: cfg.sense, objective: async (x) => (await statsAt(x))[0], constraints },
    dispose: () => cache.clear(),
  };
}

/** Round decision values to their type (integer / binary / discrete step) before writing them. */
export function roundToType(model: RiskModel, x: number[]): number[] {
  return model.decisions.map((d, i) => {
    let v = Math.min(d.upper, Math.max(d.lower, x[i]));
    if (d.type === "integer") v = Math.round(v);
    else if (d.type === "binary") v = v >= 0.5 ? 1 : 0;
    else if (d.type === "discrete") {
      const step = d.step && d.step > 0 ? d.step : 1;
      v = d.lower + Math.round((v - d.lower) / step) * step;
    }
    return v;
  });
}

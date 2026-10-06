/**
 * Sensitivity analysis: rank-correlation sensitivity from simulation results and deterministic
 * one-at-a-time analyses (tornado, spider, two-way scenario table).
 */
import type { ModelEvaluator, RiskModel, SensitivityEntry, SensitivityMethod, SpiderSeries, TornadoEntry } from "@openrisksim/core";
import { createDistribution } from "./deps";
import { averageRanks } from "./numeric";
import { pearsonRaw, spearman } from "./stats";

/**
 * Spearman rank correlation between each assumption's samples and the forecast values (trials where the
 * forecast is NaN are skipped). contributionToVariance = ρ²/Σρ². Sorted by |ρ| descending.
 * Assumptions with constant samples (e.g. `fixed`) get ρ = 0.
 */
export function computeSensitivity(
  assumptionSamples: Record<string, Float64Array>,
  forecastValues: Float64Array,
): SensitivityEntry[] {
  const n = forecastValues.length;
  const valid: number[] = [];
  for (let i = 0; i < n; i++) if (!Number.isNaN(forecastValues[i])) valid.push(i);
  const m = valid.length;
  const f = new Float64Array(m);
  for (let t = 0; t < m; t++) f[t] = forecastValues[valid[t]];
  const fRanks = m >= 2 ? averageRanks(f) : f;

  const buf = new Float64Array(m);
  const entries: SensitivityEntry[] = [];
  for (const [assumptionId, samples] of Object.entries(assumptionSamples)) {
    let rho = NaN;
    if (m >= 2) {
      let hasNaN = false;
      for (let t = 0; t < m; t++) {
        const v = valid[t] < samples.length ? samples[valid[t]] : NaN;
        buf[t] = v;
        if (Number.isNaN(v)) hasNaN = true;
      }
      rho = hasNaN ? spearman(buf, f) : pearsonRaw(averageRanks(buf), fRanks);
    }
    entries.push({ assumptionId, rankCorrelation: Number.isFinite(rho) ? rho : 0, contributionToVariance: 0 });
  }
  let sumSq = 0;
  for (const e of entries) sumSq += e.rankCorrelation * e.rankCorrelation;
  for (const e of entries) e.contributionToVariance = sumSq > 0 ? (e.rankCorrelation * e.rankCorrelation) / sumSq : 0;
  entries.sort((a, b) => Math.abs(b.rankCorrelation) - Math.abs(a.rankCorrelation));
  return entries;
}

function evalAt(evaluator: ModelEvaluator, inputs: Float64Array, forecastIndex: number): number {
  try {
    const out = evaluator.evaluate(inputs);
    const v = forecastIndex < out.length ? out[forecastIndex] : NaN;
    return Number.isFinite(v) ? v : NaN;
  } catch {
    return NaN;
  }
}

/** Options shared by the one-at-a-time analyses (tornado, spider). */
export interface OneAtATimeOptions {
  /** Default "percentile". */
  method?: SensitivityMethod;
  /** percentile method: low/high percentiles (defaults 0.1 / 0.9). */
  pLow?: number;
  pHigh?: number;
  /** percentChange method: relative change (default 0.1 = ±10 %). */
  change?: number;
  /**
   * Assumptions moved together as one variable (ids). Assumptions not listed are moved alone.
   * Useful when one concept is split over several cells (e.g. production per year).
   */
  groups?: string[][];
}

interface Variable {
  ids: string[];
  /** Positions of the variable's assumptions in the evaluator input vector. */
  idx: number[];
}

/** Enabled assumptions folded into variables, respecting `groups` (first occurrence keeps the order). */
function variablesOf(model: RiskModel, groups: string[][] = []): Variable[] {
  const enabled = model.assumptions.filter((a) => a.enabled);
  const pos = new Map(enabled.map((a, j) => [a.id, j] as const));
  const groupOf = new Map<string, number>();
  groups.forEach((g, gi) => g.forEach((id) => pos.has(id) && !groupOf.has(id) && groupOf.set(id, gi)));
  const vars: Variable[] = [];
  const byGroup = new Map<number, Variable>();
  for (const a of enabled) {
    const gi = groupOf.get(a.id);
    if (gi === undefined) {
      vars.push({ ids: [a.id], idx: [pos.get(a.id)!] });
      continue;
    }
    let v = byGroup.get(gi);
    if (!v) {
      v = { ids: [], idx: [] };
      byGroup.set(gi, v);
      vars.push(v);
    }
    v.ids.push(a.id);
    v.idx.push(pos.get(a.id)!);
  }
  return vars;
}

/** Value of input j at position `t`: a percentile of its distribution or a relative change of its base. */
function inputAt(model: RiskModel, id: string, base: number, method: SensitivityMethod, t: number): number {
  if (method === "percentChange") return base * (1 + t);
  const a = model.assumptions.find((x) => x.id === id)!;
  return createDistribution(a.distribution).quantile(t);
}

/**
 * One-at-a-time tornado: each variable (an enabled assumption, or a group of them) is moved to its low/high
 * value — distribution percentiles (default) or base × (1 ∓ change) — with the others at base.
 * Sorted by swing descending (NaN swings last). For grouped variables lowInput/highInput are those of the
 * first assumption of the group.
 */
export function tornado(
  model: RiskModel,
  evaluator: ModelEvaluator,
  baseInputs: Float64Array,
  forecastIndex: number,
  opts: OneAtATimeOptions = {},
): TornadoEntry[] {
  const method = opts.method ?? "percentile";
  const lowT = method === "percentChange" ? -(opts.change ?? 0.1) : (opts.pLow ?? 0.1);
  const highT = method === "percentChange" ? (opts.change ?? 0.1) : (opts.pHigh ?? 0.9);
  const inputs = Float64Array.from(baseInputs);
  const baseOutput = evalAt(evaluator, inputs, forecastIndex);
  const entries: TornadoEntry[] = variablesOf(model, opts.groups).map((v) => {
    const at = (t: number) => {
      inputs.set(baseInputs);
      v.idx.forEach((j, k) => (inputs[j] = inputAt(model, v.ids[k], baseInputs[j], method, t)));
      return { first: inputs[v.idx[0]], out: evalAt(evaluator, inputs, forecastIndex) };
    };
    const lo = at(lowT);
    const hi = at(highT);
    const entry: TornadoEntry = {
      assumptionId: v.ids[0],
      baseOutput,
      lowInput: lo.first,
      highInput: hi.first,
      outputAtLow: lo.out,
      outputAtHigh: hi.out,
      swing: Math.abs(hi.out - lo.out),
    };
    if (v.ids.length > 1) entry.assumptionIds = v.ids;
    return entry;
  });
  entries.sort((a, b) => {
    const sa = Number.isNaN(a.swing) ? -Infinity : a.swing;
    const sb = Number.isNaN(b.swing) ? -Infinity : b.swing;
    return sb - sa;
  });
  return entries;
}

/**
 * Spider series: each variable moved across `positions` (others at base), in model order.
 * positions = percentiles for the percentile method (default 0.1…0.9) or relative changes for percentChange
 * (default −change…+change in 9 steps). Backward compatible: a 5th argument array means percentiles.
 */
export function spider(
  model: RiskModel,
  evaluator: ModelEvaluator,
  baseInputs: Float64Array,
  forecastIndex: number,
  positionsOrOpts: number[] | (OneAtATimeOptions & { positions?: number[] }) = {},
): SpiderSeries[] {
  const opts = Array.isArray(positionsOrOpts) ? { positions: positionsOrOpts } : positionsOrOpts;
  const method = opts.method ?? "percentile";
  const change = opts.change ?? 0.1;
  const positions =
    opts.positions ??
    (method === "percentChange"
      ? Array.from({ length: 9 }, (_, i) => -change + (2 * change * i) / 8)
      : [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
  const inputs = Float64Array.from(baseInputs);
  return variablesOf(model, opts.groups).map((v) => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const t of positions) {
      inputs.set(baseInputs);
      v.idx.forEach((j, k) => (inputs[j] = inputAt(model, v.ids[k], baseInputs[j], method, t)));
      xs.push(inputs[v.idx[0]]);
      ys.push(evalAt(evaluator, inputs, forecastIndex));
    }
    const series: SpiderSeries = { assumptionId: v.ids[0], percentiles: positions.slice(), inputs: xs, outputs: ys };
    if (v.ids.length > 1) series.assumptionIds = v.ids;
    return series;
  });
}

/**
 * Two-way data table: result[a][b] = forecast when input idxA = valuesA[a] and input idxB = valuesB[b]
 * (other inputs at base). Errors/non-finite outputs → NaN.
 */
export function scenarioTable(
  evaluator: ModelEvaluator,
  baseInputs: Float64Array,
  idxA: number,
  valuesA: number[],
  idxB: number,
  valuesB: number[],
  forecastIndex: number,
): number[][] {
  const inputs = Float64Array.from(baseInputs);
  return valuesA.map((va) =>
    valuesB.map((vb) => {
      inputs.set(baseInputs);
      inputs[idxA] = va;
      inputs[idxB] = vb;
      return evalAt(evaluator, inputs, forecastIndex);
    }),
  );
}

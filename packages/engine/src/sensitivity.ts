/**
 * Sensitivity analysis: rank-correlation sensitivity from simulation results and deterministic
 * one-at-a-time analyses (tornado, spider, two-way scenario table).
 */
import type { ModelEvaluator, RiskModel, SensitivityEntry, SpiderSeries, TornadoEntry } from "@openrisksim/core";
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

/**
 * One-at-a-time tornado: each enabled assumption (in model order, matching `baseInputs`) is set to its
 * pLow / pHigh quantile (truncation included) while the others stay at their base values.
 * Sorted by swing descending (NaN swings last).
 */
export function tornado(
  model: RiskModel,
  evaluator: ModelEvaluator,
  baseInputs: Float64Array,
  forecastIndex: number,
  opts: { pLow?: number; pHigh?: number } = {},
): TornadoEntry[] {
  const pLow = opts.pLow ?? 0.1;
  const pHigh = opts.pHigh ?? 0.9;
  const enabled = model.assumptions.filter((a) => a.enabled);
  const inputs = Float64Array.from(baseInputs);
  const baseOutput = evalAt(evaluator, inputs, forecastIndex);
  const entries: TornadoEntry[] = enabled.map((a, j) => {
    const d = createDistribution(a.distribution);
    const lowInput = d.quantile(pLow);
    const highInput = d.quantile(pHigh);
    inputs.set(baseInputs);
    inputs[j] = lowInput;
    const outputAtLow = evalAt(evaluator, inputs, forecastIndex);
    inputs.set(baseInputs);
    inputs[j] = highInput;
    const outputAtHigh = evalAt(evaluator, inputs, forecastIndex);
    return {
      assumptionId: a.id,
      baseOutput,
      lowInput,
      highInput,
      outputAtLow,
      outputAtHigh,
      swing: Math.abs(outputAtHigh - outputAtLow),
    };
  });
  entries.sort((a, b) => {
    const sa = Number.isNaN(a.swing) ? -Infinity : a.swing;
    const sb = Number.isNaN(b.swing) ? -Infinity : b.swing;
    return sb - sa;
  });
  return entries;
}

/**
 * Spider series: each enabled assumption moved across `percentiles` of its distribution (others at base).
 * Series are in model order.
 */
export function spider(
  model: RiskModel,
  evaluator: ModelEvaluator,
  baseInputs: Float64Array,
  forecastIndex: number,
  percentiles: number[] = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
): SpiderSeries[] {
  const enabled = model.assumptions.filter((a) => a.enabled);
  const inputs = Float64Array.from(baseInputs);
  return enabled.map((a, j) => {
    const d = createDistribution(a.distribution);
    const xs: number[] = [];
    const ys: number[] = [];
    for (const p of percentiles) {
      const x = d.quantile(p);
      inputs.set(baseInputs);
      inputs[j] = x;
      xs.push(x);
      ys.push(evalAt(evaluator, inputs, forecastIndex));
    }
    return { assumptionId: a.id, percentiles: percentiles.slice(), inputs: xs, outputs: ys };
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

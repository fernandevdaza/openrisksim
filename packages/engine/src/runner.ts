/**
 * Monte Carlo simulation runner.
 */
import type { ForecastResult, ModelEvaluator, RiskModel, SimulationResult, SensitivityEntry } from "@openrisksim/core";
import { createRng } from "./deps";
import { createYielder, stdNormalQuantile } from "./numeric";
import { sampleAssumptions } from "./sampling";
import { computeSensitivity } from "./sensitivity";
import { describe } from "./stats";

export interface RunOptions {
  /** Throttled: called roughly every 1% of the trials, and once at the end. */
  onProgress?: (completed: number, total: number) => void;
  /** Abort → the promise resolves with a partial result (`trials` = completed trials). */
  signal?: AbortSignal;
  /** Trials evaluated between two yields to the event loop (default 250). */
  chunkSize?: number;
}

/** Minimum number of trials before precision control may stop the run. */
const PRECISION_MIN_TRIALS = 500;

function randomSeed(): number {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (c && typeof c.getRandomValues === "function") {
    const a = new Uint32Array(1);
    c.getRandomValues(a);
    return a[0];
  }
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

function now(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

/**
 * Runs the model.
 *
 * All assumption samples are drawn up front (`sampleAssumptions`, seeded from `settings.seed`; a null
 * seed draws a random one, which is reported in `result.seed`). Trials are then evaluated in chunks,
 * yielding a macrotask between chunks so the UI/worker stays responsive and `signal` can be honoured.
 * Evaluator inputs follow the order of *enabled* assumptions; outputs follow `model.forecasts`.
 * Thrown errors and non-finite outputs are recorded as NaN and counted in `ForecastResult.errors`.
 * With `settings.precisionControl`, the run stops once the CI half-width of the target forecast mean
 * is ≤ relativeError·|mean| (checked after each chunk once ≥ 500 trials are done).
 */
export async function runSimulation(
  model: RiskModel,
  evaluator: ModelEvaluator,
  options: RunOptions = {},
): Promise<SimulationResult> {
  const t0 = now();
  const settings = model.settings;
  const total = Math.max(0, Math.floor(settings.trials || 0));
  const seed = settings.seed === null || settings.seed === undefined ? randomSeed() : settings.seed;
  const rng = createRng(seed);

  const enabled = model.assumptions.filter((a) => a.enabled);
  const k = enabled.length;
  const samplesById = sampleAssumptions(model, total, rng);
  const columns = enabled.map((a) => samplesById[a.id]);

  const forecasts = model.forecasts;
  const nf = forecasts.length;
  const values = forecasts.map(() => new Float64Array(total));
  const errors = new Array<number>(nf).fill(0);

  // Precision control state (Welford on the target forecast).
  const pc = settings.precisionControl ?? null;
  const pcIndex = pc ? forecasts.findIndex((f) => f.id === pc.forecastId) : -1;
  let pcZ = NaN;
  if (pc && pcIndex >= 0) {
    const conf = pc.confidence > 1 ? pc.confidence / 100 : pc.confidence;
    pcZ = stdNormalQuantile((1 + conf) / 2);
  }
  const pcActive = pcIndex >= 0 && Number.isFinite(pcZ) && pcZ > 0 && pc !== null && pc.relativeError > 0;
  let pcN = 0;
  let pcMean = 0;
  let pcM2 = 0;

  const chunk = Math.max(1, Math.floor(options.chunkSize ?? 250));
  const progressStep = Math.max(1, Math.ceil(total / 100));
  let lastReported = 0;
  const report = (completed: number) => {
    if (!options.onProgress || completed === lastReported) return;
    lastReported = completed;
    options.onProgress(completed, total);
  };

  const inputs = new Float64Array(k);
  const yielder = createYielder();
  let completed = 0;
  let stoppedEarly = false;
  try {
    while (completed < total) {
      if (options.signal?.aborted) break;
      const end = Math.min(total, completed + chunk);
      for (let i = completed; i < end; i++) {
        for (let j = 0; j < k; j++) inputs[j] = columns[j][i];
        let out: ArrayLike<number> | null;
        try {
          out = evaluator.evaluate(inputs);
        } catch {
          out = null;
        }
        if (out === null || out === undefined) {
          for (let f = 0; f < nf; f++) {
            values[f][i] = NaN;
            errors[f]++;
          }
          continue;
        }
        for (let f = 0; f < nf; f++) {
          let v = f < out.length ? out[f] : NaN;
          if (!Number.isFinite(v)) {
            v = NaN;
            errors[f]++;
          }
          values[f][i] = v;
        }
        if (pcActive) {
          const v = values[pcIndex][i];
          if (!Number.isNaN(v)) {
            pcN++;
            const d = v - pcMean;
            pcMean += d / pcN;
            pcM2 += d * (v - pcMean);
          }
        }
      }
      completed = end;
      if (completed - lastReported >= progressStep || completed === total) report(completed);

      if (pcActive && completed >= PRECISION_MIN_TRIALS && pcN >= 2 && completed < total) {
        const sd = Math.sqrt(pcM2 / (pcN - 1));
        const half = (pcZ * sd) / Math.sqrt(pcN);
        if (half <= pc!.relativeError * Math.abs(pcMean)) {
          stoppedEarly = true;
          break;
        }
      }
      if (completed < total) await yielder.yield();
    }
  } finally {
    yielder.dispose();
  }
  report(completed);

  const partial = completed < total;
  const assumptionSamples: Record<string, Float64Array> = {};
  for (const a of enabled) {
    const col = samplesById[a.id];
    // slice (not subarray): a view would drag the whole buffer through postMessage.
    assumptionSamples[a.id] = partial ? col.slice(0, completed) : col;
  }
  const forecastResults: Record<string, ForecastResult> = {};
  const sensitivity: Record<string, SensitivityEntry[]> = {};
  forecasts.forEach((f, idx) => {
    const v = partial ? values[idx].slice(0, completed) : values[idx];
    forecastResults[f.id] = { forecastId: f.id, values: v, stats: describe(v), errors: errors[idx] };
    sensitivity[f.id] = computeSensitivity(assumptionSamples, v);
  });

  return {
    trials: completed,
    elapsedMs: now() - t0,
    seed,
    assumptionSamples,
    forecasts: forecastResults,
    sensitivity,
    stoppedEarly,
  };
}

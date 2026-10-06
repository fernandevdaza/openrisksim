/**
 * Monte Carlo simulation runner.
 *
 * The run is split in three phases so that evaluation can be delegated to other backends (worker pools,
 * compiled JS, WebGPU) while every backend consumes exactly the same samples:
 *  1. `prepareSimulation`  — draws every assumption sample up front (MC/LHS + Iman–Conover).
 *  2. `runSimulationBatched` — evaluates the trials in batches through an (async) `BatchEvaluator`,
 *     with progress, abort and precision control.
 *  3. statistics + sensitivity on the collected outputs.
 * `runSimulation` is the classic one-trial-at-a-time API on top of the batched runner.
 */
import type { ForecastResult, ModelEvaluator, RiskModel, Rng, SimulationResult, SensitivityEntry } from "@openrisksim/core";
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

/**
 * Evaluates a batch of trials. `inputs` is row-major `n × width` (width = enabled assumptions, then any
 * `extraInputs`), the result must be row-major `n × forecasts` (NaN for failed trials). `offset` is the
 * index of the first trial of the batch in the whole run. The inputs buffer may be transferred/detached.
 * Rejecting while `signal` is aborted ends the run with a partial result; any other rejection fails it.
 */
export interface BatchEvaluator {
  evaluateBatch(inputs: Float64Array, n: number, offset: number, signal?: AbortSignal): Promise<Float64Array> | Float64Array;
}

export interface BatchedRunOptions {
  onProgress?: (completed: number, total: number) => void;
  signal?: AbortSignal;
  /** Trials per `evaluateBatch` call (default 250). */
  batchSize?: number;
  /**
   * Precision control is checked every `precisionCheckEvery` trials (default 250), independently of the
   * batch size: trials evaluated past the stopping point are discarded, so every backend stops at the
   * same trial for the same seed.
   */
  precisionCheckEvery?: number;
  /** Samples drawn beforehand with `prepareSimulation` (otherwise drawn here from `model.settings`). */
  prepared?: PreparedSimulation;
  /** Constant values appended to every input row (e.g. decision values for compiled programs). */
  extraInputs?: ArrayLike<number>;
  /** Yield a macrotask between batches so abort messages can arrive (default true). */
  yieldBetweenBatches?: boolean;
}

/** Pre-drawn samples of a run (see `prepareSimulation`). */
export interface PreparedSimulation {
  /** Seed actually used (null only when an explicit rng was passed and the model has no seed). */
  seed: number | null;
  trials: number;
  /** Ids of the enabled assumptions, in model order (= evaluator input order). */
  assumptionIds: string[];
  /** Number of enabled assumptions. */
  k: number;
  /** Per-assumption sample columns (length `trials`), keyed by assumption id. */
  samples: Record<string, Float64Array>;
  /** Same columns in input order. */
  columns: Float64Array[];
  /** Row-major `trials × k` matrix of all inputs (built lazily on first access, then cached). */
  readonly inputs: Float64Array;
  /**
   * Row-major copy of trials `[offset, offset + count)`; each row is the k assumption values followed by
   * `extra` (if any). Writes into `out` when given (must be large enough).
   */
  fillRows(offset: number, count: number, out?: Float64Array, extra?: ArrayLike<number>): Float64Array;
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
 * Draw every sample of a run up front (`sampleAssumptions` with the model's sampling method and
 * correlations). `n` defaults to `settings.trials`. Without an explicit `rng` the generator is seeded
 * from `settings.seed` (a null seed draws a random one, reported in `seed`).
 */
export function prepareSimulation(model: RiskModel, n?: number, rng?: Rng): PreparedSimulation {
  const settings = model.settings;
  const total = Math.max(0, Math.floor((n ?? settings.trials) || 0));
  let seed: number | null;
  if (rng) seed = settings.seed ?? null;
  else {
    seed = settings.seed === null || settings.seed === undefined ? randomSeed() : settings.seed;
    rng = createRng(seed);
  }
  const enabled = model.assumptions.filter((a) => a.enabled);
  const k = enabled.length;
  const samples = sampleAssumptions(model, total, rng);
  const columns = enabled.map((a) => samples[a.id]);

  const fillRows = (offset: number, count: number, out?: Float64Array, extra?: ArrayLike<number>): Float64Array => {
    const d = extra ? extra.length : 0;
    const w = k + d;
    const start = Math.max(0, Math.floor(offset));
    const cnt = Math.max(0, Math.min(Math.floor(count), total - start));
    const res = out ?? new Float64Array(cnt * w);
    for (let j = 0; j < k; j++) {
      const col = columns[j];
      for (let i = 0, p = j; i < cnt; i++, p += w) res[p] = col[start + i];
    }
    for (let e = 0; e < d; e++) {
      const v = extra![e];
      for (let i = 0, p = k + e; i < cnt; i++, p += w) res[p] = v;
    }
    return res;
  };

  let cached: Float64Array | null = null;
  return {
    seed,
    trials: total,
    assumptionIds: enabled.map((a) => a.id),
    k,
    samples,
    columns,
    get inputs() {
      if (!cached) cached = fillRows(0, total);
      return cached;
    },
    fillRows,
  };
}

/** Adapt a one-trial-at-a-time `ModelEvaluator` (errors/throws → NaN) to the batch interface. */
export function batchEvaluatorFromModelEvaluator(evaluator: ModelEvaluator, outputs: number): BatchEvaluator {
  let row = new Float64Array(0);
  return {
    evaluateBatch(inputs, n) {
      const w = n > 0 ? Math.floor(inputs.length / n) : 0;
      if (row.length !== w) row = new Float64Array(w);
      const out = new Float64Array(n * outputs);
      for (let i = 0; i < n; i++) {
        const base = i * w;
        for (let j = 0; j < w; j++) row[j] = inputs[base + j];
        let res: ArrayLike<number> | null;
        try {
          res = evaluator.evaluate(row);
        } catch {
          res = null;
        }
        const ob = i * outputs;
        if (res === null || res === undefined) {
          for (let f = 0; f < outputs; f++) out[ob + f] = NaN;
          continue;
        }
        for (let f = 0; f < outputs; f++) out[ob + f] = f < res.length ? res[f] : NaN;
      }
      return out;
    },
  };
}

/** Forecast confidence level as a fraction in (0,1) (accepts percentages; default 0.95). */
function confidenceOf(c: number | undefined): number {
  if (typeof c !== "number" || !Number.isFinite(c)) return 0.95;
  const f = c > 1 && c < 100 ? c / 100 : c;
  return f > 0 && f < 1 ? f : 0.95;
}

function isAbortError(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { name?: string }).name === "AbortError";
}

/**
 * Run the model with a batch evaluator. Produces the same `SimulationResult` as `runSimulation`
 * (identical values for the same seed and the same per-trial outputs, whatever the batch size).
 * Non-finite outputs are recorded as NaN and counted in `ForecastResult.errors`.
 */
export async function runSimulationBatched(
  model: RiskModel,
  batchEvaluator: BatchEvaluator,
  options: BatchedRunOptions = {},
): Promise<SimulationResult> {
  const t0 = now();
  const settings = model.settings;
  const prepared = options.prepared ?? prepareSimulation(model);
  const total = prepared.trials;
  const seed = prepared.seed;
  const extra = options.extraInputs;

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
  const pcEvery = Math.max(1, Math.floor(options.precisionCheckEvery ?? 250));
  let pcN = 0;
  let pcMean = 0;
  let pcM2 = 0;

  const batch = Math.max(1, Math.floor(options.batchSize ?? 250));
  const progressStep = Math.max(1, Math.ceil(total / 100));
  let lastReported = 0;
  const report = (completed: number) => {
    if (!options.onProgress || completed === lastReported) return;
    lastReported = completed;
    options.onProgress(completed, total);
  };

  const yielder = options.yieldBetweenBatches === false ? null : createYielder();
  let completed = 0;
  let stoppedEarly = false;
  try {
    while (completed < total) {
      if (options.signal?.aborted) break;
      const end = Math.min(total, completed + batch);
      const count = end - completed;
      const inputs = prepared.fillRows(completed, count, undefined, extra);
      let out: Float64Array;
      try {
        out = await batchEvaluator.evaluateBatch(inputs, count, completed, options.signal);
      } catch (e) {
        if (options.signal?.aborted || isAbortError(e)) break;
        throw e;
      }
      if (options.signal?.aborted && (!out || out.length < count * nf)) break;
      let stopAt = end;
      for (let i = completed, r = 0; i < end; i++, r += nf) {
        for (let f = 0; f < nf; f++) {
          const idx = r + f;
          let v = idx < out.length ? out[idx] : NaN;
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
          const done = i + 1;
          if (done % pcEvery === 0 && done >= PRECISION_MIN_TRIALS && pcN >= 2 && done < total) {
            const sd = Math.sqrt(pcM2 / (pcN - 1));
            const half = (pcZ * sd) / Math.sqrt(pcN);
            if (half <= pc!.relativeError * Math.abs(pcMean)) {
              stoppedEarly = true;
              stopAt = done;
              break;
            }
          }
        }
      }
      if (stoppedEarly) {
        // Trials evaluated past the stopping point are discarded (undo their error counts).
        for (let i = stopAt; i < end; i++) for (let f = 0; f < nf; f++) if (Number.isNaN(values[f][i])) errors[f]--;
        completed = stopAt;
        break;
      }
      completed = end;
      if (completed - lastReported >= progressStep || completed === total) report(completed);
      if (completed < total && yielder) await yielder.yield();
    }
  } finally {
    yielder?.dispose();
  }
  report(completed);

  const partial = completed < total;
  const assumptionSamples: Record<string, Float64Array> = {};
  prepared.assumptionIds.forEach((id, j) => {
    const col = prepared.columns[j];
    // slice (not subarray): a view would drag the whole buffer through postMessage.
    assumptionSamples[id] = partial ? col.slice(0, completed) : col;
  });
  const forecastResults: Record<string, ForecastResult> = {};
  const sensitivity: Record<string, SensitivityEntry[]> = {};
  forecasts.forEach((f, idx) => {
    const v = partial ? values[idx].slice(0, completed) : values[idx];
    forecastResults[f.id] = { forecastId: f.id, values: v, stats: describe(v, { confidence: confidenceOf(f.confidence) }), errors: errors[idx] };
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

/**
 * Runs the model one trial at a time.
 *
 * All assumption samples are drawn up front (`prepareSimulation`, seeded from `settings.seed`; a null
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
  const chunk = Math.max(1, Math.floor(options.chunkSize ?? 250));
  const prepared = prepareSimulation(model);
  const result = await runSimulationBatched(model, batchEvaluatorFromModelEvaluator(evaluator, model.forecasts.length), {
    prepared,
    batchSize: chunk,
    precisionCheckEvery: chunk,
    onProgress: options.onProgress,
    signal: options.signal,
  });
  result.elapsedMs = now() - t0;
  return result;
}

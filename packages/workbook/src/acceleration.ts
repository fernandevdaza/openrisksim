/**
 * Accelerated simulation orchestration (runs inside the simulation worker, or inline in Node/tests).
 *
 * Every mode consumes the same pre-drawn samples (`prepareSimulation`), so for a given seed the modes
 * differ only by evaluation precision:
 *  - standard:  one SpreadsheetEngine (HyperFormula), trial by trial.
 *  - multicore: a pool of workers, each with its own SpreadsheetEngine; chunks merged in trial order
 *               (bit-identical to standard).
 *  - compiled:  `@openrisksim/accel` compiles the formulas between assumptions and forecasts to JS (f64).
 *  - gpu:       the compiled program as a WebGPU compute shader (f32).
 * Compiled and GPU results are validated against the spreadsheet engine on the first trials; any
 * failure (compile, GPU init, validation, runtime) falls back gracefully and is reported in
 * `SimulationResult.backend.fallbackReason` — acceleration never makes a run fail.
 */
import type { AccelerationMode, CellRef, RiskModel, SimulationBackendInfo, SimulationProgress, SimulationResult } from "@openrisksim/core";
import { batchEvaluatorFromModelEvaluator, prepareSimulation, runSimulationBatched, type BatchEvaluator } from "@openrisksim/engine";
import { loadAccel, type AccelModule, type CompiledProgram, type FormulaSource, type GpuInfo, type GpuRunner } from "./accelDeps";
import { decisionOverrides } from "./decisions";
import { HF_CONFIG, SpreadsheetEngine } from "./engine";
import { createWorkbookEvaluator } from "./evaluator";
import { canSpawnWorkers, defaultWorkerCount, poolBatchEvaluator, webWorkerPoolFactory, type ChunkWorker, type PoolFactory } from "./pool";
import type { SimulationJob, WorkbookData } from "./types";

export type BackendMode = SimulationBackendInfo["mode"];
export interface Bilingual {
  en: string;
  es: string;
}
/** A reason reported by the compiler (cell + bilingual message). */
export interface AccelReason {
  cell: string;
  message: Bilingual;
}

/** Auto mode uses the GPU from this many trials on. */
export const AUTO_GPU_MIN_TRIALS = 20000;
/** Auto mode uses the worker pool (for models that do not compile) from this many trials on. */
export const AUTO_MULTICORE_MIN_TRIALS = 2000;
/** Trials re-evaluated with the spreadsheet engine to validate compiled / GPU results. */
export const VALIDATION_TRIALS = 200;
/** Precision control granularity (same as the classic runner's chunk size → same stopping trial). */
const PRECISION_CHECK_EVERY = 250;
export const MAX_WORKERS = 16;

const MODE_LABEL: Record<BackendMode, Bilingual> = {
  standard: { en: "Standard", es: "Estándar" },
  multicore: { en: "Multicore", es: "Multinúcleo" },
  compiled: { en: "Compiled", es: "Compilado" },
  gpu: { en: "GPU", es: "GPU" },
};

export const ACCEL_MESSAGES = {
  noWebGpu: { en: "WebGPU is not available in this browser", es: "WebGPU no está disponible en este navegador" },
  noAdapter: { en: "No compatible GPU adapter was found", es: "No se encontró un adaptador de GPU compatible" },
  gpuDisabled: { en: "GPU use is disabled", es: "El uso de la GPU está desactivado" },
  noWorkers: { en: "Web Workers cannot be started here", es: "No se pueden iniciar Web Workers aquí" },
  noAccel: { en: "The acceleration module could not be loaded", es: "No se pudo cargar el módulo de aceleración" },
} satisfies Record<string, Bilingual>;

function bi(en: string, es: string): Bilingual {
  return { en, es };
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Bilingual error text: uses the accelerator's `err.i18n = { en, es }` when present. */
function errBi(e: unknown): Bilingual {
  const i = (e as { i18n?: Partial<Bilingual> } | null)?.i18n;
  if (i && typeof i.en === "string" && typeof i.es === "string") return { en: i.en, es: i.es };
  const t = errText(e);
  return { en: t, es: t };
}

/** "B35: IRR is not supported (+2 more)" in both languages. */
export function reasonsText(reasons: AccelReason[] | undefined): Bilingual {
  if (!reasons || !reasons.length) return bi("unknown reason", "motivo desconocido");
  const r = reasons[0];
  const more = reasons.length - 1;
  const pre = r.cell ? `${r.cell}: ` : "";
  return bi(`${pre}${r.message.en}${more > 0 ? ` (+${more} more)` : ""}`, `${pre}${r.message.es}${more > 0 ? ` (+${more} más)` : ""}`);
}

// ---- Mode decision -----------------------------------------------------------------------------

export type FallbackCode = "gpu-unavailable" | "not-gpu-compatible" | "not-compiled" | "no-workers";

export interface AccelerationPlanInput {
  requested: AccelerationMode;
  trials: number;
  /** Logical CPU threads (navigator.hardwareConcurrency). */
  cpuThreads: number;
  /** Pool size that multicore would use. */
  workers: number;
  /** A worker pool can be started. */
  poolAvailable: boolean;
  /** The model compiled. */
  compiles: boolean;
  /** The compiled program can run on the GPU. */
  gpuCompatible: boolean;
  /** A GPU runner is available. */
  gpuAvailable: boolean;
}

/**
 * Which backend to use (pure decision table).
 *  - auto: gpu when available + model GPU-compatible + trials ≥ 20 000; else compiled when the model
 *    compiles; else multicore when trials ≥ 2 000 and more than one core/worker; else standard.
 *  - an explicit mode is honoured when possible; otherwise gpu → compiled → standard, compiled →
 *    standard, multicore → standard, with the reason.
 */
export function chooseAccelerationMode(p: AccelerationPlanInput): { mode: BackendMode; fallback?: FallbackCode } {
  const gpuOk = p.gpuAvailable && p.compiles && p.gpuCompatible;
  switch (p.requested) {
    case "standard":
      return { mode: "standard" };
    case "multicore":
      return p.poolAvailable ? { mode: "multicore" } : { mode: "standard", fallback: "no-workers" };
    case "compiled":
      return p.compiles ? { mode: "compiled" } : { mode: "standard", fallback: "not-compiled" };
    case "gpu": {
      if (gpuOk) return { mode: "gpu" };
      const fallback: FallbackCode = !p.compiles ? "not-compiled" : !p.gpuCompatible ? "not-gpu-compatible" : "gpu-unavailable";
      return { mode: p.compiles ? "compiled" : "standard", fallback };
    }
    case "auto":
    default:
      if (gpuOk && p.trials >= AUTO_GPU_MIN_TRIALS) return { mode: "gpu" };
      if (p.compiles) return { mode: "compiled" };
      if (p.trials >= AUTO_MULTICORE_MIN_TRIALS && p.cpuThreads > 1 && p.workers > 1 && p.poolAvailable) return { mode: "multicore" };
      return { mode: "standard" };
  }
}

// ---- Environment helpers ------------------------------------------------------------------------

export function hardwareThreads(): number {
  const n = (globalThis as { navigator?: { hardwareConcurrency?: number } }).navigator?.hardwareConcurrency;
  return typeof n === "number" && n >= 1 ? Math.floor(n) : 1;
}

/** Pool size for multicore: `settings.workers` or hardwareConcurrency − 1, clamped to [1, 16]. */
export function resolveWorkerCount(settingsWorkers: number | null | undefined, threads = hardwareThreads()): number {
  if (typeof settingsWorkers === "number" && Number.isFinite(settingsWorkers) && settingsWorkers >= 1) return Math.min(MAX_WORKERS, Math.floor(settingsWorkers));
  return defaultWorkerCount(threads);
}

function capitalizeBackend(b: string): string {
  const k = b.toLowerCase();
  const known: Record<string, string> = { metal: "Metal", vulkan: "Vulkan", d3d12: "D3D12", d3d11: "D3D11", opengl: "OpenGL", opengles: "OpenGL ES", webgpu: "WebGPU" };
  return known[k] ?? b;
}

/** "Apple M3 Pro (Metal)" / "apple metal-3" … */
export function gpuDeviceLabel(info: GpuInfo): string {
  const name = info.description?.trim() || [info.vendor, info.architecture].filter(Boolean).join(" ").trim() || "GPU";
  return info.backend ? `${name} (${capitalizeBackend(info.backend)})` : name;
}

let gpuInfoPromise: Promise<GpuInfo | null> | null = null;
/** Cached `detectGpu()` (never rejects). */
export function detectGpuCached(): Promise<GpuInfo | null> {
  if (!gpuInfoPromise) {
    gpuInfoPromise = (async () => {
      try {
        const accel = await loadAccel();
        return accel ? await accel.detectGpu() : null;
      } catch {
        return null;
      }
    })();
  }
  return gpuInfoPromise;
}

function hasWebGpuApi(): boolean {
  return !!(globalThis as { navigator?: { gpu?: unknown } }).navigator?.gpu;
}

// ---- Capabilities (for the settings UI) ---------------------------------------------------------

export interface AccelerationCapabilities {
  cpuThreads: number;
  /** Pool size used when `settings.workers` is null. */
  defaultWorkers: number;
  workersAvailable: boolean;
  /** GPU adapter info, or null with `gpuUnavailableReason`. */
  gpu: GpuInfo | null;
  gpuLabel?: string;
  gpuUnavailableReason?: Bilingual;
  compile:
    | { ok: true; formulaCount: number; inputCount: number; outputCount: number; functionsUsed: string[] }
    | { ok: false; reasons: AccelReason[] };
  /** GPU support of the compiled program (null when the model does not compile). */
  gpuSupport: { ok: true } | { ok: false; reasons: AccelReason[] } | null;
}

function isWorkbookData(x: unknown): x is WorkbookData {
  return !!x && typeof x === "object" && Array.isArray((x as WorkbookData).sheets);
}

/**
 * What acceleration can do for this browser + model: GPU (or why not), CPU threads, whether the model
 * compiles (+ reasons) and whether the compiled program runs on the GPU (+ reasons). Accepts a live
 * engine (any `FormulaSource`, e.g. the app's SpreadsheetEngine) or a WorkbookData snapshot.
 */
export async function detectAccelerationCapabilities(
  source: FormulaSource | WorkbookData,
  model: RiskModel,
  options: { decisionValues?: Record<string, number>; gpu?: boolean } = {},
): Promise<AccelerationCapabilities> {
  const threads = hardwareThreads();
  let engine: SpreadsheetEngine | null = null;
  let compile: AccelerationCapabilities["compile"];
  let gpuSupport: AccelerationCapabilities["gpuSupport"] = null;
  try {
    const src: FormulaSource = isWorkbookData(source) ? (engine = SpreadsheetEngine.fromWorkbook(source)) : source;
    const extra = decisionOverrides(model, options.decisionValues).map((d) => d.ref);
    const accel = await loadAccel();
    try {
      if (!accel) throw new Error(ACCEL_MESSAGES.noAccel.en);
      const c = accel.compileModel(src, model, { extraInputs: extra });
      if (c.ok) {
        const p = c.program;
        compile = { ok: true, formulaCount: p.formulaCount, inputCount: p.inputCount, outputCount: p.outputCount, functionsUsed: p.functionsUsed };
        gpuSupport = p.gpuSupport.ok ? { ok: true } : { ok: false, reasons: p.gpuSupport.reasons };
      } else compile = { ok: false, reasons: c.reasons };
    } catch (e) {
      compile = { ok: false, reasons: [{ cell: "", message: bi(errText(e), errText(e)) }] };
    }
  } finally {
    engine?.destroy();
  }
  let gpu: GpuInfo | null = null;
  let gpuUnavailableReason: Bilingual | undefined;
  if (options.gpu === false) gpuUnavailableReason = ACCEL_MESSAGES.gpuDisabled;
  else if (!hasWebGpuApi()) gpuUnavailableReason = ACCEL_MESSAGES.noWebGpu;
  else {
    gpu = await detectGpuCached();
    if (!gpu) gpuUnavailableReason = ACCEL_MESSAGES.noAdapter;
  }
  return {
    cpuThreads: threads,
    defaultWorkers: defaultWorkerCount(threads),
    workersAvailable: canSpawnWorkers(),
    gpu,
    gpuLabel: gpu ? gpuDeviceLabel(gpu) : undefined,
    gpuUnavailableReason,
    compile,
    gpuSupport,
  };
}

// ---- Output rounding ---------------------------------------------------------------------------

/**
 * HyperFormula (smartRounding) returns cell values rounded to `precisionRounding` significant digits;
 * apply the same rounding to compiled f64 outputs so that compiled results equal the spreadsheet's
 * whenever both agree to ~15 digits (in place; NaN/±Infinity untouched).
 */
export function roundLikeSpreadsheet(values: Float64Array): Float64Array {
  if (!HF_CONFIG.smartRounding) return values;
  const digits = HF_CONFIG.precisionRounding ?? 10;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === 0 || !Number.isFinite(v)) continue;
    const places = Math.pow(10, digits - Math.floor(Math.log10(Math.abs(v))));
    values[i] = v < 0 ? -Math.round(-v * places) / places : Math.round(v * places) / places;
  }
  return values;
}

// ---- Validation ---------------------------------------------------------------------------------

export interface ValidationTolerance {
  relTol: number;
  /** Absolute tolerance as a fraction of each output's scale (max |reference| over the checked trials). */
  absTolScale: number;
}
export const COMPILED_TOLERANCE: ValidationTolerance = { relTol: 1e-9, absTolScale: 1e-9 };
/**
 * f32 vs f64: 1e-4 relative, measured against max(|ref|, |gpu|, 1 % of the output's scale) (accel's
 * `outputCount` floor), so trials whose value is close to zero are not judged by cancellation noise.
 */
export const GPU_TOLERANCE: ValidationTolerance = { relTol: 1e-4, absTolScale: 1e-9 };

/**
 * Compare row-major `n × outputs` candidate outputs with the reference, output by output (each with an
 * absolute tolerance scaled to that output). Trials where both are non-finite are skipped; a
 * finite/non-finite mismatch fails.
 */
export function validateOutputs(
  reference: Float64Array,
  candidate: Float64Array,
  n: number,
  outputs: number,
  tol: ValidationTolerance,
  compare: AccelModule["compareOutputs"],
): { checked: number; maxRelativeError: number; passed: boolean } {
  let checked = 0;
  let maxRel = 0;
  let passed = candidate.length >= n * outputs;
  for (let f = 0; f < outputs && passed; f++) {
    const ref: number[] = [];
    const cand: number[] = [];
    let scale = 0;
    for (let i = 0; i < n; i++) {
      const a = reference[i * outputs + f];
      const b = candidate[i * outputs + f];
      const fa = Number.isFinite(a);
      const fb = Number.isFinite(b);
      if (!fa && !fb) continue;
      if (fa !== fb) {
        passed = false;
        maxRel = Infinity;
        break;
      }
      ref.push(a);
      cand.push(b);
      scale = Math.max(scale, Math.abs(a));
    }
    if (!passed || !ref.length) continue;
    const r = compare(Float64Array.from(ref), Float64Array.from(cand), { relTol: tol.relTol, absTol: tol.absTolScale * scale, outputCount: 1 });
    checked += r.checked;
    if (Number.isFinite(r.maxRelativeError)) maxRel = Math.max(maxRel, r.maxRelativeError);
    else maxRel = Infinity;
    if (!r.passed) passed = false;
  }
  return { checked, maxRelativeError: maxRel, passed };
}

// ---- Orchestration ------------------------------------------------------------------------------

export interface AccelerationEnv {
  /** Worker pool for multicore (default: Web Workers when available; null disables multicore). */
  poolFactory?: PoolFactory | null;
  /** Override navigator.hardwareConcurrency. */
  hardwareConcurrency?: number;
  /** Allow the GPU (default true). */
  gpu?: boolean;
}

interface Stage {
  mode: BackendMode;
  evaluator: BatchEvaluator;
  device?: string;
  workers?: number;
  validation?: SimulationBackendInfo["validation"];
}

/**
 * f32 can make an iterative function (IRR) fail to converge where f64 converges. Trials that come
 * back as errors from the GPU are re-evaluated with the exact compiled program on the CPU, so the GPU
 * only ever reports errors that the spreadsheet would report too. Rows are few, so this is cheap.
 */
export function repairGpuErrors(
  out: Float64Array,
  inputs: Float64Array,
  n: number,
  program: Pick<CompiledProgram, "inputCount" | "outputCount" | "evaluateBatchJs">,
): Float64Array {
  const k = program.inputCount;
  const m = program.outputCount;
  const bad: number[] = [];
  for (let r = 0; r < n; r++) {
    for (let j = 0; j < m; j++) {
      if (Number.isNaN(out[r * m + j])) {
        bad.push(r);
        break;
      }
    }
  }
  if (bad.length === 0) return out;
  const rows = new Float64Array(bad.length * k);
  bad.forEach((r, i) => rows.set(inputs.subarray(r * k, r * k + k), i * k));
  const fixed = roundLikeSpreadsheet(program.evaluateBatchJs(rows, bad.length));
  bad.forEach((r, i) => out.set(fixed.subarray(i * m, i * m + m), r * m));
  return out;
}

function now(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function isAbort(e: unknown, signal?: AbortSignal): boolean {
  return !!signal?.aborted || (!!e && typeof e === "object" && (e as { name?: string }).name === "AbortError");
}

function normalizeMode(m: unknown): AccelerationMode {
  return m === "standard" || m === "multicore" || m === "compiled" || m === "gpu" || m === "auto" ? m : "auto";
}

/**
 * Run a simulation job with the acceleration mode of `job.model.settings.acceleration` (default auto).
 * Always resolves with a result when the plain spreadsheet engine could (acceleration problems only
 * downgrade the backend); `result.backend` describes what was used.
 */
export async function runAcceleratedSimulation(
  job: SimulationJob,
  onProgress?: (p: SimulationProgress) => void,
  signal?: AbortSignal,
  env: AccelerationEnv = {},
): Promise<SimulationResult> {
  const t0 = now();
  const model = job.model;
  const settings = model.settings;
  const requested = normalizeMode(settings.acceleration);
  const lang = job.locale === "es" ? "es" : "en";
  const total = Math.max(0, Math.floor(settings.trials || 0));
  const nf = model.forecasts.length;
  const threads = env.hardwareConcurrency ?? hardwareThreads();
  const workers = resolveWorkerCount(settings.workers, threads);
  const poolFactory = env.poolFactory === undefined ? (canSpawnWorkers() ? webWorkerPoolFactory : null) : env.poolFactory;
  const overrides = decisionOverrides(model, job.decisionValues);
  const extra = overrides.map((o) => o.value);
  const extraRefs: CellRef[] = overrides.map((o) => o.ref);
  const width = model.assumptions.filter((a) => a.enabled).length + extra.length;

  const fallbacks: string[] = [];
  const addFallback = (m: Bilingual) => fallbacks.push(m[lang]);

  const engine = SpreadsheetEngine.fromWorkbook(job.workbook);
  const cleanup: (() => void)[] = [];
  try {
    // 1. Compile (only for modes that can use it).
    let program: CompiledProgram | null = null;
    let compileReason: Bilingual | undefined;
    const wantsCompiler = requested === "auto" || requested === "compiled" || requested === "gpu";
    const accel = wantsCompiler ? await loadAccel() : null;
    if (wantsCompiler && !accel) compileReason = ACCEL_MESSAGES.noAccel;
    if (accel) {
      try {
        const c = accel.compileModel(engine, model, { extraInputs: extraRefs });
        if (c.ok) {
          if (c.program.inputCount !== width || c.program.outputCount !== nf) {
            compileReason = bi("compiled program has an unexpected shape", "el programa compilado tiene una forma inesperada");
          } else program = c.program;
        } else compileReason = reasonsText(c.reasons);
      } catch (e) {
        compileReason = bi(errText(e), errText(e));
      }
    }
    const gpuCompatible = !!program && program.gpuSupport.ok;
    const gpuIncompatReason = program && !program.gpuSupport.ok ? reasonsText(program.gpuSupport.reasons) : undefined;

    // 2. GPU (only when it could actually be chosen).
    let gpuRunner: GpuRunner | null = null;
    let gpuReason: Bilingual | undefined;
    const wantGpu = !!program && gpuCompatible && (requested === "gpu" || (requested === "auto" && total >= AUTO_GPU_MIN_TRIALS));
    if (wantGpu) {
      if (env.gpu === false) gpuReason = ACCEL_MESSAGES.gpuDisabled;
      else if (!hasWebGpuApi()) gpuReason = ACCEL_MESSAGES.noWebGpu;
      else {
        let info: GpuInfo | null = null;
        try {
          info = await accel!.detectGpu();
        } catch {
          info = null;
        }
        if (!info) gpuReason = ACCEL_MESSAGES.noAdapter;
        else {
          try {
            gpuRunner = await accel!.createGpuRunner(program!);
            const r = gpuRunner;
            cleanup.push(() => r.dispose());
          } catch (e) {
            const m = errBi(e);
            gpuReason = bi(`GPU initialisation failed: ${m.en}`, `Falló la inicialización de la GPU: ${m.es}`);
          }
        }
      }
    }

    const plan = chooseAccelerationMode({
      requested,
      trials: total,
      cpuThreads: threads,
      workers,
      poolAvailable: !!poolFactory,
      compiles: !!program,
      gpuCompatible,
      gpuAvailable: !!gpuRunner,
    });
    if (plan.fallback) {
      const why: Bilingual =
        plan.fallback === "no-workers"
          ? ACCEL_MESSAGES.noWorkers
          : plan.fallback === "not-compiled"
            ? bi(`The model cannot be compiled — ${compileReason?.en ?? "?"}`, `El modelo no se puede compilar — ${compileReason?.es ?? "?"}`)
            : plan.fallback === "not-gpu-compatible"
              ? bi(`Not GPU-compatible — ${gpuIncompatReason?.en ?? "?"}`, `No compatible con GPU — ${gpuIncompatReason?.es ?? "?"}`)
              : (gpuReason ?? ACCEL_MESSAGES.noAdapter);
      addFallback(why);
    } else if (requested === "auto" && wantGpu && !gpuRunner && gpuReason && gpuReason !== ACCEL_MESSAGES.noWebGpu && gpuReason !== ACCEL_MESSAGES.noAdapter) {
      // auto wanted the GPU and it broke (not merely absent): worth telling.
      addFallback(gpuReason);
    }
    if (gpuRunner && plan.mode !== "gpu") {
      gpuRunner.dispose();
      gpuRunner = null;
    }

    // 3. Reference evaluator (standard mode, validation and last-resort fallback).
    const sheetEv = createWorkbookEvaluator(engine, model, { decisions: overrides });
    cleanup.push(() => sheetEv.dispose());
    const sheetBatch = batchEvaluatorFromModelEvaluator(sheetEv, nf);
    const prepared = prepareSimulation(model, total);
    const nVal = Math.min(VALIDATION_TRIALS, total);
    let refOut: Float64Array | null = null;
    const valRows = () => prepared.fillRows(0, nVal, undefined, extra);
    const reference = () => (refOut ??= sheetBatch.evaluateBatch(valRows(), nVal, 0) as Float64Array);

    const stages: Stage[] = [];
    const tryCompiled = (): boolean => {
      if (!program) return false;
      const prog = program;
      try {
        const cand = roundLikeSpreadsheet(prog.evaluateBatchJs(valRows(), nVal));
        const v = validateOutputs(reference(), cand, nVal, nf, COMPILED_TOLERANCE, accel!.compareOutputs);
        if (!v.passed) {
          addFallback(
            bi(
              `Compiled results did not match the spreadsheet engine (max. relative error ${v.maxRelativeError.toExponential(2)})`,
              `Los resultados compilados no coinciden con el motor de hoja de cálculo (error relativo máx. ${v.maxRelativeError.toExponential(2)})`,
            ),
          );
          return false;
        }
        stages.push({
          mode: "compiled",
          device: "CPU (JavaScript)",
          validation: v,
          evaluator: { evaluateBatch: (inputs, n) => roundLikeSpreadsheet(prog.evaluateBatchJs(inputs, n)) },
        });
        return true;
      } catch (e) {
        addFallback(bi(`Compiled evaluation failed: ${errText(e)}`, `Falló la evaluación compilada: ${errText(e)}`));
        return false;
      }
    };

    if (plan.mode === "gpu" && gpuRunner) {
      const runner = gpuRunner;
      try {
        const cand = await runner.evaluate(valRows(), nVal, { signal });
        const v = validateOutputs(reference(), cand, nVal, nf, GPU_TOLERANCE, accel!.compareOutputs);
        if (v.passed) {
          stages.push({
            mode: "gpu",
            device: gpuDeviceLabel(runner.info),
            validation: v,
            evaluator: {
              evaluateBatch: async (inputs, n, _o, sig) =>
                repairGpuErrors(await runner.evaluate(inputs, n, { signal: sig }), inputs, n, program!),
            },
          });
        } else {
          addFallback(
            bi(
              `GPU results did not match the spreadsheet engine (max. relative error ${v.maxRelativeError.toExponential(2)})`,
              `Los resultados de la GPU no coinciden con el motor de hoja de cálculo (error relativo máx. ${v.maxRelativeError.toExponential(2)})`,
            ),
          );
        }
      } catch (e) {
        if (!isAbort(e, signal)) {
          const m = errBi(e);
          addFallback(bi(`GPU evaluation failed: ${m.en}`, `Falló la evaluación en GPU: ${m.es}`));
        }
      }
      tryCompiled();
    } else if (plan.mode === "compiled") {
      tryCompiled();
    } else if (plan.mode === "multicore" && poolFactory) {
      try {
        const pool: ChunkWorker[] = await poolFactory(workers, { workbook: job.workbook, model, decisionValues: job.decisionValues });
        cleanup.push(() => pool.forEach((w) => w.terminate()));
        const batch = Math.max(workers * 256, Math.ceil(total / 50));
        stages.push({
          mode: "multicore",
          device: `${pool.length} CPU workers`,
          workers: pool.length,
          evaluator: poolBatchEvaluator(pool, nf, Math.max(64, Math.ceil(batch / (pool.length * 4)))),
        });
      } catch (e) {
        addFallback(bi(`The worker pool could not start: ${errText(e)}`, `No se pudo iniciar el grupo de workers: ${errText(e)}`));
      }
    }
    stages.push({ mode: "standard", evaluator: sheetBatch });

    // 4. Batch size from the primary stage.
    const primary = stages[0];
    let batchSize = 250;
    if (primary.mode === "multicore") batchSize = Math.min(200_000, Math.max((primary.workers ?? 1) * 256, Math.ceil(total / 50)));
    else if (primary.mode === "compiled") batchSize = Math.min(250_000, Math.max(2048, Math.ceil(total / 100)));
    else if (primary.mode === "gpu" && gpuRunner) {
      const bytesPerRow = 4 * Math.max(1, width, nf);
      const byMemory = Math.floor((gpuRunner.info.maxStorageBufferBindingSize || 128 * 1024 * 1024) / bytesPerRow);
      batchSize = Math.max(1024, Math.min(1 << 20, byMemory, Math.max(16384, Math.ceil(total / 25))));
    }

    // 5. Run, falling back stage by stage on runtime failures.
    let active = 0;
    const chain: BatchEvaluator = {
      async evaluateBatch(inputs, n, offset, sig) {
        for (;;) {
          const st = stages[active];
          const last = active === stages.length - 1;
          try {
            return await st.evaluator.evaluateBatch(inputs, n, offset, sig);
          } catch (e) {
            if (last || isAbort(e, sig)) throw e;
            const L = MODE_LABEL[st.mode];
            const m = errBi(e);
            addFallback(bi(`${L.en} evaluation failed mid-run: ${m.en}`, `${L.es}: falló la evaluación durante la ejecución: ${m.es}`));
            active++;
          }
        }
      },
    };

    const result = await runSimulationBatched(model, chain, {
      prepared,
      extraInputs: extra,
      batchSize,
      precisionCheckEvery: PRECISION_CHECK_EVERY,
      signal,
      onProgress: onProgress ? (completed, t) => onProgress({ type: "progress", completed, total: t }) : undefined,
    });
    const elapsed = now() - t0;
    const used = stages[active];
    result.elapsedMs = elapsed;
    const backend: SimulationBackendInfo = {
      mode: used.mode,
      requested,
      precision: used.mode === "gpu" ? "f32" : "f64",
      trialsPerSecond: elapsed > 0 ? result.trials / (elapsed / 1000) : 0,
    };
    if (used.device) backend.device = used.device;
    if (used.workers) backend.workers = used.workers;
    if (used.validation) backend.validation = used.validation;
    if (fallbacks.length) backend.fallbackReason = fallbacks.join(" · ");
    result.backend = backend;
    return result;
  } finally {
    for (const c of cleanup.reverse()) {
      try {
        c();
      } catch {
        /* ignore */
      }
    }
    engine.destroy();
  }
}

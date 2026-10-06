/**
 * Public contracts of @openrisksim/accel.
 */
import type { CellRef, ModelEvaluator } from "@openrisksim/core";

/** Bilingual message. */
export interface AccelMessage {
  en: string;
  es: string;
}

/** Why a cell (or the whole model) could not be compiled / run on the GPU. */
export interface AccelReason {
  /** "Sheet!A1", or "" when the reason is not tied to a cell. */
  cell: string;
  message: AccelMessage;
}

/**
 * Minimal read-only view of a workbook; SpreadsheetEngine from @openrisksim/workbook satisfies it
 * structurally.
 */
export interface FormulaSource {
  sheetNames(): string[];
  /** Formula text WITH leading "=" (e.g. "=B4*(1+B5)") or null for constants/empty. */
  getFormula(ref: CellRef): string | null;
  /** Current value; errors as { error: string }. */
  getValue(ref: CellRef): number | string | boolean | null | { error: string };
  /**
   * Optional: formula/expression of a defined name (e.g. "=Sheet1!$B$2" or "=0.1"), or null when the
   * name does not exist. When missing, the compiler also looks for a HyperFormula instance at
   * `source.hf` (as exposed by SpreadsheetEngine); otherwise formulas using names are rejected.
   */
  getNamedExpression?(name: string): string | null;
}

export interface CompileOptions {
  /** extra cells treated as inputs after the assumptions (e.g. decision variables), in order */
  extraInputs?: CellRef[];
  /**
   * Run the compiled program once on the current workbook values and compare every compiled cell
   * with the spreadsheet's current value (default true). Mismatches reject the compile.
   */
  selfCheck?: boolean;
}

export type CompileResult =
  | { ok: true; program: CompiledProgram }
  | { ok: false; reasons: AccelReason[] };

export interface CompiledProgram {
  readonly inputCount: number;
  readonly outputCount: number;
  /** Number of formula cells compiled (for UI: "compiled 214 formulas"). */
  readonly formulaCount: number;
  /** Functions/features used, e.g. ["NPV","IRR","IF"] — for diagnostics. */
  readonly functionsUsed: string[];
  /** Whether the program can run on the GPU (some functions may be CPU-only); with reasons if not. */
  readonly gpuSupport: { ok: true } | { ok: false; reasons: AccelReason[] };
  /** Exact f64 JS evaluator (same semantics as the spreadsheet; errors → NaN). Single trial, like ModelEvaluator. */
  createJsEvaluator(): ModelEvaluator;
  /** Batch JS evaluation: inputs row-major n×inputCount → outputs row-major n×outputCount. */
  evaluateBatchJs(inputs: Float64Array, n: number, out?: Float64Array): Float64Array;
  /** WGSL source of the compute shader (for debugging / docs). Throws if !gpuSupport.ok. */
  toWGSL(): string;
}

export interface GpuInfo {
  vendor: string;
  architecture: string;
  description: string;
  /** e.g. "Metal", "Vulkan", "D3D12" when guessable from adapter info / UA */
  backend?: string;
  isFallbackAdapter: boolean;
  maxStorageBufferBindingSize: number;
  maxComputeWorkgroupsPerDimension: number;
}

export interface GpuRunner {
  readonly info: GpuInfo;
  /**
   * inputs row-major n×inputCount (f64 converted to f32 internally, chunked to respect buffer
   * limits) → outputs row-major n×outputCount as Float64Array (NaN for errors).
   * Aborting rejects with an Error named "AbortError" (checked between chunks).
   */
  evaluate(
    inputs: Float64Array,
    n: number,
    options?: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void },
  ): Promise<Float64Array>;
  dispose(): void;
}

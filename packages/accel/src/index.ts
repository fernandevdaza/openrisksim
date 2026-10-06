/**
 * @openrisksim/accel — compiles the formulas between assumption and forecast cells into a fast
 * f64 JS function and a WebGPU (WGSL, f32) compute shader.
 */
export type {
  AccelMessage,
  AccelReason,
  FormulaSource,
  CompileOptions,
  CompileResult,
  CompiledProgram,
  GpuInfo,
  GpuRunner,
} from "./types";
export { compileModel, SUPPORTED_FUNCTIONS } from "./compile";
export { detectGpu, createGpuRunner } from "./gpu";
export { compareOutputs } from "./compare";
export type { CompareOptions } from "./compare";
export { parseFormula, FormulaParseError } from "./parser";

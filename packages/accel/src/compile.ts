/**
 * compileModel: dependency analysis → typed IR → JS (f64) + WGSL (f32) back-ends, plus a
 * self-check against the spreadsheet's current values.
 */
import type { ModelEvaluator, RiskModel } from "@openrisksim/core";
import { evalProgramSlots, makeInterpreterBatch } from "./interp";
import type { ProgramIR } from "./ir";
import type { BatchFn } from "./jsgen";
import { compileJs } from "./jsgen";
import { CompileError, lowerModel } from "./lower";
import type { AccelReason, CompileOptions, CompileResult, CompiledProgram, FormulaSource } from "./types";
import { generateWgsl, gpuReasons } from "./wgsl";

export { SUPPORTED_FUNCTIONS } from "./lower";

/** Internal accessors used by the GPU runner and tests. */
export interface CompiledProgramInternal extends CompiledProgram {
  readonly ir: ProgramIR;
  /** "codegen" or "interpreter" (when `new Function` is unavailable). */
  readonly jsMode: "codegen" | "interpreter";
  readonly jsSource: string | null;
}

const SELF_CHECK_REL = 1e-9;
const SELF_CHECK_ABS = 1e-10;

function sameValue(compiled: number, ty: string, v: number | string | boolean | null | { error: string }): boolean {
  if (v === null) return compiled === 0;
  if (typeof v === "object") return Number.isNaN(compiled);
  if (typeof v === "string") return false;
  if (typeof v === "boolean") return ty !== "num" && compiled === (v ? 1 : 0);
  if (!Number.isFinite(compiled)) return false;
  return Math.abs(compiled - v) <= SELF_CHECK_ABS + SELF_CHECK_REL * Math.max(Math.abs(v), Math.abs(compiled));
}

function fmt(v: unknown): string {
  if (typeof v === "number") return Number.isNaN(v) ? "error" : String(v);
  if (v && typeof v === "object") return String((v as { error: string }).error);
  return JSON.stringify(v);
}

export function compileModel(source: FormulaSource, model: RiskModel, options: CompileOptions = {}): CompileResult {
  let lowered: ReturnType<typeof lowerModel>;
  try {
    lowered = lowerModel(source, model, options.extraInputs ?? []);
  } catch (e) {
    if (e instanceof CompileError) return { ok: false, reasons: e.reasons };
    const m = e instanceof Error ? e.message : String(e);
    return { ok: false, reasons: [{ cell: "", message: { en: `internal compiler error: ${m}`, es: `error interno del compilador: ${m}` } }] };
  }
  const ir: ProgramIR = { inputCount: lowered.inputCount, cells: lowered.cells, outputs: lowered.outputs };

  // JS back-end (falls back to the interpreter when code generation is blocked).
  let batch: BatchFn;
  let jsMode: "codegen" | "interpreter" = "codegen";
  let jsSource: string | null = null;
  try {
    const c = compileJs(ir);
    batch = c.batch;
    jsSource = c.source;
  } catch {
    batch = makeInterpreterBatch(ir);
    jsMode = "interpreter";
  }

  // Self-check on the workbook's current values.
  if (options.selfCheck !== false) {
    const reasons = selfCheck(source, lowered, ir, batch);
    if (reasons.length) return { ok: false, reasons };
  }

  const gpu = gpuReasons(ir, lowered.cells.map((c) => c.key));
  let wgsl: string | null = null;
  if (!gpu.length) {
    try {
      wgsl = generateWgsl(ir);
    } catch (e) {
      gpu.push({ cell: "", message: { en: `WGSL generation failed: ${String(e)}`, es: `falló la generación de WGSL: ${String(e)}` } });
    }
  }

  const nIn = ir.inputCount;
  const nOut = ir.outputs.length;
  const program: CompiledProgramInternal = {
    inputCount: nIn,
    outputCount: nOut,
    formulaCount: ir.cells.length,
    functionsUsed: lowered.functionsUsed,
    gpuSupport: gpu.length ? { ok: false, reasons: gpu } : { ok: true },
    ir,
    jsMode,
    jsSource,
    createJsEvaluator(): ModelEvaluator {
      const out = new Float64Array(nOut);
      const inBuf = new Float64Array(Math.max(1, nIn));
      return {
        evaluate(inputs: Float64Array): Float64Array {
          if (inputs.length >= nIn) batch(inputs, out, 1);
          else {
            inBuf.fill(NaN);
            inBuf.set(inputs);
            batch(inBuf, out, 1);
          }
          return out;
        },
      };
    },
    evaluateBatchJs(inputs: Float64Array, n: number, out?: Float64Array): Float64Array {
      const count = Math.max(0, Math.floor(n));
      if (inputs.length < count * nIn) throw new RangeError("evaluateBatchJs: inputs too short");
      const o = out && out.length >= count * nOut ? out : new Float64Array(count * nOut);
      batch(inputs, o, count);
      return o;
    },
    toWGSL(): string {
      if (!wgsl) {
        throw new Error(
          `GPU not supported for this model: ${gpu.map((r) => (r.cell ? r.cell + ": " : "") + r.message.en).join("; ")} / ` +
            `GPU no soportada para este modelo: ${gpu.map((r) => (r.cell ? r.cell + ": " : "") + r.message.es).join("; ")}`,
        );
      }
      return wgsl;
    },
  };
  return { ok: true, program };
}

function selfCheck(source: FormulaSource, lowered: ReturnType<typeof lowerModel>, ir: ProgramIR, batch: BatchFn): AccelReason[] {
  const inputs = new Float64Array(ir.inputCount);
  for (let i = 0; i < ir.inputCount; i++) {
    let v: unknown;
    try {
      v = source.getValue(lowered.inputRefs[i]);
    } catch {
      return [];
    }
    if (typeof v !== "number" || !Number.isFinite(v)) return []; // cannot reproduce the current state
    inputs[i] = v;
  }
  const reasons: AccelReason[] = [];
  const slots = evalProgramSlots(ir, inputs);
  for (let i = 0; i < ir.cells.length && reasons.length < 10; i++) {
    const ref = lowered.cellRefs[i];
    let v: number | string | boolean | null | { error: string };
    try {
      v = source.getValue(ref);
    } catch {
      continue;
    }
    const c = slots[ir.inputCount + i];
    if (!sameValue(c, ir.cells[i].ty, v)) {
      reasons.push({
        cell: `${ref.sheet}!${ref.address}`,
        message: {
          en: `compiled result (${fmt(c)}) differs from the spreadsheet (${fmt(v)})`,
          es: `el resultado compilado (${fmt(c)}) difiere de la hoja de cálculo (${fmt(v)})`,
        },
      });
    }
  }
  if (reasons.length) return reasons;
  // Generated code must agree with the interpreter.
  const out = new Float64Array(ir.outputs.length);
  batch(inputs, out, 1);
  const outInterp = new Float64Array(ir.outputs.length);
  makeInterpreterBatch(ir)(inputs, outInterp, 1);
  for (let j = 0; j < out.length; j++) {
    const a = out[j];
    const b = outInterp[j];
    if (!(Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b)) || a === b)) {
      reasons.push({
        cell: "",
        message: { en: `generated code disagrees with the interpreter on output ${j + 1}`, es: `el código generado no coincide con el intérprete en la salida ${j + 1}` },
      });
    }
  }
  return reasons;
}

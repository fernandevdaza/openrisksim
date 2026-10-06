/**
 * Preparation step of scripts/gpu-check.mjs (run through Vitest so that the TS sources resolve):
 * for every example (+ a synthetic GPU-compatible model) compile the model, write the WGSL shader,
 * N sampled input vectors (f32) and the f64 JS-backend outputs for the first VALIDATE trials.
 *
 * Output directory: $ACCEL_GPU_OUT.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import type { RiskModel } from "@openrisksim/core";
import { EXAMPLES, SpreadsheetEngine } from "@openrisksim/workbook";
import type { WorkbookData } from "@openrisksim/workbook";
import { createDistribution, createRng } from "../../distributions/src/index";
import { compileModel } from "../src/index";

const OUT = process.env.ACCEL_GPU_OUT;
const N = Number(process.env.ACCEL_GPU_TRIALS ?? 1_000_000);
const VALIDATE = Math.min(N, Number(process.env.ACCEL_GPU_VALIDATE ?? 100_000));

function sample(model: RiskModel, n: number, seed: number): Float64Array {
  const enabled = model.assumptions.filter((a) => a.enabled);
  const rng = createRng(seed);
  const dists = enabled.map((a) => createDistribution(a.distribution));
  const out = new Float64Array(n * enabled.length);
  for (let t = 0; t < n; t++) for (let j = 0; j < enabled.length; j++) out[t * enabled.length + j] = dists[j].sample(rng);
  return out;
}

function synthetic(): WorkbookData {
  const S = "Hoja de cálculo";
  const cells: Record<string, { v?: number; f?: string; t?: "n" }> = {
    B1: { v: 1000, t: "n" },
    B2: { v: 0.1, t: "n" },
    B3: { v: 300, t: "n" },
    B4: { v: 0.05, t: "n" },
    A5: { f: "-B1" },
    B5: { f: "B3" },
    C5: { f: "B5*(1+$B$4)" },
    D5: { f: "C5*(1+$B$4)" },
    E5: { f: "D5*(1+$B$4)" },
    F5: { f: "E5*(1+$B$4)+50" },
    A7: { f: "A5+NPV(B2,B5:F5)" },
    B7: { f: "IRR(A5:F5)" },
    C7: { f: "IFERROR(MIRR(A5:F5,B2,0.12),-1)" },
    D7: { f: "ROUND(PMT(B2,5,-B1),2)+PV(B2,5,-B3)/10+FV(0.03,4,-100)" },
    E7: { f: "IF(AND(A7>0,B7>B2),MAX(A5:F5),MIN(A5:F5))+SUMPRODUCT(A5:F5,A5:F5)/1000000" },
    F7: { f: "ORS.PAYBACK(A5:F5)+ORS.DPAYBACK(B2,A5:F5)+ORS.PI(B2,A5:F5)+SQRT(B3)+LN(B1)+EXP(-B4)+(-B4)^2+MOD(B3,7)" },
  };
  const model: RiskModel = {
    version: 1,
    assumptions: [
      { id: "inv", name: "inv", enabled: true, cell: { sheet: S, address: "B1" }, distribution: { id: "triangular", params: { min: 800, mode: 1000, max: 1400 } } },
      { id: "rate", name: "rate", enabled: true, cell: { sheet: S, address: "B2" }, distribution: { id: "uniform", params: { min: 0.02, max: 0.2 } } },
      { id: "cf", name: "cf", enabled: true, cell: { sheet: S, address: "B3" }, distribution: { id: "normal", params: { mean: 300, stdDev: 60 }, truncate: { min: 1 } } },
      { id: "g", name: "g", enabled: true, cell: { sheet: S, address: "B4" }, distribution: { id: "normal", params: { mean: 0.05, stdDev: 0.03 } } },
    ],
    forecasts: ["A7", "B7", "C7", "D7", "E7", "F7"].map((a) => ({ id: a, name: a, cell: { sheet: S, address: a } })),
    decisions: [],
    correlations: [],
    settings: { trials: 1000, seed: 1, sampling: "monteCarlo", applyCorrelations: false },
  };
  return { model, sheets: [{ name: S, rows: 8, cols: 6, cells: cells as never }] };
}

test("prepare GPU check artifacts", () => {
  if (!OUT) throw new Error("ACCEL_GPU_OUT not set");
  const cases: { id: string; wb: WorkbookData }[] = [...EXAMPLES.map((e) => ({ id: e.id, wb: e.build() })), { id: "synthetic", wb: synthetic() }];
  const index: unknown[] = [];
  for (const c of cases) {
    const engine = SpreadsheetEngine.fromWorkbook(c.wb);
    const res = compileModel(engine, c.wb.model!);
    engine.destroy();
    if (!res.ok) throw new Error(`${c.id}: ${JSON.stringify(res.reasons)}`);
    const p = res.program;
    if (!p.gpuSupport.ok) throw new Error(`${c.id}: GPU unsupported ${JSON.stringify(p.gpuSupport.reasons)}`);
    const dir = join(OUT, c.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "shader.wgsl"), p.toWGSL());
    const inputs = sample(c.wb.model!, N, 12345);
    writeFileSync(join(dir, "inputs.f64"), Buffer.from(inputs.buffer));
    const t0 = performance.now();
    const ref = p.evaluateBatchJs(inputs, N);
    const jsMs = performance.now() - t0;
    writeFileSync(join(dir, "ref.f64"), Buffer.from(ref.buffer, 0, VALIDATE * p.outputCount * 8));
    index.push({
      id: c.id,
      inputCount: p.inputCount,
      outputCount: p.outputCount,
      formulaCount: p.formulaCount,
      functions: p.functionsUsed,
      trials: N,
      validate: VALIDATE,
      jsTrialsPerSecond: Math.round(N / (jsMs / 1000)),
      outputs: c.wb.model!.forecasts.map((f) => f.name),
    });
  }
  writeFileSync(join(OUT, "index.json"), JSON.stringify(index, null, 2));
});

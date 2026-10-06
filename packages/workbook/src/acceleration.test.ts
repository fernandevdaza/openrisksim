/**
 * Acceleration orchestration tests. `@openrisksim/accel` is replaced by an "oracle" double whose
 * compiled program evaluates with HyperFormula (so compiled results are exactly the spreadsheet's), and
 * whose GPU runner rounds to f32 (or misbehaves on demand).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccelerationMode, AssumptionDef, CellRef, RiskModel, SimulationResult } from "@openrisksim/core";
import { buildExample } from "./examples";
import { chooseAccelerationMode, repairGpuErrors, runAcceleratedSimulation, validateOutputs, type AccelerationEnv, type AccelerationPlanInput } from "./acceleration";
import { inlinePoolFactory, poolBatchEvaluator, type ChunkWorker, type PoolFactory } from "./pool";
import type { SimulationJob } from "./types";

const h = vi.hoisted(() => ({
  compile: "oracle" as "oracle" | "fail" | "wrong" | "throw",
  gpuSupport: true,
  gpu: "f32" as "f32" | "bad" | "failMidRun" | "initFail",
  gpuAvailable: true,
  gpuCalls: 0,
  compileCalls: 0,
}));

vi.mock("./accelDeps", async () => {
  const { SpreadsheetEngine } = await import("./engine");
  const { createWorkbookEvaluator } = await import("./evaluator");
  const { batchEvaluatorFromModelEvaluator } = await import("@openrisksim/engine");
  type Model = import("@openrisksim/core").RiskModel;
  const compareOutputs = (ref: Float64Array, cand: Float64Array, o: { relTol?: number; absTol?: number } = {}) => {
    const rel = o.relTol ?? 1e-9;
    const abs = o.absTol ?? 0;
    let maxRel = 0;
    let passed = ref.length === cand.length;
    for (let i = 0; i < ref.length; i++) {
      const d = Math.abs(ref[i] - cand[i]);
      maxRel = Math.max(maxRel, d / Math.max(Math.abs(ref[i]), 1e-300));
      if (!(d <= abs + rel * Math.abs(ref[i]))) passed = false;
    }
    return { checked: ref.length, maxRelativeError: maxRel, passed };
  };
  const compileModel = (source: import("./engine").SpreadsheetEngine, model: Model, options?: { extraInputs?: CellRef[] }) => {
    h.compileCalls++;
    if (h.compile === "throw") throw new Error("compiler crashed");
    if (h.compile === "fail") return { ok: false as const, reasons: [{ cell: "Flujo!B35", message: { en: "IRR is not supported", es: "TIR no está soportada" } }] };
    const wb = source.toWorkbookData(model);
    const engine = SpreadsheetEngine.fromWorkbook(wb);
    const extra = (options?.extraInputs ?? []).map(
      (cell, i): AssumptionDef => ({ id: `__x${i}`, name: "", cell, distribution: { id: "fixed", params: { value: 0 } }, enabled: true }),
    );
    const oracleModel: Model = { ...model, assumptions: [...model.assumptions.filter((a) => a.enabled), ...extra] };
    const ev = createWorkbookEvaluator(engine, oracleModel);
    const batch = batchEvaluatorFromModelEvaluator(ev, model.forecasts.length);
    const evaluateBatchJs = (inputs: Float64Array, n: number) => {
      const out = batch.evaluateBatch(inputs, n, 0) as Float64Array;
      if (h.compile === "wrong") for (let i = 0; i < out.length; i++) out[i] *= 1.001;
      return out;
    };
    const program = {
      inputCount: oracleModel.assumptions.length,
      outputCount: model.forecasts.length,
      formulaCount: 42,
      functionsUsed: ["NPV"],
      gpuSupport: h.gpuSupport ? { ok: true as const } : { ok: false as const, reasons: [{ cell: "B35", message: { en: "IRR on GPU", es: "TIR en GPU" } }] },
      createJsEvaluator: () => ev,
      evaluateBatchJs,
      toWGSL: () => "",
    };
    return { ok: true as const, program };
  };
  const info = {
    vendor: "apple",
    architecture: "metal-3",
    description: "Apple M3 Pro",
    backend: "metal",
    isFallbackAdapter: false,
    maxStorageBufferBindingSize: 1 << 27,
    maxComputeWorkgroupsPerDimension: 65535,
  };
  return {
    loadAccel: async () => ({
      compareOutputs,
      compileModel,
      detectGpu: async () => (h.gpuAvailable ? info : null),
      createGpuRunner: async (program: { evaluateBatchJs(inputs: Float64Array, n: number): Float64Array }) => {
        if (h.gpu === "initFail") throw new Error("device request failed");
        return {
          info,
          dispose() {},
          async evaluate(inputs: Float64Array, n: number) {
            h.gpuCalls++;
            if (h.gpu === "failMidRun" && h.gpuCalls > 1) throw new Error("device lost");
            const out = program.evaluateBatchJs(inputs, n);
            for (let i = 0; i < out.length; i++) out[i] = Math.fround(out[i]) * (h.gpu === "bad" ? 1.01 : 1);
            return out;
          },
        };
      },
    }),
  };
});

function withGpuApi() {
  vi.stubGlobal("navigator", { hardwareConcurrency: 8, gpu: {} });
}

afterEach(() => {
  vi.unstubAllGlobals();
  h.compile = "oracle";
  h.gpuSupport = true;
  h.gpu = "f32";
  h.gpuAvailable = true;
  h.gpuCalls = 0;
  h.compileCalls = 0;
});

function job(example: string, trials: number, acceleration: AccelerationMode, extra: Partial<RiskModel["settings"]> = {}, decisionValues?: Record<string, number>): SimulationJob {
  const wb = buildExample(example);
  const model: RiskModel = { ...wb.model!, settings: { ...wb.model!.settings, trials, seed: 2024, acceleration, ...extra } };
  return { workbook: wb, model, decisionValues };
}

const noPool: AccelerationEnv = { poolFactory: null, hardwareConcurrency: 8 };
const pool3: AccelerationEnv = { poolFactory: inlinePoolFactory, hardwareConcurrency: 8 };

function expectSameValues(a: SimulationResult, b: SimulationResult) {
  expect(a.trials).toBe(b.trials);
  for (const id of Object.keys(b.forecasts)) {
    expect(a.forecasts[id].values, id).toEqual(b.forecasts[id].values);
    expect(a.forecasts[id].errors, id).toBe(b.forecasts[id].errors);
  }
  expect(a.assumptionSamples).toEqual(b.assumptionSamples);
}

describe("chooseAccelerationMode (decision table)", () => {
  const base: AccelerationPlanInput = {
    requested: "auto",
    trials: 100000,
    cpuThreads: 8,
    workers: 7,
    poolAvailable: true,
    compiles: true,
    gpuCompatible: true,
    gpuAvailable: true,
  };
  const cases: [Partial<AccelerationPlanInput>, string, string?][] = [
    [{}, "gpu"],
    [{ trials: 19999 }, "compiled"],
    [{ trials: 20000 }, "gpu"],
    [{ gpuAvailable: false }, "compiled"],
    [{ gpuCompatible: false }, "compiled"],
    [{ compiles: false, gpuCompatible: false }, "multicore"],
    [{ compiles: false, trials: 1999 }, "standard"],
    [{ compiles: false, cpuThreads: 1, workers: 1 }, "standard"],
    [{ compiles: false, workers: 1 }, "standard"],
    [{ compiles: false, poolAvailable: false }, "standard"],
    [{ requested: "standard" }, "standard"],
    [{ requested: "multicore", trials: 10 }, "multicore"],
    [{ requested: "multicore", poolAvailable: false }, "standard", "no-workers"],
    [{ requested: "compiled", trials: 10 }, "compiled"],
    [{ requested: "compiled", compiles: false }, "standard", "not-compiled"],
    [{ requested: "gpu", trials: 10 }, "gpu"],
    [{ requested: "gpu", gpuAvailable: false }, "compiled", "gpu-unavailable"],
    [{ requested: "gpu", gpuCompatible: false }, "compiled", "not-gpu-compatible"],
    [{ requested: "gpu", compiles: false }, "standard", "not-compiled"],
  ];
  for (const [over, mode, fallback] of cases) {
    it(`${JSON.stringify(over)} → ${mode}${fallback ? ` (${fallback})` : ""}`, () => {
      const r = chooseAccelerationMode({ ...base, ...over });
      expect(r.mode).toBe(mode);
      expect(r.fallback).toBe(fallback);
    });
  }
});

describe("multicore", () => {
  it("is bit-identical to standard with the same seed (inline pool of 3)", async () => {
    const std = await runAcceleratedSimulation(job("project", 3000, "standard"), undefined, undefined, noPool);
    expect(std.backend?.mode).toBe("standard");
    const progress: number[] = [];
    const mc = await runAcceleratedSimulation(
      job("project", 3000, "multicore", { workers: 3 }),
      (p) => p.type === "progress" && progress.push(p.completed),
      undefined,
      pool3,
    );
    expect(mc.backend).toMatchObject({ mode: "multicore", requested: "multicore", workers: 3, precision: "f64" });
    expect(mc.backend?.trialsPerSecond).toBeGreaterThan(0);
    expect(mc.backend?.fallbackReason).toBeUndefined();
    expectSameValues(mc, std);
    expect(mc.forecasts.f_npv.stats).toEqual(std.forecasts.f_npv.stats);
    expect(mc.sensitivity).toEqual(std.sensitivity);
    expect(progress.at(-1)).toBe(3000);
  });

  it("merges chunks in trial order even when members finish out of order", async () => {
    const delays = [7, 0, 3];
    const members: ChunkWorker[] = delays.map((d) => ({
      async evaluate(inputs, n) {
        await new Promise((r) => setTimeout(r, d));
        const w = inputs.length / n;
        const out = new Float64Array(n);
        for (let i = 0; i < n; i++) out[i] = inputs[i * w];
        return out;
      },
      terminate() {},
    }));
    const be = poolBatchEvaluator(members, 1, 7);
    const inputs = Float64Array.from({ length: 200 }, (_, i) => i); // 100 rows × 2
    const out = (await be.evaluateBatch(inputs, 100, 0)) as Float64Array;
    expect(Array.from(out)).toEqual(Array.from({ length: 100 }, (_, i) => 2 * i));
  });

  it("applies decision values in every pool member", async () => {
    const std = await runAcceleratedSimulation(job("inventory", 600, "standard", {}, { d_order: 60 }), undefined, undefined, noPool);
    const mc = await runAcceleratedSimulation(job("inventory", 600, "multicore", { workers: 2 }, { d_order: 60 }), undefined, undefined, pool3);
    expectSameValues(mc, std);
    expect(Math.max(...Array.from(mc.forecasts.f_profit.values))).toBeLessThanOrEqual(1200 + 1e-9);
  });

  it("falls back to standard when the pool cannot start or a member dies mid-run", async () => {
    const std = await runAcceleratedSimulation(job("project", 2500, "standard"), undefined, undefined, noPool);
    const broken: PoolFactory = async () => {
      throw new Error("nested workers unsupported");
    };
    const r1 = await runAcceleratedSimulation(job("project", 2500, "multicore"), undefined, undefined, { poolFactory: broken });
    expect(r1.backend?.mode).toBe("standard");
    expect(r1.backend?.fallbackReason).toMatch(/nested workers unsupported/);
    expectSameValues(r1, std);

    let calls = 0;
    const flaky: PoolFactory = async (size, init) => {
      const members = await inlinePoolFactory(size, init);
      return members.map((m) => ({
        evaluate: (inputs, n) => (++calls > 3 ? Promise.reject(new Error("worker crashed")) : m.evaluate(inputs, n)),
        terminate: () => m.terminate(),
      }));
    };
    const r2 = await runAcceleratedSimulation(job("project", 2500, "multicore", { workers: 2 }), undefined, undefined, { poolFactory: flaky });
    expect(r2.backend?.mode).toBe("standard");
    expect(r2.backend?.fallbackReason).toMatch(/worker crashed/);
    expectSameValues(r2, std);

    const r3 = await runAcceleratedSimulation(job("project", 300, "multicore"), undefined, undefined, noPool);
    expect(r3.backend?.mode).toBe("standard");
    expect(r3.backend?.fallbackReason).toMatch(/Web Workers/);
  });

  it("precision control stops at the same trial as standard; abort returns a partial result", async () => {
    const pc = { precisionControl: { forecastId: "f_npv", relativeError: 0.05, confidence: 0.95 } };
    const std = await runAcceleratedSimulation(job("project", 20000, "standard", pc), undefined, undefined, noPool);
    expect(std.stoppedEarly).toBe(true);
    const mc = await runAcceleratedSimulation(job("project", 20000, "multicore", { ...pc, workers: 2 }), undefined, undefined, pool3);
    expect(mc.stoppedEarly).toBe(true);
    expectSameValues(mc, std);

    const ctrl = new AbortController();
    const part = await runAcceleratedSimulation(
      job("project", 50000, "multicore", { workers: 2 }),
      (p) => {
        if (p.type === "progress" && p.completed >= 1000) ctrl.abort();
      },
      ctrl.signal,
      pool3,
    );
    expect(part.trials).toBeGreaterThanOrEqual(1000);
    expect(part.trials).toBeLessThan(50000);
    expect(part.forecasts.f_npv.values).toHaveLength(part.trials);
  });
});

describe("compiled", () => {
  it("matches standard exactly and records validation", async () => {
    const std = await runAcceleratedSimulation(job("project", 2000, "standard"), undefined, undefined, noPool);
    expect(h.compileCalls).toBe(0); // standard never compiles
    const c = await runAcceleratedSimulation(job("project", 2000, "compiled"), undefined, undefined, noPool);
    expect(c.backend).toMatchObject({ mode: "compiled", requested: "compiled", precision: "f64" });
    expect(c.backend?.validation).toEqual({ checked: 400, maxRelativeError: 0, passed: true });
    expect(c.backend?.fallbackReason).toBeUndefined();
    expectSameValues(c, std);
  });

  it("passes decision values as extra inputs", async () => {
    const std = await runAcceleratedSimulation(job("inventory", 500, "standard", {}, { d_order: 60 }), undefined, undefined, noPool);
    const c = await runAcceleratedSimulation(job("inventory", 500, "compiled", {}, { d_order: 60 }), undefined, undefined, noPool);
    expect(c.backend?.mode).toBe("compiled");
    expectSameValues(c, std);
  });

  it("falls back to standard when the model does not compile, the compiler throws or validation fails", async () => {
    const std = await runAcceleratedSimulation(job("project", 600, "standard"), undefined, undefined, noPool);
    h.compile = "fail";
    const j = job("project", 600, "compiled");
    j.locale = "es";
    const r1 = await runAcceleratedSimulation(j, undefined, undefined, noPool);
    expect(r1.backend?.mode).toBe("standard");
    expect(r1.backend?.fallbackReason).toBe("El modelo no se puede compilar — Flujo!B35: TIR no está soportada");
    expectSameValues(r1, std);

    h.compile = "throw";
    const r2 = await runAcceleratedSimulation(job("project", 600, "compiled"), undefined, undefined, noPool);
    expect(r2.backend?.mode).toBe("standard");
    expect(r2.backend?.fallbackReason).toMatch(/compiler crashed/);

    h.compile = "wrong";
    const r3 = await runAcceleratedSimulation(job("project", 600, "compiled"), undefined, undefined, noPool);
    expect(r3.backend?.mode).toBe("standard");
    expect(r3.backend?.fallbackReason).toMatch(/did not match/);
    expectSameValues(r3, std);
  });
});

describe("gpu", () => {
  it("without WebGPU (Node) falls back to compiled with the reason", async () => {
    const j = job("project", 500, "gpu");
    j.locale = "es";
    const r = await runAcceleratedSimulation(j, undefined, undefined, noPool);
    expect(r.backend?.mode).toBe("compiled");
    expect(r.backend?.fallbackReason).toBe("WebGPU no está disponible en este navegador");
  });

  it("runs on the (fake) GPU in f32, validated, close to standard", async () => {
    withGpuApi();
    const std = await runAcceleratedSimulation(job("project", 1500, "standard"), undefined, undefined, noPool);
    const g = await runAcceleratedSimulation(job("project", 1500, "gpu"), undefined, undefined, noPool);
    expect(g.backend).toMatchObject({ mode: "gpu", requested: "gpu", precision: "f32", device: "Apple M3 Pro (Metal)" });
    expect(g.backend?.validation?.passed).toBe(true);
    expect(g.backend?.validation?.checked).toBe(400);
    expect(g.backend?.validation?.maxRelativeError).toBeGreaterThan(0);
    expect(g.backend?.validation?.maxRelativeError).toBeLessThan(1e-6);
    expect(g.assumptionSamples).toEqual(std.assumptionSamples);
    const rel = Math.abs(g.forecasts.f_npv.stats.mean - std.forecasts.f_npv.stats.mean) / Math.abs(std.forecasts.f_npv.stats.mean);
    expect(rel).toBeLessThan(1e-6);
  });

  it("auto picks gpu from 20 000 trials, compiled below", async () => {
    withGpuApi();
    const small = await runAcceleratedSimulation(job("loan", 500, "auto"), undefined, undefined, pool3);
    expect(small.backend).toMatchObject({ mode: "compiled", requested: "auto" });
    const big = await runAcceleratedSimulation(job("loan", 20000, "auto"), undefined, undefined, pool3);
    expect(big.backend).toMatchObject({ mode: "gpu", requested: "auto" });
    expect(big.backend?.fallbackReason).toBeUndefined();
  }, 30000);

  it("auto without a compilable model uses multicore from 2000 trials", async () => {
    h.compile = "fail";
    const r = await runAcceleratedSimulation(job("loan", 2000, "auto", { workers: 2 }), undefined, undefined, pool3);
    expect(r.backend).toMatchObject({ mode: "multicore", workers: 2 });
    expect(r.backend?.fallbackReason).toBeUndefined();
    const s = await runAcceleratedSimulation(job("loan", 1999, "auto"), undefined, undefined, pool3);
    expect(s.backend?.mode).toBe("standard");
  });

  it("falls back to compiled when GPU validation fails, init fails, or the device is lost mid-run", async () => {
    withGpuApi();
    const std = await runAcceleratedSimulation(job("project", 2000, "standard"), undefined, undefined, noPool);
    h.gpu = "bad";
    const r1 = await runAcceleratedSimulation(job("project", 2000, "gpu"), undefined, undefined, noPool);
    expect(r1.backend?.mode).toBe("compiled");
    expect(r1.backend?.fallbackReason).toMatch(/GPU results did not match/);
    expect(r1.backend?.validation?.passed).toBe(true);
    expectSameValues(r1, std);

    h.gpu = "initFail";
    const r2 = await runAcceleratedSimulation(job("project", 2000, "gpu"), undefined, undefined, noPool);
    expect(r2.backend?.mode).toBe("compiled");
    expect(r2.backend?.fallbackReason).toMatch(/device request failed/);

    h.gpu = "failMidRun";
    h.gpuCalls = 0;
    const r3 = await runAcceleratedSimulation(job("project", 2000, "gpu"), undefined, undefined, noPool);
    expect(r3.trials).toBe(2000);
    expect(r3.backend?.mode).toBe("compiled");
    expect(r3.backend?.fallbackReason).toMatch(/device lost/);
    expect(Array.from(r3.forecasts.f_npv.values).some(Number.isNaN)).toBe(false);

    h.gpuAvailable = false;
    const r4 = await runAcceleratedSimulation(job("project", 500, "gpu"), undefined, undefined, noPool);
    expect(r4.backend?.mode).toBe("compiled");
    expect(r4.backend?.fallbackReason).toMatch(/No compatible GPU adapter/);

    h.gpuAvailable = true;
    h.gpuSupport = false;
    const r5 = await runAcceleratedSimulation(job("project", 500, "gpu"), undefined, undefined, noPool);
    expect(r5.backend?.mode).toBe("compiled");
    expect(r5.backend?.fallbackReason).toBe("Not GPU-compatible — B35: IRR on GPU");
  });
});

describe("validateOutputs", () => {
  const cmp = (ref: Float64Array, cand: Float64Array, o?: { relTol?: number; absTol?: number }) => {
    let maxRel = 0;
    let passed = true;
    for (let i = 0; i < ref.length; i++) {
      const d = Math.abs(ref[i] - cand[i]);
      maxRel = Math.max(maxRel, d / Math.max(Math.abs(ref[i]), 1e-300));
      if (d > (o?.absTol ?? 0) + (o?.relTol ?? 0) * Math.abs(ref[i])) passed = false;
    }
    return { checked: ref.length, maxRelativeError: maxRel, passed };
  };
  it("scales the absolute tolerance per output and handles non-finite values", () => {
    // output 0 ~ 1e5 (abs error 1 ok with 1e-4 scale), output 1 ~ 0.1
    const ref = Float64Array.of(100000, 0.1, -50000, 0.2, NaN, 0.3);
    const ok = Float64Array.of(100001, 0.10000001, -50001, 0.2, NaN, 0.3);
    expect(validateOutputs(ref, ok, 3, 2, { relTol: 1e-4, absTolScale: 1e-4 }, cmp)).toMatchObject({ checked: 5, passed: true });
    const bad = Float64Array.of(100000, 0.1, -50000, 0.2, 5, 0.3);
    expect(validateOutputs(ref, bad, 3, 2, { relTol: 1e-4, absTolScale: 1e-4 }, cmp).passed).toBe(false);
  });
});

describe("repairGpuErrors", () => {
  it("re-evaluates only the trials the GPU returned as errors, with the exact CPU program", () => {
    // program: out0 = a + b, out1 = a * b
    const evaluateBatchJs = vi.fn((inputs: Float64Array, n: number) => {
      const out = new Float64Array(n * 2);
      for (let r = 0; r < n; r++) {
        out[r * 2] = inputs[r * 2] + inputs[r * 2 + 1];
        out[r * 2 + 1] = inputs[r * 2] * inputs[r * 2 + 1];
      }
      return out;
    });
    const program = { inputCount: 2, outputCount: 2, evaluateBatchJs };
    const inputs = new Float64Array([1, 2, 3, 4, 5, 6]);
    const gpu = new Float64Array([3, 2, NaN, 12, 11, 30]); // trial 1 failed on the GPU
    const out = repairGpuErrors(gpu, inputs, 3, program);
    expect(Array.from(out)).toEqual([3, 2, 7, 12, 11, 30]);
    expect(evaluateBatchJs).toHaveBeenCalledTimes(1);
    expect(evaluateBatchJs.mock.calls[0][1]).toBe(1);
  });

  it("does nothing when there are no errors", () => {
    const evaluateBatchJs = vi.fn();
    const gpu = new Float64Array([1, 2]);
    expect(repairGpuErrors(gpu, new Float64Array([0, 0]), 1, { inputCount: 2, outputCount: 2, evaluateBatchJs })).toBe(gpu);
    expect(evaluateBatchJs).not.toHaveBeenCalled();
  });
});

import { describe as suite, expect, it, vi } from "vitest";
import type { AssumptionDef, DistributionSpec, ModelEvaluator, RiskModel } from "@openrisksim/core";
import { emptyModel } from "@openrisksim/core";
import { batchEvaluatorFromModelEvaluator, prepareSimulation, runSimulation, runSimulationBatched, type BatchEvaluator } from "./runner";

vi.mock("./deps", async () => (await import("./test-utils")).fakeDistributionsModule());

function assumption(id: string, distribution: DistributionSpec, enabled = true): AssumptionDef {
  return { id, name: id, cell: { sheet: "S", address: id }, distribution, enabled };
}

function model(trials: number, seed: number | null = 42, sampling: "latinHypercube" | "monteCarlo" = "latinHypercube"): RiskModel {
  const m = emptyModel();
  m.assumptions = [
    assumption("A", { id: "normal", params: { mean: 10, stdDev: 2 } }),
    assumption("off", { id: "fixed", params: { value: 99 } }, false),
    assumption("B", { id: "normal", params: { mean: 5, stdDev: 1 } }),
    assumption("C", { id: "normal", params: { mean: 1, stdDev: 0.5 } }),
  ];
  m.forecasts = [
    { id: "Y", name: "Y", cell: { sheet: "S", address: "Y1" } },
    { id: "Z", name: "Z", cell: { sheet: "S", address: "Z1" } },
  ];
  m.correlations = [{ a: "A", b: "C", rho: 0.6 }];
  m.settings = { ...m.settings, trials, seed, sampling, applyCorrelations: true };
  return m;
}

const f = (x: ArrayLike<number>) => [x[0] + x[1] * x[2], x[0] - x[1] < 4.5 ? NaN : x[0] - x[1]];
const scalar: ModelEvaluator = { evaluate: (x) => Float64Array.from(f(x)) };

/** Pure batch evaluator (async), as an accelerated backend would be. */
function asyncBatch(calls?: number[]): BatchEvaluator {
  return {
    async evaluateBatch(inputs, n, offset) {
      calls?.push(offset);
      const w = inputs.length / n;
      const out = new Float64Array(n * 2);
      for (let i = 0; i < n; i++) {
        const r = f(inputs.subarray(i * w, i * w + w));
        out[i * 2] = r[0];
        out[i * 2 + 1] = r[1];
      }
      await Promise.resolve();
      return out;
    },
  };
}

suite("prepareSimulation", () => {
  it("draws the same samples as runSimulation and exposes them row-major", async () => {
    const m = model(1000, 7);
    const p = prepareSimulation(m);
    expect(p.seed).toBe(7);
    expect(p.k).toBe(3);
    expect(p.assumptionIds).toEqual(["A", "B", "C"]);
    const r = await runSimulation(m, scalar);
    expect(p.samples.A).toEqual(r.assumptionSamples.A);
    expect(p.samples.C).toEqual(r.assumptionSamples.C);
    const rows = p.inputs;
    expect(rows).toHaveLength(3000);
    expect(p.inputs).toBe(rows); // cached
    expect(rows[3 * 17 + 1]).toBe(p.samples.B[17]);
    const part = p.fillRows(998, 10, undefined, [5, 6]);
    expect(part).toHaveLength(2 * 5);
    expect(Array.from(part.subarray(5, 10))).toEqual([p.samples.A[999], p.samples.B[999], p.samples.C[999], 5, 6]);
  });

  it("null seed draws and reports a random seed; explicit rng keeps the model seed", () => {
    const m = model(10, null);
    const p = prepareSimulation(m);
    expect(typeof p.seed).toBe("number");
    const replay = prepareSimulation(model(10, p.seed));
    expect(replay.samples.A).toEqual(p.samples.A);
  });
});

suite("runSimulationBatched", () => {
  for (const sampling of ["latinHypercube", "monteCarlo"] as const) {
    it(`gives identical results to runSimulation for any batch size (${sampling})`, async () => {
      const ref = await runSimulation(model(5003, 11, sampling), scalar);
      for (const batchSize of [7, 97, 250, 1000, 5003, 100000]) {
        const r = await runSimulationBatched(model(5003, 11, sampling), asyncBatch(), { batchSize });
        expect(r.trials).toBe(5003);
        expect(r.seed).toBe(11);
        expect(r.forecasts.Y.values).toEqual(ref.forecasts.Y.values);
        expect(r.forecasts.Z.values).toEqual(ref.forecasts.Z.values);
        expect(r.forecasts.Z.errors).toBe(ref.forecasts.Z.errors);
        expect(r.forecasts.Y.stats).toEqual(ref.forecasts.Y.stats);
        expect(r.sensitivity).toEqual(ref.sensitivity);
        expect(r.assumptionSamples).toEqual(ref.assumptionSamples);
      }
      expect(ref.forecasts.Z.errors).toBeGreaterThan(0);
    });
  }

  it("passes offsets in order, appends extra inputs and accepts a prepared run", async () => {
    const m = model(1000, 3);
    const prepared = prepareSimulation(m);
    const seen: number[] = [];
    const widths = new Set<number>();
    const r = await runSimulationBatched(
      m,
      {
        evaluateBatch(inputs, n, offset) {
          seen.push(offset);
          widths.add(inputs.length / n);
          const out = new Float64Array(n * 2);
          for (let i = 0; i < n; i++) {
            expect(inputs[i * 5 + 3]).toBe(-1);
            expect(inputs[i * 5]).toBe(prepared.samples.A[offset + i]);
            out[i * 2] = inputs[i * 5 + 4];
          }
          return out;
        },
      },
      { prepared, batchSize: 300, extraInputs: [-1, 8] },
    );
    expect(seen).toEqual([0, 300, 600, 900]);
    expect([...widths]).toEqual([5]);
    expect(r.forecasts.Y.stats.mean).toBe(8);
  });

  it("precision control stops at the same trial whatever the batch size", async () => {
    const mk = () => {
      const m = model(100000, 5);
      m.settings.precisionControl = { forecastId: "Y", relativeError: 0.005, confidence: 0.95 };
      return m;
    };
    const ref = await runSimulation(mk(), scalar);
    expect(ref.stoppedEarly).toBe(true);
    for (const batchSize of [100, 4096, 100000]) {
      const r = await runSimulationBatched(mk(), asyncBatch(), { batchSize });
      expect(r.stoppedEarly).toBe(true);
      expect(r.trials).toBe(ref.trials);
      expect(r.forecasts.Y.values).toEqual(ref.forecasts.Y.values);
      expect(r.forecasts.Z.errors).toBe(ref.forecasts.Z.errors);
    }
  });

  it("abort mid-batch (rejecting evaluator) returns the completed batches", async () => {
    const ctrl = new AbortController();
    const r = await runSimulationBatched(
      model(10000, 1),
      {
        async evaluateBatch(inputs, n, offset, signal) {
          if (offset >= 3000) {
            ctrl.abort();
            expect(signal?.aborted).toBe(true);
            throw Object.assign(new Error("aborted"), { name: "AbortError" });
          }
          return asyncBatch().evaluateBatch(inputs, n, offset);
        },
      },
      { batchSize: 1000, signal: ctrl.signal },
    );
    expect(r.trials).toBe(3000);
    expect(r.assumptionSamples.A).toHaveLength(3000);
    expect(r.forecasts.Y.values).toHaveLength(3000);
  });

  it("propagates evaluator failures that are not aborts", async () => {
    await expect(
      runSimulationBatched(model(100), {
        evaluateBatch() {
          throw new Error("device lost");
        },
      }),
    ).rejects.toThrow("device lost");
  });

  it("batchEvaluatorFromModelEvaluator maps throws/short outputs to NaN", async () => {
    let i = 0;
    const be = batchEvaluatorFromModelEvaluator(
      {
        evaluate(x) {
          i++;
          if (i === 2) throw new Error("x");
          if (i === 3) return Float64Array.of(x[0]);
          return Float64Array.of(x[0], x[1]);
        },
      },
      2,
    );
    const out = await be.evaluateBatch(Float64Array.of(1, 2, 3, 4, 5, 6), 3, 0);
    expect(Array.from(out)).toEqual([1, 2, NaN, NaN, 5, NaN]);
  });
});

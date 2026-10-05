import { describe as suite, expect, it, vi } from "vitest";
import type { AssumptionDef, DistributionSpec, ModelEvaluator, RiskModel } from "@openrisksim/core";
import { emptyModel } from "@openrisksim/core";
import { runSimulation } from "./runner";

vi.mock("./deps", async () => (await import("./test-utils")).fakeDistributionsModule());

function assumption(id: string, distribution: DistributionSpec, enabled = true): AssumptionDef {
  return { id, name: id, cell: { sheet: "S", address: id }, distribution, enabled };
}

/** Y = A + B, Z = A − B with A ~ N(10, 2), B ~ N(5, 1). */
function sumModel(trials = 10000, seed: number | null = 42): RiskModel {
  const m = emptyModel();
  m.assumptions = [
    assumption("A", { id: "normal", params: { mean: 10, stdDev: 2 } }),
    assumption("B", { id: "normal", params: { mean: 5, stdDev: 1 } }),
  ];
  m.forecasts = [
    { id: "Y", name: "Y", cell: { sheet: "S", address: "C1" } },
    { id: "Z", name: "Z", cell: { sheet: "S", address: "C2" } },
  ];
  m.settings = { ...m.settings, trials, seed, sampling: "latinHypercube", applyCorrelations: true };
  return m;
}

const sumEvaluator: ModelEvaluator = {
  evaluate(x) {
    return Float64Array.of(x[0] + x[1], x[0] - x[1]);
  },
};

suite("runSimulation", () => {
  it("Y = A + B gives mean ≈ 15 and sd ≈ √5", async () => {
    const r = await runSimulation(sumModel(), sumEvaluator);
    expect(r.trials).toBe(10000);
    expect(r.seed).toBe(42);
    expect(r.stoppedEarly).toBe(false);
    const y = r.forecasts.Y;
    expect(y.values).toHaveLength(10000);
    expect(y.errors).toBe(0);
    expect(y.stats.mean).toBeCloseTo(15, 1);
    expect(Math.abs(y.stats.stdDev - Math.sqrt(5))).toBeLessThan(0.05);
    expect(r.forecasts.Z.stats.mean).toBeCloseTo(5, 1);
    expect(r.assumptionSamples.A).toHaveLength(10000);
    expect(r.elapsedMs).toBeGreaterThanOrEqual(0);
    // Sensitivity: A explains 4/5 of the variance of Y.
    const sens = r.sensitivity.Y;
    expect(sens.map((s) => s.assumptionId)).toEqual(["A", "B"]);
    expect(sens[0].contributionToVariance).toBeCloseTo(0.8, 1);
    expect(sens[0].contributionToVariance + sens[1].contributionToVariance).toBeCloseTo(1, 12);
    expect(r.sensitivity.Z[1].rankCorrelation).toBeLessThan(0);
  });

  it("is deterministic for a given seed; null seed records the seed actually used", async () => {
    const a = await runSimulation(sumModel(2000, 7), sumEvaluator);
    const b = await runSimulation(sumModel(2000, 7), sumEvaluator);
    expect(b.forecasts.Y.values).toEqual(a.forecasts.Y.values);
    const c = await runSimulation(sumModel(2000, 8), sumEvaluator);
    expect(c.forecasts.Y.values).not.toEqual(a.forecasts.Y.values);

    const rnd = await runSimulation(sumModel(2000, null), sumEvaluator);
    expect(typeof rnd.seed).toBe("number");
    const replay = await runSimulation(sumModel(2000, rnd.seed), sumEvaluator);
    expect(replay.forecasts.Y.values).toEqual(rnd.forecasts.Y.values);
  });

  it("passes only enabled assumptions, in model order, and reuses the input buffer", async () => {
    const m = sumModel(300);
    m.assumptions.splice(1, 0, assumption("off", { id: "fixed", params: { value: 1000 } }, false));
    m.assumptions.push(assumption("K", { id: "fixed", params: { value: 3 } }));
    const seen = new Set<Float64Array>();
    const ev: ModelEvaluator = {
      evaluate(x) {
        seen.add(x);
        expect(x).toHaveLength(3);
        expect(x[2]).toBe(3);
        return Float64Array.of(x[0] + x[1] + x[2], 0);
      },
    };
    const r = await runSimulation(m, ev, { chunkSize: 50 });
    expect(seen.size).toBe(1);
    expect(Object.keys(r.assumptionSamples).sort()).toEqual(["A", "B", "K"]);
    expect(r.forecasts.Y.stats.mean).toBeCloseTo(18, 0);
    // Constant assumption gets zero sensitivity.
    expect(r.sensitivity.Y.find((s) => s.assumptionId === "K")!.rankCorrelation).toBe(0);
  });

  it("records NaN / Infinity / thrown errors as NaN and counts them", async () => {
    let i = 0;
    const ev: ModelEvaluator = {
      evaluate(x) {
        i++;
        if (i % 10 === 0) throw new Error("boom");
        if (i % 10 === 1) return Float64Array.of(NaN, 1);
        if (i % 10 === 2) return Float64Array.of(Infinity, 1);
        if (i % 10 === 3) return Float64Array.of(1); // missing second output
        return Float64Array.of(x[0], x[1]);
      },
    };
    const r = await runSimulation(sumModel(1000), ev);
    expect(r.trials).toBe(1000);
    expect(r.forecasts.Y.errors).toBe(300);
    expect(r.forecasts.Z.errors).toBe(200);
    expect(r.forecasts.Y.stats.count).toBe(700);
    expect(Number.isNaN(r.forecasts.Y.values[9])).toBe(true);
    expect(Number.isFinite(r.forecasts.Y.stats.mean)).toBe(true);
  });

  it("abort returns a partial result", async () => {
    const ctrl = new AbortController();
    const progress: number[] = [];
    const r = await runSimulation(sumModel(100000), sumEvaluator, {
      chunkSize: 1000,
      signal: ctrl.signal,
      onProgress: (done) => {
        progress.push(done);
        if (done >= 3000) ctrl.abort();
      },
    });
    expect(r.trials).toBe(3000);
    expect(r.forecasts.Y.values).toHaveLength(3000);
    expect(r.assumptionSamples.A).toHaveLength(3000);
    expect(r.forecasts.Y.stats.count).toBe(3000);
    expect(r.stoppedEarly).toBe(false);
    expect(progress).toEqual([1000, 2000, 3000]);

    const pre = new AbortController();
    pre.abort();
    const r0 = await runSimulation(sumModel(1000), sumEvaluator, { signal: pre.signal });
    expect(r0.trials).toBe(0);
    expect(r0.forecasts.Y.stats.count).toBe(0);
  });

  it("throttles progress to about 1% and always reports completion", async () => {
    const calls: [number, number][] = [];
    await runSimulation(sumModel(10000), sumEvaluator, { chunkSize: 10, onProgress: (c, t) => calls.push([c, t]) });
    expect(calls.length).toBeLessThanOrEqual(101);
    expect(calls.length).toBeGreaterThanOrEqual(50);
    expect(calls[calls.length - 1]).toEqual([10000, 10000]);
    for (let i = 1; i < calls.length; i++) expect(calls[i][0]).toBeGreaterThan(calls[i - 1][0]);
  });

  it("precision control stops early once the CI half-width is small enough", async () => {
    const m = sumModel(100000);
    m.settings.precisionControl = { forecastId: "Y", relativeError: 0.01, confidence: 0.95 };
    const r = await runSimulation(m, sumEvaluator, { chunkSize: 100 });
    expect(r.stoppedEarly).toBe(true);
    // Half-width 1.96·√5/√n ≤ 0.15 → n ≈ 900; never before 500.
    expect(r.trials).toBeGreaterThanOrEqual(500);
    expect(r.trials).toBeLessThan(2000);
    expect(r.forecasts.Y.values).toHaveLength(r.trials);
    const s = r.forecasts.Y.stats;
    expect((1.96 * s.stdDev) / Math.sqrt(s.count)).toBeLessThanOrEqual(0.01 * Math.abs(s.mean) * 1.001);

    // Unreachable precision → full run.
    m.settings.trials = 2000;
    m.settings.precisionControl = { forecastId: "Y", relativeError: 0.0001, confidence: 0.99 };
    const full = await runSimulation(m, sumEvaluator);
    expect(full.trials).toBe(2000);
    expect(full.stoppedEarly).toBe(false);
  });

  it("applies correlations from the model", async () => {
    const m = sumModel(5000);
    m.correlations = [{ a: "A", b: "B", rho: 0.8 }];
    const r = await runSimulation(m, sumEvaluator);
    const { spearman } = await import("./stats");
    expect(Math.abs(spearman(r.assumptionSamples.A, r.assumptionSamples.B) - 0.8)).toBeLessThan(0.03);
    // Var(A+B) = 4 + 1 + 2·ρp·2·1 with ρp ≈ 0.81 → sd ≈ 2.95
    expect(r.forecasts.Y.stats.stdDev).toBeGreaterThan(2.8);
  });

  it("handles a model without assumptions or forecasts", async () => {
    const m = emptyModel();
    m.settings.trials = 10;
    const r = await runSimulation(m, { evaluate: () => new Float64Array(0) });
    expect(r.trials).toBe(10);
    expect(r.forecasts).toEqual({});
  });

  it("runs 100k trials × 10 assumptions quickly", async () => {
    const m = emptyModel();
    for (let j = 0; j < 10; j++) {
      m.assumptions.push(assumption(`a${j}`, { id: "normal", params: { mean: j, stdDev: 1 } }));
    }
    m.forecasts = [{ id: "S", name: "S", cell: { sheet: "S", address: "Z1" } }];
    m.settings = { ...m.settings, trials: 100000, seed: 1, sampling: "latinHypercube" };
    const out = new Float64Array(1);
    const ev: ModelEvaluator = {
      evaluate(x) {
        let s = 0;
        for (let j = 0; j < x.length; j++) s += x[j];
        out[0] = s;
        return out;
      },
    };
    const t0 = performance.now();
    const r = await runSimulation(m, ev);
    const ms = performance.now() - t0;
    expect(r.trials).toBe(100000);
    expect(r.forecasts.S.stats.mean).toBeCloseTo(45, 1);
    // Includes sampling, evaluation, describe and 10 Spearman sensitivities. Generous bound for CI noise.
    expect(ms).toBeLessThan(1500);
  });
});

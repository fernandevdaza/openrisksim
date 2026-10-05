/**
 * Integration with the real `@openrisksim/distributions` package (the other engine tests use doubles).
 * Skipped automatically while that package has no entry point yet.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe as suite, expect, it } from "vitest";
import type { AssumptionDef, DistributionSpec, ModelEvaluator } from "@openrisksim/core";
import { emptyModel } from "@openrisksim/core";

const distributionsReady = existsSync(fileURLToPath(new URL("../../distributions/src/index.ts", import.meta.url)));

function assumption(id: string, distribution: DistributionSpec): AssumptionDef {
  return { id, name: id, cell: { sheet: "S", address: id }, distribution, enabled: true };
}

suite.skipIf(!distributionsReady)("engine × real distributions", () => {
  it("runs Y = A + B with real normals, LHS and correlation", async () => {
    const { runSimulation, spearman } = await import("./index");
    const m = emptyModel();
    m.assumptions = [
      assumption("A", { id: "normal", params: { mean: 10, stdDev: 2 } }),
      assumption("B", { id: "normal", params: { mean: 5, stdDev: 1 } }),
      assumption("L", { id: "lognormal", params: { mean: 3, stdDev: 1 } }),
      assumption("P", { id: "poisson", params: { lambda: 4 } }),
      assumption("T", { id: "triangular", params: { min: 0, mode: 2, max: 10 }, truncate: { min: 1, max: 6 } }),
    ];
    m.forecasts = [{ id: "Y", name: "Y", cell: { sheet: "S", address: "Z1" } }];
    m.correlations = [{ a: "A", b: "L", rho: 0.6 }];
    m.settings = { ...m.settings, trials: 20000, seed: 2024, sampling: "latinHypercube", applyCorrelations: true };
    const ev: ModelEvaluator = { evaluate: (x) => Float64Array.of(x[0] + x[1]) };
    const r = await runSimulation(m, ev);
    expect(r.forecasts.Y.stats.mean).toBeCloseTo(15, 1);
    expect(Math.abs(r.forecasts.Y.stats.stdDev - Math.sqrt(5))).toBeLessThan(0.05);
    const L = r.assumptionSamples.L;
    expect(L.reduce((a, b) => a + b, 0) / L.length).toBeCloseTo(3, 1);
    expect(Math.abs(spearman(r.assumptionSamples.A, L) - 0.6)).toBeLessThan(0.03);
    for (const v of r.assumptionSamples.P) expect(Number.isInteger(v)).toBe(true);
    for (const v of r.assumptionSamples.T) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
    const again = await runSimulation(m, ev);
    expect(again.forecasts.Y.values).toEqual(r.forecasts.Y.values);
  });

  it("tornado uses real quantiles", async () => {
    const { tornado } = await import("./index");
    const m = emptyModel();
    m.assumptions = [assumption("A", { id: "normal", params: { mean: 0, stdDev: 1 } })];
    const t = tornado(m, { evaluate: (x) => Float64Array.of(x[0]) }, Float64Array.of(0), 0);
    expect(t[0].lowInput).toBeCloseTo(-1.2815515655446004, 6);
    expect(t[0].highInput).toBeCloseTo(1.2815515655446004, 6);
  });

  it("Welch t-test p-value matches scipy", async () => {
    const { tTestTwoSample } = await import("./index");
    const r = tTestTwoSample([1, 2, 3, 4, 5, 6.5], [2, 4, 6, 8, 10, 13, 1]);
    expect(r.t).toBeCloseTo(-1.4711443212151227, 10);
    expect(r.df).toBeCloseTo(8.715682306789095, 10);
    expect(r.pValue).toBeCloseTo(0.17641151930643237, 6);
  });
});

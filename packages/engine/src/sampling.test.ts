import { describe as suite, expect, it, vi } from "vitest";
import type { AssumptionDef, DistributionSpec, RiskModel } from "@openrisksim/core";
import { emptyModel } from "@openrisksim/core";
import { generateUniforms, sampleAssumptions } from "./sampling";
import { spearman } from "./stats";
import { testRng } from "./test-utils";

vi.mock("./deps", async () => (await import("./test-utils")).fakeDistributionsModule());

function assumption(id: string, distribution: DistributionSpec, enabled = true): AssumptionDef {
  return { id, name: id, cell: { sheet: "S", address: "A1" }, distribution, enabled };
}

suite("generateUniforms", () => {
  it("Monte Carlo: values in (0,1), right shape, deterministic", () => {
    const u = generateUniforms(1000, 3, "monteCarlo", testRng(1));
    expect(u).toHaveLength(3);
    for (const c of u) {
      expect(c).toHaveLength(1000);
      for (const v of c) {
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThan(1);
      }
    }
    expect(generateUniforms(1000, 3, "monteCarlo", testRng(1))).toEqual(u);
    expect(generateUniforms(1000, 3, "monteCarlo", testRng(2))).not.toEqual(u);
  });

  it("Latin Hypercube: exactly one sample per stratum in every column", () => {
    for (const n of [1, 7, 100, 2500]) {
      const u = generateUniforms(n, 4, "latinHypercube", testRng(n));
      for (const c of u) {
        const seen = new Uint8Array(n);
        for (const v of c) {
          expect(v).toBeGreaterThan(0);
          expect(v).toBeLessThan(1);
          seen[Math.floor(v * n)]++;
        }
        expect(Array.from(seen).every((x) => x === 1)).toBe(true);
      }
      // Columns are independently permuted.
      if (n >= 100) expect(Math.abs(spearman(u[0], u[1]))).toBeLessThan(0.2);
    }
  });

  it("handles n = 0 and k = 0", () => {
    expect(generateUniforms(0, 2, "latinHypercube", testRng())).toEqual([new Float64Array(0), new Float64Array(0)]);
    expect(generateUniforms(10, 0, "monteCarlo", testRng())).toEqual([]);
  });
});

suite("sampleAssumptions", () => {
  function model(): RiskModel {
    const m = emptyModel();
    m.assumptions = [
      assumption("a", { id: "normal", params: { mean: 10, stdDev: 2 } }),
      assumption("off", { id: "normal", params: { mean: 0, stdDev: 1 } }, false),
      assumption("b", { id: "uniform", params: { min: 0, max: 1 } }),
      assumption("c", { id: "normal", params: { mean: 0, stdDev: 1 }, truncate: { min: -1, max: 2 } }),
    ];
    m.settings = { ...m.settings, sampling: "latinHypercube", seed: 1 };
    return m;
  }

  it("samples only enabled assumptions through the quantile function", () => {
    const s = sampleAssumptions(model(), 5000, testRng(1));
    expect(Object.keys(s).sort()).toEqual(["a", "b", "c"]);
    const a = s.a;
    let mean = 0;
    for (const v of a) mean += v;
    mean /= a.length;
    expect(mean).toBeCloseTo(10, 1);
    // LHS on uniform(0,1): exactly stratified
    const seen = new Uint8Array(5000);
    for (const v of s.b) seen[Math.floor(v * 5000)]++;
    expect(Array.from(seen).every((x) => x === 1)).toBe(true);
    // Truncation honoured
    for (const v of s.c) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(2);
    }
  });

  it("applies correlations among enabled assumptions only when requested", () => {
    const m = model();
    m.correlations = [
      { a: "a", b: "b", rho: 0.7 },
      { a: "off", b: "a", rho: 0.9 },
    ];
    const s = sampleAssumptions(m, 5000, testRng(5));
    expect(Math.abs(spearman(s.a, s.b) - 0.7)).toBeLessThan(0.03);
    expect(Math.abs(spearman(s.a, s.c))).toBeLessThan(0.05);
    // Marginal still stratified after reordering.
    const seen = new Uint8Array(5000);
    for (const v of s.b) seen[Math.floor(v * 5000)]++;
    expect(Array.from(seen).every((x) => x === 1)).toBe(true);

    m.settings.applyCorrelations = false;
    const s2 = sampleAssumptions(m, 5000, testRng(5));
    expect(Math.abs(spearman(s2.a, s2.b))).toBeLessThan(0.05);
  });

  it("is deterministic for the same rng seed", () => {
    const m = model();
    m.correlations = [{ a: "a", b: "c", rho: -0.5 }];
    expect(sampleAssumptions(m, 1000, testRng(9))).toEqual(sampleAssumptions(m, 1000, testRng(9)));
  });

  it("propagates invalid distribution errors", () => {
    const m = emptyModel();
    m.assumptions = [assumption("x", { id: "normal", params: { mean: 0, stdDev: -1 } })];
    expect(() => sampleAssumptions(m, 10, testRng())).toThrow();
  });
});

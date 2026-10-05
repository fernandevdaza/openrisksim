import { describe as suite, expect, it, vi } from "vitest";
import type { AssumptionDef, DistributionSpec, ModelEvaluator, RiskModel } from "@openrisksim/core";
import { emptyModel } from "@openrisksim/core";
import { computeSensitivity, scenarioTable, spider, tornado } from "./sensitivity";
import { testRng } from "./test-utils";

vi.mock("./deps", async () => (await import("./test-utils")).fakeDistributionsModule());

function assumption(id: string, distribution: DistributionSpec, enabled = true): AssumptionDef {
  return { id, name: id, cell: { sheet: "S", address: id }, distribution, enabled };
}

suite("computeSensitivity", () => {
  it("ranks by |spearman| and normalises contributions", () => {
    const rng = testRng(1);
    const n = 5000;
    const a = new Float64Array(n);
    const b = new Float64Array(n);
    const c = new Float64Array(n);
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      a[i] = rng.next();
      b[i] = rng.next();
      c[i] = rng.next();
      y[i] = 3 * a[i] - 1 * b[i] + 0 * c[i];
    }
    y[5] = NaN;
    const s = computeSensitivity({ c, b, a }, y);
    expect(s.map((e) => e.assumptionId)).toEqual(["a", "b", "c"]);
    expect(s[0].rankCorrelation).toBeGreaterThan(0.9);
    expect(s[1].rankCorrelation).toBeLessThan(-0.2);
    expect(Math.abs(s[2].rankCorrelation)).toBeLessThan(0.05);
    expect(s.reduce((t, e) => t + e.contributionToVariance, 0)).toBeCloseTo(1, 12);
    const sumSq = s.reduce((t, e) => t + e.rankCorrelation ** 2, 0);
    expect(s[0].contributionToVariance).toBeCloseTo(s[0].rankCorrelation ** 2 / sumSq, 12);
  });

  it("returns zeros for constant forecasts / assumptions", () => {
    const s = computeSensitivity({ a: Float64Array.of(1, 2, 3), k: Float64Array.of(5, 5, 5) }, Float64Array.of(1, 1, 1));
    expect(s.every((e) => e.rankCorrelation === 0 && e.contributionToVariance === 0)).toBe(true);
  });
});

suite("tornado / spider / scenarioTable", () => {
  function model(): RiskModel {
    const m = emptyModel();
    m.assumptions = [
      assumption("small", { id: "uniform", params: { min: 0, max: 1 } }),
      assumption("off", { id: "uniform", params: { min: 0, max: 100 } }, false),
      assumption("big", { id: "uniform", params: { min: 0, max: 10 } }),
      assumption("neg", { id: "uniform", params: { min: 0, max: 4 } }),
      assumption("trunc", { id: "normal", params: { mean: 0, stdDev: 10 }, truncate: { min: -1, max: 1 } }),
    ];
    return m;
  }
  // inputs: [small, big, neg, trunc]; output = small + big − 2·neg + trunc
  const ev: ModelEvaluator = { evaluate: (x) => Float64Array.of(x[0] + x[1] - 2 * x[2] + x[3]) };
  const base = Float64Array.of(0.5, 5, 2, 0);

  it("tornado: percentile inputs, swings sorted descending, truncation honoured", () => {
    const t = tornado(model(), ev, base, 0);
    expect(t.map((e) => e.assumptionId)).toEqual(["big", "neg", "trunc", "small"]);
    const big = t[0];
    expect(big.baseOutput).toBeCloseTo(1.5, 12);
    expect(big.lowInput).toBeCloseTo(1, 12);
    expect(big.highInput).toBeCloseTo(9, 12);
    expect(big.outputAtLow).toBeCloseTo(-2.5, 12);
    expect(big.outputAtHigh).toBeCloseTo(5.5, 12);
    expect(big.swing).toBeCloseTo(8, 12);
    const neg = t[1];
    expect(neg.outputAtHigh).toBeLessThan(neg.outputAtLow);
    expect(neg.swing).toBeCloseTo(2 * 3.2, 12);
    const tr = t[2];
    expect(tr.lowInput).toBeGreaterThan(-1);
    expect(tr.highInput).toBeLessThan(1);
    expect(tr.lowInput).toBeCloseTo(-tr.highInput, 6);
    // Base inputs untouched.
    expect(Array.from(base)).toEqual([0.5, 5, 2, 0]);
  });

  it("tornado: custom percentiles and evaluator errors", () => {
    const t = tornado(model(), ev, base, 0, { pLow: 0.25, pHigh: 0.75 });
    expect(t[0].lowInput).toBeCloseTo(2.5, 12);
    const throwing: ModelEvaluator = {
      evaluate: (x) => {
        if (x[0] > 0.8) throw new Error("x");
        return Float64Array.of(x[0]);
      },
    };
    const t2 = tornado(model(), throwing, base, 0);
    expect(t2[t2.length - 1].assumptionId).toBe("small");
    expect(t2[t2.length - 1].swing).toBeNaN();
  });

  it("spider series per enabled assumption", () => {
    const s = spider(model(), ev, base, 0, [0.1, 0.5, 0.9]);
    expect(s.map((x) => x.assumptionId)).toEqual(["small", "big", "neg", "trunc"]);
    expect(s[1].inputs.map((v) => +v.toFixed(10))).toEqual([1, 5, 9]);
    expect(s[1].outputs.map((v) => +v.toFixed(10))).toEqual([-2.5, 1.5, 5.5]);
    expect(spider(model(), ev, base, 0)[0].percentiles).toHaveLength(9);
  });

  it("scenario table varies two inputs", () => {
    const tab = scenarioTable(ev, base, 0, [0, 1], 1, [10, 20, 30], 0);
    expect(tab).toEqual([
      [6, 16, 26],
      [7, 17, 27],
    ]);
  });
});

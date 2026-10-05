import { describe, expect, it } from "vitest";
import { efficientFrontier, makeStochasticObjective, optimize, statisticOf, type OptProblem, type OptVariable } from "./index";

const cont = (id: string, lower: number, upper: number): OptVariable => ({ id, lower, upper, type: "continuous" });

const rosenbrock = (x: number[]): number => 100 * (x[1] - x[0] ** 2) ** 2 + (1 - x[0]) ** 2;
const sphere = (x: number[]): number => x.reduce((s, v, i) => s + (v - (i + 1) * 0.5) ** 2, 0);
const himmelblau = (x: number[]): number => (x[0] ** 2 + x[1] - 11) ** 2 + (x[0] + x[1] ** 2 - 7) ** 2;
const HIMMELBLAU_MINIMA = [
  [3, 2],
  [-2.805118, 3.131312],
  [-3.77931, -3.283186],
  [3.584428, -1.848126],
];
const nearHimmelblauMin = (x: number[], tol: number): boolean =>
  HIMMELBLAU_MINIMA.some((m) => Math.hypot(x[0] - m[0], x[1] - m[1]) < tol);

describe("statisticOf", () => {
  const v = new Float64Array([1, 2, 3, 4, 5, NaN, 6, 7, 8, 9, 10]);
  it("ignores NaN and computes moments", () => {
    expect(statisticOf(v, "mean")).toBeCloseTo(5.5, 12);
    expect(statisticOf(v, "median")).toBeCloseTo(5.5, 12);
    expect(statisticOf(v, "stdDev")).toBeCloseTo(3.0276503540974917, 12);
    expect(statisticOf(v, "cv")).toBeCloseTo(3.0276503540974917 / 5.5, 12);
  });
  it("uses PERCENTILE.INC interpolation", () => {
    expect(statisticOf(v, "p10")).toBeCloseTo(1.9, 12);
    expect(statisticOf(v, "p5")).toBeCloseTo(1.45, 12);
    expect(statisticOf(v, "p90")).toBeCloseTo(9.1, 12);
    expect(statisticOf(v, "p95")).toBeCloseTo(9.55, 12);
  });
  it("computes probabilities around a threshold", () => {
    expect(statisticOf(v, "probAbove", 7)).toBeCloseTo(0.3, 12);
    expect(statisticOf(v, "probBelow", 7)).toBeCloseTo(0.7, 12);
    expect(statisticOf(new Float64Array([-1, 2, -3, 4]), "probBelow")).toBe(0.5);
  });
  it("returns NaN for empty input and cv with zero mean", () => {
    expect(statisticOf(new Float64Array([NaN]), "mean")).toBeNaN();
    expect(statisticOf(new Float64Array([-1, 1]), "cv")).toBeNaN();
  });
});

describe("Nelder–Mead", () => {
  it("finds the Rosenbrock minimum", async () => {
    const r = await optimize(
      { variables: [cont("x", -2, 2), cont("y", -1, 3)], objective: rosenbrock, sense: "minimize", initial: [-1.2, 1] },
      { algorithm: "nelderMead", seed: 1 },
    );
    expect(r.algorithm).toBe("nelderMead");
    expect(r.x[0]).toBeCloseTo(1, 3);
    expect(r.x[1]).toBeCloseTo(1, 3);
    expect(r.value).toBeLessThan(1e-7);
    expect(r.feasible).toBe(true);
  });

  it("finds the 5-D sphere minimum", async () => {
    const vars = [0, 1, 2, 3, 4].map((i) => cont(`x${i}`, -5, 5));
    const r = await optimize({ variables: vars, objective: sphere, sense: "minimize" }, { algorithm: "nelderMead", seed: 2 });
    r.x.forEach((v, i) => expect(v).toBeCloseTo((i + 1) * 0.5, 3));
    expect(r.value).toBeLessThan(1e-7);
  });

  it("finds a Himmelblau minimum", async () => {
    const r = await optimize(
      { variables: [cont("x", -5, 5), cont("y", -5, 5)], objective: himmelblau, sense: "minimize", initial: [0, 0] },
      { algorithm: "nelderMead", seed: 3 },
    );
    expect(r.value).toBeLessThan(1e-8);
    expect(nearHimmelblauMin(r.x, 1e-3)).toBe(true);
  });

  it("respects bounds when the optimum lies outside the box", async () => {
    const r = await optimize(
      { variables: [cont("x", 2, 5), cont("y", -1, 0.5)], objective: sphere, sense: "minimize" },
      { algorithm: "nelderMead", seed: 4 },
    );
    expect(r.x[0]).toBeCloseTo(2, 6);
    expect(r.x[1]).toBeCloseTo(0.5, 6);
  });

  it("auto picks Nelder–Mead for unconstrained continuous problems", async () => {
    const r = await optimize({ variables: [cont("x", -5, 5), cont("y", -5, 5)], objective: sphere, sense: "minimize" }, { seed: 5 });
    expect(r.algorithm).toBe("nelderMead");
    expect(r.value).toBeLessThan(1e-7);
  });
});

describe("Simulated annealing", () => {
  it("finds the sphere minimum", async () => {
    const vars = [0, 1, 2].map((i) => cont(`x${i}`, -5, 5));
    const r = await optimize({ variables: vars, objective: sphere, sense: "minimize" }, { algorithm: "simulatedAnnealing", seed: 6, maxEvaluations: 6000 });
    expect(r.algorithm).toBe("simulatedAnnealing");
    r.x.forEach((v, i) => expect(Math.abs(v - (i + 1) * 0.5)).toBeLessThan(1e-2));
  });

  it("finds a Himmelblau minimum", async () => {
    const r = await optimize(
      { variables: [cont("x", -5, 5), cont("y", -5, 5)], objective: himmelblau, sense: "minimize" },
      { algorithm: "simulatedAnnealing", seed: 7, maxEvaluations: 6000 },
    );
    expect(r.value).toBeLessThan(1e-3);
    expect(nearHimmelblauMin(r.x, 2e-2)).toBe(true);
  });

  it("approaches the Rosenbrock minimum", async () => {
    const r = await optimize(
      { variables: [cont("x", -2, 2), cont("y", -1, 3)], objective: rosenbrock, sense: "minimize" },
      { algorithm: "simulatedAnnealing", seed: 8, maxEvaluations: 20000 },
    );
    expect(r.value).toBeLessThan(1e-2);
    expect(Math.abs(r.x[0] - 1)).toBeLessThan(0.1);
    expect(Math.abs(r.x[1] - 1)).toBeLessThan(0.2);
  });
});

describe("Genetic algorithm", () => {
  it("solves a 0-1 knapsack to its known optimum", async () => {
    const values = [92, 57, 49, 68, 60, 43, 67, 84, 87, 72, 30, 41, 25, 53, 38];
    const weights = [23, 31, 29, 44, 53, 38, 63, 85, 89, 82, 15, 27, 12, 33, 21];
    const capacity = 250;
    // Brute-force optimum.
    let best = 0;
    for (let mask = 0; mask < 1 << values.length; mask++) {
      let w = 0;
      let v = 0;
      for (let i = 0; i < values.length; i++) if (mask & (1 << i)) {
        w += weights[i];
        v += values[i];
      }
      if (w <= capacity && v > best) best = v;
    }
    const dot = (a: number[], x: number[]): number => a.reduce((s, ai, i) => s + ai * x[i], 0);
    const r = await optimize(
      {
        variables: values.map((_, i) => ({ id: `b${i}`, lower: 0, upper: 1, type: "binary" as const })),
        objective: (x) => dot(values, x),
        sense: "maximize",
        constraints: [{ id: "cap", evaluate: (x) => dot(weights, x), op: "<=", rhs: capacity }],
      },
      { seed: 9, maxEvaluations: 6000 },
    );
    expect(r.algorithm).toBe("genetic");
    expect(r.feasible).toBe(true);
    expect(r.value).toBe(best);
    expect(r.x.every((v) => v === 0 || v === 1)).toBe(true);
    expect(r.constraintValues[0]).toBeLessThanOrEqual(capacity);
  });

  it("solves an integer problem and memoises revisited points", async () => {
    let calls = 0;
    const r = await optimize(
      {
        variables: [
          { id: "x", lower: -10, upper: 10, type: "integer" },
          { id: "y", lower: -10, upper: 10, type: "integer" },
        ],
        objective: (x) => {
          calls++;
          return (x[0] - 3.4) ** 2 + (x[1] + 2.6) ** 2;
        },
        sense: "minimize",
      },
      { seed: 10 },
    );
    expect(r.x).toEqual([3, -3]);
    expect(r.evaluations).toBe(calls);
    expect(calls).toBeLessThanOrEqual(21 * 21);
  });

  it("respects discrete steps and bounds exactly", async () => {
    const r = await optimize(
      {
        variables: [
          { id: "a", lower: 0.1, upper: 2, type: "discrete", step: 0.3 },
          { id: "b", lower: 0, upper: 10, type: "integer", step: 2 },
          cont("c", 0, 1),
        ],
        objective: (x) => (x[0] - 1.5) ** 2 + (x[1] - 5.2) ** 2 + (x[2] - 0.3) ** 2,
        sense: "minimize",
      },
      { seed: 11 },
    );
    expect(r.x[0]).toBe(1.6); // grid 0.1, 0.4, ..., 1.9
    expect(r.x[1]).toBe(6); // grid 0, 2, ..., 10 → 6 (|6−5.2| < |4−5.2|)
    expect(r.x[2]).toBeGreaterThanOrEqual(0);
    expect(r.x[2]).toBeLessThanOrEqual(1);
    expect(Math.abs(r.x[2] - 0.3)).toBeLessThan(0.05);
  });

  it("is deterministic for a given seed", async () => {
    const problem: OptProblem = {
      variables: [cont("x", -5, 5), cont("y", -5, 5)],
      objective: himmelblau,
      sense: "minimize",
    };
    const a = await optimize(problem, { algorithm: "genetic", seed: 42, maxEvaluations: 1500 });
    const b = await optimize(problem, { algorithm: "genetic", seed: 42, maxEvaluations: 1500 });
    expect(a.x).toEqual(b.x);
    expect(a.value).toBe(b.value);
    expect(a.evaluations).toBe(b.evaluations);
    expect(a.history).toEqual(b.history);
  });
});

describe("constraints", () => {
  it("maximises x+y subject to x²+y² ≤ 1 (auto: GA + NM polish)", async () => {
    const r = await optimize(
      {
        variables: [cont("x", -2, 2), cont("y", -2, 2)],
        objective: (x) => x[0] + x[1],
        sense: "maximize",
        constraints: [{ id: "circle", evaluate: (x) => x[0] ** 2 + x[1] ** 2, op: "<=", rhs: 1 }],
      },
      { seed: 12 },
    );
    expect(r.algorithm).toBe("genetic+nelderMead");
    expect(r.feasible).toBe(true);
    expect(r.value).toBeCloseTo(Math.SQRT2, 4);
    expect(r.constraintValues[0]).toBeLessThanOrEqual(1 + 1e-6);
  });

  it("handles the same problem with Nelder–Mead and with SA", async () => {
    const problem: OptProblem = {
      variables: [cont("x", -2, 2), cont("y", -2, 2)],
      objective: (x) => x[0] + x[1],
      sense: "maximize",
      constraints: [{ id: "circle", evaluate: (x) => x[0] ** 2 + x[1] ** 2, op: "<=", rhs: 1 }],
    };
    const nm = await optimize(problem, { algorithm: "nelderMead", seed: 13 });
    expect(nm.feasible).toBe(true);
    expect(nm.value).toBeCloseTo(Math.SQRT2, 4);
    const sa = await optimize(problem, { algorithm: "simulatedAnnealing", seed: 14, maxEvaluations: 8000 });
    expect(sa.feasible).toBe(true);
    expect(sa.value).toBeGreaterThan(Math.SQRT2 - 1e-2);
  });

  it("satisfies an equality constraint", async () => {
    const r = await optimize(
      {
        variables: [cont("x", -3, 3), cont("y", -3, 3)],
        objective: (x) => x[0] ** 2 + 2 * x[1] ** 2,
        sense: "minimize",
        constraints: [{ id: "sum", evaluate: (x) => x[0] + x[1], op: "=", rhs: 1 }],
      },
      { seed: 15 },
    );
    // min x² + 2y² s.t. x + y = 1 → x = 2/3, y = 1/3, f = 2/3
    expect(r.feasible).toBe(true);
    expect(Math.abs(r.constraintValues[0] - 1)).toBeLessThanOrEqual(1e-6);
    expect(r.value).toBeCloseTo(2 / 3, 4);
    expect(r.x[0]).toBeCloseTo(2 / 3, 2);
  });

  it("reports infeasibility when constraints cannot be met", async () => {
    const r = await optimize(
      {
        variables: [cont("x", 0, 1)],
        objective: (x) => x[0],
        sense: "minimize",
        constraints: [{ id: "c", evaluate: (x) => x[0], op: ">=", rhs: 2 }],
      },
      { seed: 16, maxEvaluations: 500 },
    );
    expect(r.feasible).toBe(false);
    expect(r.x[0]).toBeCloseTo(1, 6); // least violating point
    expect(r.message).toMatch(/No feasible/);
  });
});

describe("general behaviour", () => {
  it("maximises vs minimises", async () => {
    const f = (x: number[]): number => 3 - (x[0] - 1) ** 2;
    const vars = [cont("x", -4, 4)];
    const max = await optimize({ variables: vars, objective: f, sense: "maximize" }, { seed: 17 });
    expect(max.value).toBeCloseTo(3, 8);
    expect(max.x[0]).toBeCloseTo(1, 4);
    const min = await optimize({ variables: vars, objective: f, sense: "minimize" }, { seed: 17 });
    expect(min.value).toBeCloseTo(3 - 25, 8);
    expect(min.x[0]).toBe(-4);
  });

  it("supports async objectives and constraints", async () => {
    const delay = <T>(v: T): Promise<T> => new Promise((r) => setTimeout(() => r(v), 0));
    const r = await optimize(
      {
        variables: [cont("x", -5, 5), cont("y", -5, 5)],
        objective: (x) => delay(sphere(x)),
        sense: "minimize",
        constraints: [{ id: "c", evaluate: (x) => delay(x[0]), op: "<=", rhs: 0.25 }],
      },
      { algorithm: "nelderMead", seed: 18, maxEvaluations: 800 },
    );
    expect(r.feasible).toBe(true);
    expect(r.x[0]).toBeCloseTo(0.25, 3);
    expect(r.x[1]).toBeCloseTo(1, 3);
  });

  it("abort returns the best solution so far", async () => {
    const ctrl = new AbortController();
    let seenBest = Infinity;
    let progressCalls = 0;
    const r = await optimize(
      {
        variables: [cont("x", -2, 2), cont("y", -1, 3)],
        objective: (x) => {
          const v = rosenbrock(x);
          seenBest = Math.min(seenBest, v);
          return v;
        },
        sense: "minimize",
      },
      {
        algorithm: "nelderMead",
        seed: 19,
        onProgress: (p) => {
          progressCalls++;
          expect(p.bestX).toHaveLength(2);
          if (p.evaluations >= 50) ctrl.abort();
        },
        signal: ctrl.signal,
      },
    );
    expect(progressCalls).toBeGreaterThan(0);
    expect(r.message).toMatch(/Aborted/);
    expect(r.evaluations).toBeGreaterThanOrEqual(50);
    expect(r.evaluations).toBeLessThan(60);
    expect(r.value).toBe(seenBest);
    expect(Number.isFinite(r.x[0])).toBe(true);
  });

  it("returns a monotone, downsampled history", async () => {
    const r = await optimize(
      { variables: [0, 1, 2, 3].map((i) => cont(`x${i}`, -5, 5)), objective: sphere, sense: "minimize" },
      { algorithm: "simulatedAnnealing", seed: 20, maxEvaluations: 5000 },
    );
    expect(r.history.length).toBeGreaterThan(1);
    expect(r.history.length).toBeLessThanOrEqual(500);
    for (let i = 1; i < r.history.length; i++) {
      expect(r.history[i].best).toBeLessThanOrEqual(r.history[i - 1].best);
      expect(r.history[i].evaluation).toBeGreaterThanOrEqual(r.history[i - 1].evaluation);
    }
    expect(r.history[r.history.length - 1].evaluation).toBe(r.evaluations);
  });

  it("honours maxEvaluations", async () => {
    const r = await optimize(
      { variables: [cont("x", -2, 2), cont("y", -1, 3)], objective: rosenbrock, sense: "minimize" },
      { algorithm: "genetic", seed: 21, maxEvaluations: 123 },
    );
    expect(r.evaluations).toBe(123);
    expect(r.message).toMatch(/Maximum number of evaluations/);
  });

  it("rejects invalid variables", async () => {
    await expect(
      optimize({ variables: [cont("x", 2, 1)], objective: (x) => x[0], sense: "minimize" }),
    ).rejects.toThrow(/invalid bounds/);
  });
});

describe("efficientFrontier", () => {
  it("is monotone for a 3-asset mean-variance portfolio", async () => {
    const mu = [0.05, 0.09, 0.14];
    const cov = [
      [0.01, 0.002, 0.001],
      [0.002, 0.04, 0.01],
      [0.001, 0.01, 0.09],
    ];
    const variance = (w: number[]): number => {
      let s = 0;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) s += w[i] * w[j] * cov[i][j];
      return s;
    };
    const problem: OptProblem = {
      variables: mu.map((_, i) => cont(`w${i}`, 0, 1)),
      objective: (w) => w.reduce((s, wi, i) => s + wi * mu[i], 0),
      sense: "maximize",
      constraints: [
        { id: "budget", evaluate: (w) => w[0] + w[1] + w[2], op: "=", rhs: 1 },
        { id: "risk", evaluate: variance, op: "<=", rhs: 0.01 },
      ],
      initial: [1, 0, 0],
    };
    const rhs = [0.01, 0.015, 0.02, 0.03, 0.045, 0.06, 0.09];
    const frontier = await efficientFrontier(problem, "risk", rhs, { seed: 22, maxEvaluations: 3000 });
    expect(frontier.map((p) => p.rhs)).toEqual(rhs);
    for (const p of frontier) {
      expect(p.result.feasible).toBe(true);
      expect(p.result.constraintValues[1]).toBeLessThanOrEqual(p.rhs + 1e-6);
    }
    for (let i = 1; i < frontier.length; i++) {
      expect(frontier[i].result.value).toBeGreaterThanOrEqual(frontier[i - 1].result.value - 1e-9);
    }
    // At variance 0.09 the 100% asset-3 portfolio is admissible → mean ≈ 0.14.
    expect(frontier[frontier.length - 1].result.value).toBeCloseTo(0.14, 3);
    // Strictly better return when risk budget grows from minimum.
    expect(frontier[frontier.length - 1].result.value).toBeGreaterThan(frontier[0].result.value + 0.02);
  });

  it("throws for an unknown constraint id", async () => {
    await expect(
      efficientFrontier({ variables: [cont("x", 0, 1)], objective: (x) => x[0], sense: "minimize" }, "nope", [1]),
    ).rejects.toThrow(/not found/);
  });
});

describe("makeStochasticObjective", () => {
  it("runs one simulation per unique candidate shared by objective and constraints", async () => {
    let sims = 0;
    const simulate = async (x: number[]): Promise<Record<string, Float64Array>> => {
      sims++;
      // Deterministic pseudo "simulation": profit = q·(10 − q/5) + noise grid; risk grows with q.
      const n = 200;
      const profit = new Float64Array(n);
      const loss = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const z = (i + 0.5) / n - 0.5; // uniform grid in (−0.5, 0.5)
        profit[i] = x[0] * (10 - x[0] / 5) + 20 * z;
        loss[i] = x[0] * (1 + z);
      }
      await Promise.resolve();
      return { profit, loss };
    };
    const { objective, constraints } = makeStochasticObjective(simulate, { forecastId: "profit", statistic: "mean" }, [
      { forecastId: "loss", statistic: "p95", op: "<=", rhs: 30 },
      { forecastId: "profit", statistic: "probBelow", threshold: 0, op: "<=", rhs: 0.5 },
    ]);
    expect(constraints.map((c) => c.id)).toEqual(["loss:p95:0", "profit:probBelow:1"]);

    // Direct calls share the cached simulation.
    await objective([5]);
    await constraints[0].evaluate([5]);
    await constraints[1].evaluate([5]);
    expect(sims).toBe(1);

    sims = 0;
    const r = await optimize(
      {
        variables: [{ id: "q", lower: 0, upper: 50, type: "integer" }],
        objective,
        constraints,
        sense: "maximize",
      },
      { seed: 23 },
    );
    // p95 of loss = q·(1 + 0.45) ≤ 30 → q ≤ 20.69 → best q = 20 (mean profit increasing until q = 25)
    expect(r.feasible).toBe(true);
    expect(r.x).toEqual([20]);
    expect(r.value).toBeCloseTo(20 * (10 - 4), 8);
    // [5] was already cached before the run, everything else simulated exactly once.
    expect(sims).toBeLessThanOrEqual(r.evaluations);
    expect(sims).toBeGreaterThanOrEqual(r.evaluations - 1);
  });

  it("does not cache failed simulations", async () => {
    let calls = 0;
    const { objective } = makeStochasticObjective(
      async () => {
        calls++;
        if (calls === 1) throw new Error("boom");
        return { f: new Float64Array([1, 2, 3]) };
      },
      { forecastId: "f", statistic: "mean" },
    );
    await expect(objective([1])).rejects.toThrow("boom");
    await expect(objective([1])).resolves.toBe(2);
    expect(calls).toBe(2);
  });
});

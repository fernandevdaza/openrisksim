/**
 * Simulated annealing in the unit box with per-coordinate adaptive steps (Corana-style: steps grow when
 * the acceptance ratio is high and shrink when it is low), reflection at bounds, geometric cooling
 * scheduled over the evaluation budget and periodic returns to the best point.
 * Constraints are handled with a fixed exact penalty.
 */
import type { Context, Evaluation } from "./context";
import type { RunOutcome } from "./nelderMead";

export interface AnnealingOptions {
  start: number[];
}

function reflect01(u: number): number {
  // Reflect into [0, 1].
  let v = u;
  for (let k = 0; k < 4 && (v < 0 || v > 1); k++) v = v < 0 ? -v : 2 - v;
  return Math.min(1, Math.max(0, v));
}

export async function simulatedAnnealing(ctx: Context, opts: AnnealingOptions): Promise<RunOutcome> {
  const { n, rng, spaces } = ctx;
  const hasConstraints = (ctx.problem.constraints?.length ?? 0) > 0;
  let cur: Evaluation = await ctx.evaluate(opts.start);
  let u = ctx.toUnit(cur.x);
  const mu = hasConstraints ? 1000 * Math.max(1, Number.isFinite(cur.f) ? Math.abs(cur.f) : 1) : 0;
  const F = (e: Evaluation): number => ctx.penalized(e, mu);
  let fCur = F(cur);

  const budget = Math.max(1, ctx.remaining());
  const steps = new Array<number>(n).fill(0.1);
  const minStep = (i: number): number => Math.max(spaces[i].unitStep, 1e-12);

  const neighbour = (i: number): number[] => {
    const s = spaces[i];
    const c = u.slice();
    let v = c[i] + steps[i] * rng.normal();
    v = s.bothFinite ? reflect01(v) : s.clampUnit(v);
    if (!s.isContinuous) {
      const oldX = s.snap(s.fromUnit(c[i]));
      let x = s.snap(s.fromUnit(v));
      if (x === oldX) {
        const dir = rng.next() < 0.5 ? -1 : 1;
        x = s.shift(oldX, dir);
        if (x === oldX) x = s.shift(oldX, -dir);
      }
      v = s.toUnit(x);
    }
    c[i] = v;
    return c;
  };

  // Initial temperature from a few random neighbour moves (≈ 50% acceptance of an average uphill move).
  let upSum = 0;
  let upCount = 0;
  const probes = Math.min(20, Math.max(3, Math.floor(budget / 50)));
  for (let k = 0; k < probes; k++) {
    const e = await ctx.evaluate(ctx.fromUnit(neighbour(rng.int(n))));
    const d = F(e) - fCur;
    if (Number.isFinite(d) && d > 0) {
      upSum += d;
      upCount++;
    }
  }
  const T0 = upCount > 0 ? upSum / upCount / Math.LN2 : 1e-3 * (1 + Math.abs(Number.isFinite(fCur) ? fCur : 0));
  const Tend = T0 * 1e-9;
  const totalIters = Math.max(1, budget);
  const tried = new Array<number>(n).fill(0);
  const acc = new Array<number>(n).fill(0);
  const window = Math.max(5, 10);
  const resetEvery = Math.max(20, Math.floor(totalIters / 10));
  let best = cur;
  let bestU = u.slice();
  const maxIters = 20 * totalIters;

  for (let it = 0; it < maxIters; it++) {
    const frac = Math.min(1, it / totalIters);
    const T = T0 * Math.pow(Tend / T0, frac);
    const i = rng.int(n);
    const cand = neighbour(i);
    const e = await ctx.evaluate(ctx.fromUnit(cand));
    const fNew = F(e);
    tried[i]++;
    const d = fNew - fCur;
    if (d <= 0 || (Number.isFinite(d) && rng.next() < Math.exp(-d / T))) {
      u = cand;
      cur = e;
      fCur = fNew;
      acc[i]++;
      if (fNew < F(best)) {
        best = e;
        bestU = cand.slice();
      }
    }
    if (tried[i] >= window) {
      const ratio = acc[i] / tried[i];
      if (ratio > 0.6) steps[i] *= 1 + (2 * (ratio - 0.6)) / 0.4;
      else if (ratio < 0.4) steps[i] /= 1 + (2 * (0.4 - ratio)) / 0.4;
      steps[i] = Math.min(0.5, Math.max(minStep(i), steps[i]));
      tried[i] = 0;
      acc[i] = 0;
    }
    if (it > 0 && it % resetEvery === 0 && F(best) < fCur) {
      u = bestU.slice();
      cur = best;
      fCur = F(best);
    }
    // Converged: all continuous steps negligible and temperature tiny.
    if (frac >= 1 && steps.every((s, k) => s <= Math.max(minStep(k), ctx.tolerance))) return "converged";
  }
  return "converged";
}

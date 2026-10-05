/**
 * Bounded Nelder–Mead with restarts. Variables are mapped to the unit box; trial points are clamped
 * to bounds. Constraints are handled with an augmented Lagrangian (outer multiplier updates, inner NM
 * runs on a smooth merit function), which drives iterates onto equality / active constraints exactly.
 * Adaptive coefficients (Gao & Han 2012) for higher dimensions.
 */
import type { Context, Evaluation } from "./context";

export type RunOutcome = "converged" | "budget" | "aborted";

interface Vertex {
  u: number[];
  F: number;
  e: Evaluation;
}

export interface NelderMeadOptions {
  start: number[];
  /** Initial simplex edge length in unit coordinates. */
  initialStep?: number;
  /** Consecutive restarts without improvement before stopping. */
  maxStaleRestarts?: number;
}

async function singleRun(
  ctx: Context,
  u0: number[],
  step: number,
  merit: (e: Evaluation) => number,
  tol: number,
): Promise<Vertex> {
  const n = ctx.n;
  const alpha = 1;
  const gamma = n >= 2 ? 1 + 2 / n : 2;
  const rho = n >= 2 ? 0.75 - 1 / (2 * n) : 0.5;
  const sigma = n >= 2 ? 1 - 1 / n : 0.5;

  const clampU = (u: number[]): number[] => u.map((v, i) => ctx.spaces[i].clampUnit(v));
  const evalU = async (uRaw: number[]): Promise<Vertex> => {
    const u = clampU(uRaw);
    const e = await ctx.evaluate(ctx.spaces.map((s, i) => s.fromUnit(u[i])));
    return { u, F: merit(e), e };
  };

  const simplex: Vertex[] = [await evalU(u0)];
  for (let i = 0; i < n; i++) {
    const u = simplex[0].u.slice();
    const s = Math.max(step, ctx.spaces[i].unitStep);
    const sp = ctx.spaces[i];
    // Step inwards if the forward step would leave the box.
    if (sp.bothFinite && u[i] + s > 1) u[i] -= s;
    else u[i] += s;
    simplex.push(await evalU(u));
  }

  const diamTol = Math.max(1e-12, Math.sqrt(tol));
  for (let iter = 0; iter < 100000; iter++) {
    simplex.sort((a, b) => (a.F === b.F ? 0 : a.F < b.F ? -1 : 1));
    const best = simplex[0];
    const worst = simplex[n];
    const fSpread = Math.abs(worst.F - best.F);
    let diam = 0;
    for (let k = 1; k <= n; k++) {
      for (let i = 0; i < n; i++) diam = Math.max(diam, Math.abs(simplex[k].u[i] - best.u[i]));
    }
    const flat = Number.isFinite(best.F) && fSpread <= tol * (1 + Math.abs(best.F));
    if ((flat && diam <= diamTol) || diam <= tol) break;

    const c = new Array<number>(n).fill(0);
    for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) c[i] += simplex[k].u[i] / n;

    const xr = await evalU(c.map((ci, i) => ci + alpha * (ci - worst.u[i])));
    if (xr.F < best.F) {
      const xe = await evalU(c.map((ci, i) => ci + gamma * (xr.u[i] - ci)));
      simplex[n] = xe.F < xr.F ? xe : xr;
      continue;
    }
    if (xr.F < simplex[n - 1].F) {
      simplex[n] = xr;
      continue;
    }
    let accepted = false;
    if (xr.F < worst.F) {
      const xc = await evalU(c.map((ci, i) => ci + rho * (xr.u[i] - ci)));
      if (xc.F <= xr.F) {
        simplex[n] = xc;
        accepted = true;
      }
    } else {
      const xcc = await evalU(c.map((ci, i) => ci + rho * (worst.u[i] - ci)));
      if (xcc.F < worst.F) {
        simplex[n] = xcc;
        accepted = true;
      }
    }
    if (!accepted) {
      for (let k = 1; k <= n; k++) {
        simplex[k] = await evalU(best.u.map((b, i) => b + sigma * (simplex[k].u[i] - b)));
      }
    }
  }
  simplex.sort((a, b) => (a.F === b.F ? 0 : a.F < b.F ? -1 : 1));
  return simplex[0];
}


/** Normalised constraint residuals: ≤ 0 satisfied for inequalities, = 0 for equalities. */
function residuals(ctx: Context, e: Evaluation): number[] {
  const cons = ctx.problem.constraints ?? [];
  return cons.map((c, i) => {
    const g = e.constraintValues[i];
    const scale = Math.max(1, Math.abs(c.rhs));
    return (c.op === ">=" ? c.rhs - g : g - c.rhs) / scale;
  });
}

/**
 * Runs NM with restarts until `maxStaleRestarts` consecutive runs fail to improve the global best,
 * or the budget is exhausted (StopOptimization propagates to the caller).
 */
export async function nelderMead(ctx: Context, opts: NelderMeadOptions): Promise<RunOutcome> {
  const cons = ctx.problem.constraints ?? [];
  const m = cons.length;
  const maxStale = opts.maxStaleRestarts ?? 3;
  const step0 = opts.initialStep ?? 0.1;
  let u = ctx.toUnit(ctx.snap(opts.start));
  const first = await ctx.evaluate(opts.start);

  // Augmented Lagrangian state.
  const lambda = new Array<number>(m).fill(0);
  const rho0 = 10 * Math.max(1, Number.isFinite(first.f) ? Math.abs(first.f) : 1);
  let rho = rho0;
  let prevViol = Infinity;
  let alIter = 0;
  const merit = (e: Evaluation): number => {
    if (!Number.isFinite(e.f)) return Infinity;
    if (m === 0) return e.f;
    const r = residuals(ctx, e);
    let F = e.f;
    for (let i = 0; i < m; i++) {
      const c = r[i];
      if (!Number.isFinite(c)) return Infinity;
      if (cons[i].op === "=") F += lambda[i] * c + 0.5 * rho * c * c;
      else {
        const t = lambda[i] + rho * c;
        F += t > 0 ? lambda[i] * c + 0.5 * rho * c * c : (-lambda[i] * lambda[i]) / (2 * rho);
      }
    }
    return F;
  };

  let stale = 0;
  let step = step0;
  for (let run = 0; run < 1000; run++) {
    const before = ctx.best;
    // Inexact augmented-Lagrangian subproblems: loose tolerance first, tightened each outer iteration.
    const innerTol = m > 0 ? Math.max(ctx.tolerance, 1e-4 * Math.pow(0.1, alIter)) : ctx.tolerance;
    const res = await singleRun(ctx, u, step, merit, innerTol);
    const after = ctx.best!;
    const improved = before === null || (after !== before && ctx.significantlyBetter(after, before));

    if (m > 0 && alIter < 40) {
      // Multiplier / penalty update at the run's solution.
      const r = residuals(ctx, res.e);
      let viol = 0;
      let dLambda = 0;
      for (let i = 0; i < m; i++) {
        if (!Number.isFinite(r[i])) {
          viol = Infinity;
          continue;
        }
        const old = lambda[i];
        if (cons[i].op === "=") {
          lambda[i] = old + rho * r[i];
          viol = Math.max(viol, Math.abs(r[i]));
        } else {
          lambda[i] = Math.max(0, old + rho * r[i]);
          viol = Math.max(viol, Math.max(0, r[i]), Math.min(Math.abs(r[i]), old / rho));
        }
        dLambda = Math.max(dLambda, Math.abs(lambda[i] - old) / (1 + Math.abs(lambda[i])));
      }
      alIter++;
      if (viol > 0.25 * prevViol) rho = Math.min(rho * 10, rho0 * 1e10);
      prevViol = viol;
      const alConverged =
        innerTol <= ctx.tolerance && res.e.feasible && (viol <= ctx.constraintTolerance || dLambda <= ctx.tolerance);
      if (!alConverged) {
        u = res.u;
        step = step0 * 0.5;
        continue;
      }
    }

    if (improved) {
      stale = 0;
      u = ctx.toUnit(after.x);
      step = step0;
      continue;
    }
    stale++;
    if (stale >= maxStale) return "converged";
    if (stale === 1) {
      // Tighter restart around the best point.
      u = ctx.toUnit(after.x);
      step = step0 * 0.25;
    } else {
      // Random restart.
      u = ctx.spaces.map((s, i) => (s.bothFinite ? ctx.rng.next() : s.toUnit(after.x[i]) + ctx.rng.normal()));
      step = step0;
    }
  }
  return "converged";
}

import { simulatedAnnealing } from "./annealing";
import { Context, StopOptimization, type StopReason } from "./context";
import { genetic } from "./genetic";
import { nelderMead, type RunOutcome } from "./nelderMead";
import type { OptOptions, OptProblem, OptResult } from "./types";

/** Evaluations faster than this (ms) are considered "cheap" by the auto algorithm selection. */
const CHEAP_EVALUATION_MS = 20;

async function guarded(fn: () => Promise<RunOutcome>): Promise<RunOutcome | StopReason> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof StopOptimization) return err.reason;
    throw err;
  }
}

function buildMessage(ctx: Context, outcome: RunOutcome | StopReason, algorithm: string): string {
  let msg: string;
  if (outcome === "aborted") msg = "Aborted; returning the best solution found so far.";
  else if (outcome === "budget")
    msg =
      algorithm === "simulatedAnnealing"
        ? "Annealing schedule completed (evaluation budget used)."
        : "Maximum number of evaluations reached.";
  else msg = "Converged.";
  if (!ctx.best) msg += " No evaluation was performed.";
  else if (!ctx.best.feasible) msg += " No feasible solution found (constraints violated).";
  if (ctx.firstError !== null) msg += ` Some evaluations failed: ${ctx.firstError}`;
  return msg;
}

/** Optimise `problem`. Always resolves (abort / budget → best so far); throws only for invalid problems. */
export async function optimize(problem: OptProblem, options: OptOptions = {}): Promise<OptResult> {
  const ctx = new Context(problem, options);
  const start = ctx.startX;
  const requested = options.algorithm ?? "auto";
  const allContinuous = ctx.spaces.every((s) => s.isContinuous);
  const hasConstraints = (problem.constraints?.length ?? 0) > 0;
  let algorithm: string = requested;
  let outcome: RunOutcome | StopReason;

  if (requested === "nelderMead") {
    outcome = await guarded(() => nelderMead(ctx, { start }));
  } else if (requested === "genetic") {
    outcome = await guarded(() => genetic(ctx, { start, populationSize: options.populationSize }));
  } else if (requested === "simulatedAnnealing") {
    outcome = await guarded(() => simulatedAnnealing(ctx, { start }));
  } else {
    // auto
    let cheap = false;
    const t0 = Date.now();
    outcome = await guarded(async () => {
      await ctx.evaluate(start);
      return "converged";
    });
    cheap = Date.now() - t0 < CHEAP_EVALUATION_MS;
    if (outcome === "converged") {
      if (!allContinuous) {
        algorithm = "genetic";
        outcome = await guarded(() => genetic(ctx, { start, populationSize: options.populationSize }));
      } else if (hasConstraints && cheap) {
        algorithm = "genetic+nelderMead";
        // GA explores globally with half of the budget, then NM polishes the best point.
        ctx.phaseLimit = ctx.evaluations + Math.floor(0.5 * ctx.remaining());
        outcome = await guarded(() =>
          genetic(ctx, { start, populationSize: options.populationSize, stallGenerations: 20 }),
        );
        ctx.phaseLimit = Infinity;
        if (outcome !== "aborted" && ctx.best) {
          const bestX = ctx.best.x;
          outcome = await guarded(() => nelderMead(ctx, { start: bestX, initialStep: 0.02, maxStaleRestarts: 2 }));
        }
      } else {
        algorithm = "nelderMead";
        outcome = await guarded(() => nelderMead(ctx, { start }));
      }
    } else {
      algorithm = allContinuous ? "nelderMead" : "genetic";
    }
  }

  ctx.reportProgress();
  const best = ctx.best;
  return {
    x: best ? best.x.slice() : start.slice(),
    value: best ? best.value : NaN,
    feasible: best ? best.feasible && Number.isFinite(best.value) : false,
    evaluations: ctx.evaluations,
    constraintValues: best ? best.constraintValues.slice() : [],
    history: ctx.downsampledHistory(500),
    algorithm,
    message: buildMessage(ctx, outcome, algorithm),
  };
}

/**
 * Efficient frontier: re-optimise for each rhs of constraint `constraintId`, warm-starting each run
 * from the previous solution. Stops early (returning the points computed so far) when aborted.
 */
export async function efficientFrontier(
  problem: OptProblem,
  constraintId: string,
  rhsValues: number[],
  options: OptOptions = {},
): Promise<{ rhs: number; result: OptResult }[]> {
  const constraints = problem.constraints ?? [];
  if (!constraints.some((c) => c.id === constraintId)) {
    throw new Error(`Constraint "${constraintId}" not found in problem`);
  }
  const out: { rhs: number; result: OptResult }[] = [];
  let initial = problem.initial;
  for (const rhs of rhsValues) {
    if (options.signal?.aborted) break;
    const p: OptProblem = {
      ...problem,
      initial,
      constraints: constraints.map((c) => (c.id === constraintId ? { ...c, rhs } : c)),
    };
    const result = await optimize(p, options);
    out.push({ rhs, result });
    if (result.evaluations > 0) initial = result.x;
  }
  return out;
}

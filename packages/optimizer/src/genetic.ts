/**
 * Real-coded genetic algorithm with type-aware operators:
 * - continuous / integer / discrete genes: SBX crossover + polynomial mutation, then snapped to the grid
 *   (integer/discrete mutation always moves at least one grid step);
 * - binary genes: uniform crossover + bit-flip mutation.
 * Binary tournament selection and (μ+λ) elitist survival, both ranked with Deb's feasibility rules.
 * Duplicate individuals are removed from the population; evaluations are memoised by the context.
 */
import type { Context, Evaluation } from "./context";
import type { RunOutcome } from "./nelderMead";

export interface GeneticOptions {
  start: number[];
  populationSize?: number;
  /** Generations without significant improvement before stopping (default 40). */
  stallGenerations?: number;
}

const ETA_C = 15;
const ETA_M = 20;
const P_CROSS = 0.9;

export function defaultPopulationSize(n: number): number {
  return Math.min(100, Math.max(20, 10 * n));
}

export async function genetic(ctx: Context, opts: GeneticOptions): Promise<RunOutcome> {
  const { n, rng, spaces } = ctx;
  const N = Math.max(4, Math.floor(opts.populationSize ?? defaultPopulationSize(n)));
  const stallGens = opts.stallGenerations ?? 40;
  const pMut = 1 / n;
  const cmp = (a: Evaluation, b: Evaluation): number => ctx.compare(a, b);

  // Initial population: start point + random individuals (unique when possible).
  let pop: Evaluation[] = [await ctx.evaluate(opts.start)];
  const seen = new Set<string>([pop[0].key]);
  for (let attempts = 0; pop.length < N && attempts < 20 * N; attempts++) {
    const e = await ctx.evaluate(spaces.map((s) => s.random(rng)));
    if (!seen.has(e.key)) {
      seen.add(e.key);
      pop.push(e);
    }
  }
  pop.sort(cmp);

  const tournament = (): Evaluation => {
    const i = rng.int(pop.length);
    const j = rng.int(pop.length);
    return pop[Math.min(i, j)]; // population is sorted: lower index = better
  };

  const crossover = (p1: number[], p2: number[]): [number[], number[]] => {
    const c1 = p1.slice();
    const c2 = p2.slice();
    if (rng.next() > P_CROSS) return [c1, c2];
    for (let i = 0; i < n; i++) {
      if (rng.next() > 0.5) continue;
      const s = spaces[i];
      if (s.v.type === "binary") {
        c1[i] = p2[i];
        c2[i] = p1[i];
        continue;
      }
      const a = p1[i];
      const b = p2[i];
      if (Math.abs(a - b) < 1e-14) continue;
      const u = rng.next();
      const beta = u <= 0.5 ? Math.pow(2 * u, 1 / (ETA_C + 1)) : Math.pow(1 / (2 * (1 - u)), 1 / (ETA_C + 1));
      let y1 = 0.5 * (a + b - beta * Math.abs(b - a));
      let y2 = 0.5 * (a + b + beta * Math.abs(b - a));
      if (rng.next() < 0.5) [y1, y2] = [y2, y1];
      c1[i] = s.snap(y1);
      c2[i] = s.snap(y2);
    }
    return [c1, c2];
  };

  const mutateGene = (x: number[], i: number): void => {
    const s = spaces[i];
    if (s.v.type === "binary") {
      x[i] = s.snap(1 - x[i]);
      return;
    }
    const u = rng.next();
    const delta = u < 0.5 ? Math.pow(2 * u, 1 / (ETA_M + 1)) - 1 : 1 - Math.pow(2 * (1 - u), 1 / (ETA_M + 1));
    const old = x[i];
    let y = s.snap(old + delta * s.w);
    if (!s.isContinuous && y === old) {
      const dir = rng.next() < 0.5 ? -1 : 1;
      y = s.shift(old, dir);
      if (y === old) y = s.shift(old, -dir);
    }
    x[i] = y;
  };

  const mutate = (x: number[]): void => {
    let any = false;
    for (let i = 0; i < n; i++) {
      if (rng.next() < pMut) {
        mutateGene(x, i);
        any = true;
      }
    }
    // Small chance of a forced mutation keeps integer populations from stagnating on parents.
    if (!any && rng.next() < 0.2) mutateGene(x, rng.int(n));
  };

  let stall = 0;
  let noNew = 0;
  let bestRef = ctx.best;
  for (let gen = 0; gen < 100000; gen++) {
    const evalsBefore = ctx.evaluations;
    const offspring: Evaluation[] = [];
    while (offspring.length < N) {
      const p1 = tournament();
      const p2 = tournament();
      const [c1, c2] = crossover(p1.x, p2.x);
      for (const c of [c1, c2]) {
        mutate(c);
        const k = ctx.keyOf(ctx.snap(c));
        if (k === p1.key || k === p2.key) mutateGene(c, rng.int(n));
        offspring.push(await ctx.evaluate(c));
      }
    }
    // (μ+λ) survival with duplicate removal.
    const merged = pop.concat(offspring).sort(cmp);
    const next: Evaluation[] = [];
    const keys = new Set<string>();
    for (const e of merged) {
      if (next.length >= N) break;
      if (keys.has(e.key)) continue;
      keys.add(e.key);
      next.push(e);
    }
    pop = next.length >= 2 ? next : merged.slice(0, Math.max(2, Math.min(N, merged.length)));

    const best = ctx.best!;
    if (bestRef === null || (best !== bestRef && ctx.significantlyBetter(best, bestRef))) {
      stall = 0;
      bestRef = best;
    } else stall++;
    noNew = ctx.evaluations === evalsBefore ? noNew + 1 : 0;
    if (stall >= stallGens || noNew >= 10) return "converged";
  }
  return "converged";
}

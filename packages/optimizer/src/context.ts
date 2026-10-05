/**
 * Shared optimization context: variable space (snapping, unit-box mapping), memoised evaluation,
 * constraint violation, Deb's feasibility rules, budget / abort / progress handling and history.
 */
import { createLocalRng, randomSeed, type LocalRng } from "./rng";
import type { OptOptions, OptProblem, OptVariable } from "./types";

export type StopReason = "budget" | "aborted";

/** Thrown by `Context.evaluate` to unwind an algorithm; caught by `optimize`. */
export class StopOptimization extends Error {
  constructor(public readonly reason: StopReason) {
    super(reason);
    this.name = "StopOptimization";
  }
}

export interface Evaluation {
  key: string;
  /** Snapped decision vector. */
  x: number[];
  /** Raw objective value (user sense). NaN if the objective failed. */
  value: number;
  /** Objective in minimisation form (−value when maximising); +Infinity when invalid. */
  f: number;
  constraintValues: number[];
  /** Sum of normalised constraint violations beyond tolerance (0 = feasible). */
  violation: number;
  feasible: boolean;
}

function decimalsOf(v: number): number {
  if (!Number.isFinite(v) || Number.isInteger(v)) return 0;
  const s = Math.abs(v).toString();
  const e = s.indexOf("e-");
  if (e >= 0) {
    const mant = s.slice(0, e);
    const dot = mant.indexOf(".");
    return Math.min(20, Number(s.slice(e + 2)) + (dot >= 0 ? mant.length - dot - 1 : 0));
  }
  const dot = s.indexOf(".");
  return dot >= 0 ? Math.min(20, s.length - dot - 1) : 0;
}

/** Per-variable grid/bounds helper. */
export class VarSpace {
  /** Unit-box affine map: x = a + u·w. */
  readonly a: number;
  readonly w: number;
  readonly bothFinite: boolean;
  /** Grid step (0 for continuous). */
  readonly step: number;
  private readonly base: number;
  private readonly kMin: number;
  private readonly kMax: number;
  private readonly decimals: number;

  constructor(
    readonly v: OptVariable,
    center: number | undefined,
  ) {
    const { lower, upper, type } = v;
    if (Number.isNaN(lower) || Number.isNaN(upper) || lower > upper) {
      throw new Error(`Variable "${v.id}": invalid bounds [${lower}, ${upper}]`);
    }
    this.bothFinite = Number.isFinite(lower) && Number.isFinite(upper);
    if (type === "continuous") {
      this.step = 0;
      this.base = 0;
      this.kMin = 0;
      this.kMax = 0;
      this.decimals = 0;
    } else if (type === "binary") {
      this.step = 1;
      this.base = 0;
      this.kMin = Math.max(0, Number.isFinite(lower) ? Math.ceil(lower) : 0);
      this.kMax = Math.min(1, Number.isFinite(upper) ? Math.floor(upper) : 1);
      this.decimals = 0;
    } else {
      const step =
        type === "integer"
          ? v.step !== undefined && v.step >= 1
            ? Math.round(v.step)
            : 1
          : v.step !== undefined && v.step > 0
            ? v.step
            : 1;
      this.step = step;
      const base = Number.isFinite(lower) ? (type === "integer" ? Math.ceil(lower) : lower) : 0;
      this.base = base;
      this.kMin = Number.isFinite(lower) ? 0 : -Infinity;
      this.kMax = Number.isFinite(upper) ? Math.floor((upper - base) / step + 1e-9) : Infinity;
      this.decimals = type === "integer" ? 0 : Math.max(decimalsOf(step), decimalsOf(base));
    }
    if (this.kMin > this.kMax) {
      throw new Error(`Variable "${v.id}": no admissible ${type} value in [${lower}, ${upper}]`);
    }
    if (this.bothFinite) {
      this.a = type === "binary" ? this.kMin : lower;
      this.w = type === "binary" ? this.kMax - this.kMin : upper - lower;
    } else {
      const c =
        center !== undefined && Number.isFinite(center)
          ? center
          : Number.isFinite(lower)
            ? lower + 1
            : Number.isFinite(upper)
              ? upper - 1
              : 0;
      this.w = Math.max(1, 2 * Math.abs(c));
      this.a = c - this.w / 2;
    }
  }

  get isContinuous(): boolean {
    return this.v.type === "continuous";
  }

  private clampX(x: number): number {
    return Math.min(this.v.upper, Math.max(this.v.lower, x));
  }

  /** Nearest admissible value (respects bounds, integrality and steps exactly). */
  snap(x: number): number {
    if (Number.isNaN(x)) x = this.a + this.w / 2;
    if (this.v.type === "continuous") return this.clampX(x);
    let k = Math.round((x - this.base) / this.step);
    k = Math.min(this.kMax, Math.max(this.kMin, k));
    if (this.v.type === "binary") return k;
    let val = this.base + k * this.step;
    if (this.decimals > 0) val = Number(val.toFixed(this.decimals));
    if (val > this.v.upper) val -= this.step;
    if (val < this.v.lower) val += this.step;
    return val;
  }

  /** Move by `steps` grid units (discrete types) and snap. */
  shift(x: number, steps: number): number {
    return this.snap(x + steps * this.step);
  }

  /** Uniform random admissible value. */
  random(rng: LocalRng): number {
    if (this.v.type !== "continuous" && Number.isFinite(this.kMin) && Number.isFinite(this.kMax)) {
      const k = this.kMin + rng.int(this.kMax - this.kMin + 1);
      return this.v.type === "binary" ? k : this.snap(this.base + k * this.step);
    }
    return this.snap(this.a + rng.next() * this.w);
  }

  toUnit(x: number): number {
    return this.w > 0 ? (x - this.a) / this.w : 0;
  }

  fromUnit(u: number): number {
    return this.a + u * this.w;
  }

  /** Clamp a unit coordinate so that the mapped x lies within bounds. */
  clampUnit(u: number): number {
    if (this.w <= 0) return 0;
    return (this.clampX(this.fromUnit(u)) - this.a) / this.w;
  }

  /** Grid step expressed in unit coordinates (0 for continuous). */
  get unitStep(): number {
    return this.w > 0 ? this.step / this.w : 0;
  }
}

export interface ContextOptions extends OptOptions {
  defaultMaxEvaluations?: number;
}

export class Context {
  readonly n: number;
  readonly spaces: VarSpace[];
  readonly sign: 1 | -1;
  readonly rng: LocalRng;
  readonly tolerance: number;
  readonly maxEvaluations: number;
  readonly constraintTolerance: number;
  readonly startX: number[];
  /** Additional temporary evaluation cap for multi-phase algorithms. */
  phaseLimit = Infinity;
  evaluations = 0;
  best: Evaluation | null = null;
  history: { evaluation: number; best: number }[] = [];
  firstError: string | null = null;
  private readonly cache = new Map<string, Evaluation>();
  private lastProgress = 0;
  private lastYield = 0;
  private readonly progressEvery: number;

  constructor(
    readonly problem: OptProblem,
    readonly options: ContextOptions,
  ) {
    const vars = problem.variables;
    if (!vars || vars.length === 0) throw new Error("Optimization problem has no variables");
    this.n = vars.length;
    const init = problem.initial && problem.initial.length === vars.length ? problem.initial : undefined;
    this.spaces = vars.map((v, i) => new VarSpace(v, init?.[i]));
    this.sign = problem.sense === "maximize" ? -1 : 1;
    this.rng = createLocalRng(options.seed ?? randomSeed());
    this.tolerance = options.tolerance !== undefined && options.tolerance > 0 ? options.tolerance : 1e-8;
    this.constraintTolerance =
      options.constraintTolerance !== undefined && options.constraintTolerance >= 0 ? options.constraintTolerance : 1e-6;
    const defMax = options.defaultMaxEvaluations ?? Math.min(20000, Math.max(2000, 500 * this.n));
    this.maxEvaluations =
      options.maxEvaluations !== undefined && options.maxEvaluations > 0 ? Math.floor(options.maxEvaluations) : defMax;
    this.progressEvery = Math.max(1, Math.floor(this.maxEvaluations / 100));
    this.startX = this.snap(init ?? this.spaces.map((s) => s.fromUnit(0.5)));
    const now = Date.now();
    this.lastProgress = now;
    this.lastYield = now;
  }

  get aborted(): boolean {
    return this.options.signal?.aborted === true;
  }

  /** Evaluations still allowed in the current phase. */
  remaining(): number {
    return Math.max(0, Math.min(this.maxEvaluations, this.phaseLimit) - this.evaluations);
  }

  snap(x: number[]): number[] {
    return this.spaces.map((s, i) => s.snap(x[i]));
  }

  keyOf(x: number[]): string {
    return x.join(",");
  }

  toUnit(x: number[]): number[] {
    return this.spaces.map((s, i) => s.toUnit(x[i]));
  }

  fromUnit(u: number[]): number[] {
    return this.snap(this.spaces.map((s, i) => s.fromUnit(u[i])));
  }

  /** Penalised scalar (minimisation form) used by NM / SA. */
  penalized(e: Evaluation, mu: number): number {
    if (!Number.isFinite(e.f) || !Number.isFinite(e.violation)) return Infinity;
    return e.f + (e.violation > 0 ? mu * (e.violation + e.violation * e.violation) : 0);
  }

  /** Deb's feasibility rules: negative if a is better than b. */
  compare(a: Evaluation, b: Evaluation): number {
    const diff = (p: number, q: number): number => (p === q ? 0 : p < q ? -1 : 1);
    if (a.feasible && b.feasible) return diff(a.f, b.f);
    if (a.feasible) return -1;
    if (b.feasible) return 1;
    const d = diff(a.violation, b.violation);
    return d !== 0 ? d : diff(a.f, b.f);
  }

  /** True if `a` improves on `b` by more than the tolerance (or in feasibility). */
  significantlyBetter(a: Evaluation, b: Evaluation | null): boolean {
    if (!b) return true;
    if (a.feasible !== b.feasible) return a.feasible;
    if (!a.feasible) return a.violation < b.violation * (1 - 1e-6) || (a.violation === b.violation && a.f < b.f);
    return a.f < b.f - this.tolerance * (1 + Math.abs(b.f));
  }

  private violationOf(g: number[]): number {
    const cons = this.problem.constraints ?? [];
    let v = 0;
    for (let i = 0; i < cons.length; i++) {
      const c = cons[i];
      const val = g[i];
      if (!Number.isFinite(val)) return Infinity;
      const scale = Math.max(1, Math.abs(c.rhs));
      const tol = this.constraintTolerance * scale;
      let d = 0;
      if (c.op === "<=") d = val - c.rhs - tol;
      else if (c.op === ">=") d = c.rhs - val - tol;
      else d = Math.abs(val - c.rhs) - tol;
      if (d > 0) v += d / scale;
    }
    return v;
  }

  private async maybeYield(): Promise<void> {
    const now = Date.now();
    if (now - this.lastYield >= 25) {
      this.lastYield = now;
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  private checkStop(): void {
    if (this.aborted) throw new StopOptimization("aborted");
    if (this.remaining() <= 0) throw new StopOptimization("budget");
  }

  /** Memoised evaluation of (snapped) x. Throws StopOptimization on budget exhaustion / abort. */
  async evaluate(xIn: number[]): Promise<Evaluation> {
    const x = this.snap(xIn);
    const key = this.keyOf(x);
    const hit = this.cache.get(key);
    if (hit) return hit;
    this.checkStop();
    await this.maybeYield();
    this.checkStop();
    const cons = this.problem.constraints ?? [];
    const safe = async (fn: (x: number[]) => number | Promise<number>): Promise<number> => {
      try {
        const r = await fn(x.slice());
        return typeof r === "number" ? r : NaN;
      } catch (err) {
        if (this.aborted) throw new StopOptimization("aborted");
        if (this.firstError === null) this.firstError = err instanceof Error ? err.message : String(err);
        return NaN;
      }
    };
    const [value, ...g] = await Promise.all([safe(this.problem.objective), ...cons.map((c) => safe(c.evaluate))]);
    this.evaluations++;
    const f = Number.isFinite(value) ? this.sign * value : Infinity;
    const violation = this.violationOf(g);
    const e: Evaluation = {
      key,
      x,
      value: Number.isFinite(value) ? value : NaN,
      f,
      constraintValues: g,
      violation,
      feasible: violation === 0,
    };
    this.cache.set(key, e);
    let improved = false;
    if (!this.best || this.compare(e, this.best) < 0) {
      this.best = e;
      improved = true;
      this.history.push({ evaluation: this.evaluations, best: e.value });
    }
    const now = Date.now();
    if (
      this.options.onProgress &&
      (improved || this.evaluations % this.progressEvery === 0 || now - this.lastProgress >= 200)
    ) {
      this.reportProgress();
      this.lastProgress = now;
    }
    if (this.aborted) throw new StopOptimization("aborted");
    return e;
  }

  reportProgress(): void {
    if (!this.options.onProgress || !this.best) return;
    this.options.onProgress({ evaluations: this.evaluations, best: this.best.value, bestX: this.best.x.slice() });
  }

  /** History downsampled to at most `max` points (first and last kept). */
  downsampledHistory(max = 500): { evaluation: number; best: number }[] {
    const h = this.history.slice();
    if (this.best && (h.length === 0 || h[h.length - 1].evaluation !== this.evaluations)) {
      h.push({ evaluation: this.evaluations, best: this.best.value });
    }
    if (h.length <= max) return h;
    const out: { evaluation: number; best: number }[] = [];
    for (let i = 0; i < max; i++) out.push(h[Math.round((i * (h.length - 1)) / (max - 1))]);
    return out;
  }
}

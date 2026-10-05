/** Public types of `@openrisksim/optimizer` (see docs/ARCHITECTURE.md). */

export interface OptVariable {
  id: string;
  lower: number;
  upper: number;
  type: "continuous" | "integer" | "binary" | "discrete";
  /** Grid step for "discrete" (default 1); optional integer step for "integer" (default 1). */
  step?: number;
}

export interface OptConstraint {
  id: string;
  label?: string;
  /** g(x) must satisfy `op` rhs */
  evaluate: (x: number[]) => number | Promise<number>;
  op: "<=" | ">=" | "=";
  rhs: number;
}

export interface OptProblem {
  variables: OptVariable[];
  /** May run a full simulation (stochastic optimization). */
  objective: (x: number[]) => number | Promise<number>;
  sense: "maximize" | "minimize";
  constraints?: OptConstraint[];
  initial?: number[];
}

export type OptAlgorithm = "auto" | "nelderMead" | "genetic" | "simulatedAnnealing";

export interface OptProgress {
  evaluations: number;
  best: number;
  bestX: number[];
}

export interface OptOptions {
  /** auto: GA if any integer/binary/discrete var (or constraints with cheap evaluations, followed by a Nelder–Mead polish), else NM with restarts. */
  algorithm?: OptAlgorithm;
  /** Maximum number of *distinct* objective evaluations (memoised repeats are free). */
  maxEvaluations?: number;
  /** Convergence tolerance (relative on the objective). Default 1e-8. */
  tolerance?: number;
  /** RNG seed; undefined → random. */
  seed?: number;
  /** GA population size (default clamp(10·n, 20, 100)). */
  populationSize?: number;
  onProgress?: (p: OptProgress) => void;
  /** Abort → resolves with the best solution found so far. */
  signal?: AbortSignal;
  /**
   * Extension (not in the original contract): relative feasibility tolerance for constraints.
   * A constraint is satisfied when its violation ≤ constraintTolerance · max(1, |rhs|). Default 1e-6.
   */
  constraintTolerance?: number;
}

export interface OptResult {
  x: number[];
  value: number;
  feasible: boolean;
  evaluations: number;
  constraintValues: number[];
  history: { evaluation: number; best: number }[];
  algorithm: string;
  message: string;
}

export type ForecastStatistic =
  | "mean"
  | "median"
  | "stdDev"
  | "cv"
  | "p5"
  | "p10"
  | "p90"
  | "p95"
  | "probAbove"
  | "probBelow";

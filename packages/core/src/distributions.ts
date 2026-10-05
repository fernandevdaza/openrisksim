/**
 * Distribution contracts shared by every package.
 *
 * A distribution is described in two layers:
 *  - `DistributionSpec`: plain, serialisable data (stored in model files, sent to workers).
 *  - `Distribution`: a live object with pdf/cdf/quantile/sample, built from a spec by the
 *    registry in `@openrisksim/stats`.
 */

/** Every distribution id supported by the engine. Keep in sync with DISTRIBUTION_IDS. */
export type DistributionId =
  // continuous
  | "normal"
  | "lognormal"
  | "uniform"
  | "triangular"
  | "pert"
  | "beta"
  | "gamma"
  | "exponential"
  | "weibull"
  | "logistic"
  | "studentT"
  | "chiSquare"
  | "f"
  | "cauchy"
  | "gumbel"
  | "frechet"
  | "pareto"
  | "laplace"
  | "rayleigh"
  | "erlang"
  | "arcsine"
  | "cosine"
  | "powerFunction"
  | "trapezoidal"
  // discrete
  | "bernoulli"
  | "binomial"
  | "poisson"
  | "geometric"
  | "negativeBinomial"
  | "hypergeometric"
  | "discreteUniform"
  | "custom"
  // degenerate
  | "fixed";

export const DISTRIBUTION_IDS: readonly DistributionId[] = [
  "normal", "lognormal", "uniform", "triangular", "pert", "beta", "gamma", "exponential",
  "weibull", "logistic", "studentT", "chiSquare", "f", "cauchy", "gumbel", "frechet",
  "pareto", "laplace", "rayleigh", "erlang", "arcsine", "cosine", "powerFunction", "trapezoidal",
  "bernoulli", "binomial", "poisson", "geometric", "negativeBinomial", "hypergeometric",
  "discreteUniform", "custom", "fixed",
] as const;

export type DistributionKind = "continuous" | "discrete";

/** Bilingual label. */
export interface I18nText {
  en: string;
  es: string;
}

/** Metadata about one parameter, used by the UI to render the parameter form. */
export interface ParamMeta {
  /** Key in `DistributionSpec.params`. */
  key: string;
  label: I18nText;
  /** Default value shown when the user picks this distribution. */
  default: number;
  /** Must the value be an integer? */
  integer?: boolean;
  /** Inclusive lower bound accepted (validation). */
  min?: number;
  /** Inclusive upper bound accepted (validation). */
  max?: number;
  /** Strict (exclusive) lower bound, e.g. sigma > 0. */
  exclusiveMin?: boolean;
}

/** Static description of a distribution family (for the UI gallery). */
export interface DistributionMeta {
  id: DistributionId;
  kind: DistributionKind;
  name: I18nText;
  description: I18nText;
  params: ParamMeta[];
  /** Typical use case, shown as a hint ("Durations of tasks…"). */
  usage: I18nText;
}

/**
 * Serialisable distribution description.
 * For `custom` the params are ignored and `values`/`weights` are used (empirical / discrete custom).
 */
export interface DistributionSpec {
  id: DistributionId;
  params: Record<string, number>;
  /** Only for `custom`: support points. */
  values?: number[];
  /** Only for `custom`: probabilities (normalised by the engine). */
  weights?: number[];
  /** Optional truncation applied after sampling via quantile-range restriction. */
  truncate?: { min?: number; max?: number };
}

/** Live distribution object. Implemented in `@openrisksim/stats`. */
export interface Distribution {
  readonly spec: DistributionSpec;
  readonly kind: DistributionKind;
  /** Probability density (continuous) or mass (discrete). */
  pdf(x: number): number;
  cdf(x: number): number;
  /** Inverse CDF, p in (0,1). For discrete: smallest x with cdf(x) >= p. */
  quantile(p: number): number;
  /** Draw one sample using a uniform(0,1) generator. */
  sample(rng: Rng): number;
  mean(): number;
  variance(): number;
  /** [lower, upper]; may be infinite. */
  support(): [number, number];
}

/** Uniform random number generator in [0, 1). Implementations must be seedable. */
export interface Rng {
  next(): number;
  /** Re-seed in place. */
  seed(seed: number): void;
}

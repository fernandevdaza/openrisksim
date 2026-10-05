import type { DistributionKind, Rng } from "@openrisksim/core";

/**
 * Internal, spec-free representation of a distribution family instance.
 * The registry wraps it into the public `Distribution` (adds `spec`, truncation, sampling).
 */
export interface BaseDist {
  readonly kind: DistributionKind;
  pdf(x: number): number;
  /** Natural log of pdf/pmf (more accurate in the tails; used by fitting). */
  logPdf?(x: number): number;
  cdf(x: number): number;
  /** P(X > x), when it can be computed more accurately than 1 − cdf(x). */
  sf?(x: number): number;
  /** Inverse CDF; p = 0 → lower support bound, p = 1 → upper support bound. */
  quantile(p: number): number;
  mean(): number;
  variance(): number;
  support(): [number, number];
  /** Optional fast sampler that is distributionally identical to quantile(U). */
  sample?(rng: Rng): number;
  /**
   * For discrete distributions whose support is not a set of consecutive integers
   * (custom values, fixed): the sorted support points.
   */
  points?: Float64Array;
}

export type Params = Record<string, number>;

export const LN_SQRT_2PI = 0.91893853320467274178;

/** Returns NaN for p outside [0,1]; true if p is a valid probability. */
export function badP(p: number): boolean {
  return !(p >= 0 && p <= 1);
}

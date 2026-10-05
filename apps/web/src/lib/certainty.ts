/**
 * Certainty-level helpers for forecast charts (Risk Simulator's Two-Tail / Left-Tail / Right-Tail).
 * All functions take an ascending, NaN-free array.
 */

export type TailMode = "two" | "left" | "right";

export interface CertaintyState {
  mode: TailMode;
  lower: number;
  upper: number;
  /** 0..1 */
  certainty: number;
}

/** Ascending copy without NaN/±Infinity. */
export function sortedFinite(values: ArrayLike<number>): Float64Array {
  let n = 0;
  const tmp = new Float64Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isFinite(v)) tmp[n++] = v;
  }
  return tmp.slice(0, n).sort();
}

/** Number of elements <= x. */
export function countLE(sorted: ArrayLike<number>, x: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Number of elements < x. */
export function countLT(sorted: ArrayLike<number>, x: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Excel PERCENTILE.INC (linear interpolation), p in [0,1]. */
export function percentileSorted(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (p <= 0) return sorted[0];
  if (p >= 1) return sorted[n - 1];
  const h = (n - 1) * p;
  const i = Math.floor(h);
  const f = h - i;
  return i + 1 < n ? sorted[i] + f * (sorted[i + 1] - sorted[i]) : sorted[i];
}

/** Share of values inside the band defined by the mode. */
export function certaintyFromBounds(sorted: ArrayLike<number>, mode: TailMode, lower: number, upper: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (mode === "left") return countLE(sorted, upper) / n;
  if (mode === "right") return (n - countLT(sorted, lower)) / n;
  if (lower > upper) return 0;
  return (countLE(sorted, upper) - countLT(sorted, lower)) / n;
}

/** Bounds that yield the requested certainty (two-tail: symmetric in probability). */
export function boundsFromCertainty(sorted: ArrayLike<number>, mode: TailMode, certainty: number): { lower: number; upper: number } {
  const c = Math.min(1, Math.max(0, certainty));
  if (mode === "left") return { lower: -Infinity, upper: percentileSorted(sorted, c) };
  if (mode === "right") return { lower: percentileSorted(sorted, 1 - c), upper: Infinity };
  const tail = (1 - c) / 2;
  return { lower: percentileSorted(sorted, tail), upper: percentileSorted(sorted, 1 - tail) };
}

/** Default state: 90% two-tail, like Risk Simulator's initial view. */
export function defaultCertainty(sorted: ArrayLike<number>, mode: TailMode = "two", certainty = 0.9): CertaintyState {
  const b = boundsFromCertainty(sorted, mode, certainty);
  return { mode, ...b, certainty: certaintyFromBounds(sorted, mode, b.lower, b.upper) };
}

/** Switching tail mode keeps the % and recomputes the bounds. */
export function switchMode(sorted: ArrayLike<number>, state: CertaintyState, mode: TailMode): CertaintyState {
  const b = boundsFromCertainty(sorted, mode, state.certainty);
  return { mode, ...b, certainty: state.certainty };
}

/** User typed a bound → recompute certainty. */
export function withBound(sorted: ArrayLike<number>, state: CertaintyState, which: "lower" | "upper", value: number): CertaintyState {
  const next = { ...state, [which]: value };
  return { ...next, certainty: certaintyFromBounds(sorted, next.mode, next.lower, next.upper) };
}

/** User typed a certainty → move bounds. */
export function withCertainty(sorted: ArrayLike<number>, state: CertaintyState, certainty: number): CertaintyState {
  const c = Math.min(1, Math.max(0, certainty));
  return { mode: state.mode, ...boundsFromCertainty(sorted, state.mode, c), certainty: c };
}

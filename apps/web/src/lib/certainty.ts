/**
 * Certainty-level helpers for forecast charts (Risk Simulator's Two-Tail / Left-Tail / Right-Tail).
 * All functions take an ascending, NaN-free array.
 */
import { studentTQuantile } from "@openrisksim/distributions";

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

// ---- confidence levels ---------------------------------------------------------------------------

/** Quick presets offered wherever a confidence / certainty level is chosen. */
export const LEVEL_PRESETS = [0.8, 0.9, 0.95, 0.99] as const;
export const MIN_CONFIDENCE = 0.5;
export const MAX_CONFIDENCE = 0.999;

/**
 * Parses a level typed by the user: "90", "97,5", "97.5 %", "0,9" → fraction (0.9, 0.975…).
 * Values ≤ 1 are taken as fractions, larger ones as percentages. NaN when not a number or
 * outside [min, max] (default [0.5, 0.999]).
 */
export function parseLevelInput(raw: string, min = MIN_CONFIDENCE, max = MAX_CONFIDENCE): number {
  let s = raw.trim().replace(/\s|%/g, "");
  if (!s) return NaN;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (lastComma >= 0) s = s.replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  const v = Number(s);
  const level = v <= 1 ? v : v / 100;
  if (!(level >= min - 1e-12 && level <= max + 1e-12)) return NaN;
  return Math.round(level * 1e6) / 1e6;
}

/** 0.975 → "97,5" (es) / "97.5" (en): the level as a percentage number, up to 1 decimal. */
export function levelNumber(level: number, locale: "es" | "en"): string {
  return (Math.round(level * 1000) / 10).toLocaleString(locale === "es" ? "es-ES" : "en-US", { maximumFractionDigits: 1 });
}

/** 0.9 → "90 %" (es) / "90%" (en). */
export function levelPct(level: number, locale: "es" | "en"): string {
  return locale === "es" ? `${levelNumber(level, locale)} %` : `${levelNumber(level, locale)}%`;
}

/**
 * Student-t confidence interval of the mean at `level` from the summary statistics
 * (mean ± t_{(1+level)/2, n−1}·s/√n). Reuses the engine's `meanCI95` at 95 % and `meanCI`
 * when it was computed at the same level, so the numbers always match the engine's.
 */
export function meanConfidenceInterval(
  stats: { mean: number; stdDev: number; count: number; meanCI95?: [number, number]; meanCI?: [number, number]; confidenceLevel?: number },
  level: number,
): [number, number] {
  if (Math.abs(level - 0.95) < 1e-9 && stats.meanCI95) return stats.meanCI95;
  if (stats.meanCI && stats.confidenceLevel !== undefined && Math.abs(stats.confidenceLevel - level) < 1e-9) return stats.meanCI;
  const n = stats.count;
  if (!(n >= 1) || !Number.isFinite(stats.mean)) return [NaN, NaN];
  if (n === 1) return [stats.mean, stats.mean];
  const half = (studentTQuantile((1 + level) / 2, n - 1) * stats.stdDev) / Math.sqrt(n);
  return [stats.mean - half, stats.mean + half];
}

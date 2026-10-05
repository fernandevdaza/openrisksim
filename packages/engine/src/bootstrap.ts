/**
 * Non-parametric bootstrap of a statistic.
 */
import type { Rng } from "@openrisksim/core";
import { percentile } from "./stats";

/**
 * Resamples the non-NaN `values` with replacement `resamples` times and evaluates `stat` on each
 * resample. `estimate` = stat on the original data; `ci95` = percentile interval (2.5%, 97.5%) of the
 * bootstrap distribution; `samples` = the bootstrap replicates in generation order.
 * The buffer passed to `stat` is reused between calls (stat may sort it in place).
 */
export function bootstrap(
  values: ArrayLike<number>,
  stat: (v: Float64Array) => number,
  resamples: number,
  rng: Rng,
): { estimate: number; ci95: [number, number]; samples: Float64Array } {
  const data: number[] = [];
  for (let i = 0; i < values.length; i++) if (!Number.isNaN(values[i])) data.push(values[i]);
  const n = data.length;
  const original = Float64Array.from(data);
  const estimate = n > 0 ? stat(Float64Array.from(original)) : NaN;
  const r = Math.max(0, Math.floor(resamples));
  const samples = new Float64Array(r);
  if (n === 0) {
    samples.fill(NaN);
    return { estimate, ci95: [NaN, NaN], samples };
  }
  const buf = new Float64Array(n);
  for (let b = 0; b < r; b++) {
    for (let i = 0; i < n; i++) {
      let j = Math.floor(rng.next() * n);
      if (j >= n) j = n - 1;
      buf[i] = original[j];
    }
    samples[b] = stat(buf);
  }
  const sorted = samples.filter((v) => !Number.isNaN(v)).sort();
  return { estimate, ci95: [percentile(sorted, 0.025), percentile(sorted, 0.975)], samples };
}

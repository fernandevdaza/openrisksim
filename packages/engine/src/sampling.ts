/**
 * Random input generation: plain Monte Carlo / Latin Hypercube uniforms and assumption sampling.
 */
import type { RiskModel, Rng, SamplingMethod } from "@openrisksim/core";
import { createDistribution } from "./deps";
import { correlationMatrixFromDefs, imanConover } from "./correlation";
import { openUnit, shuffleInPlace } from "./numeric";

/**
 * n×k matrix of uniforms in the open interval (0,1), returned as k columns of length n.
 * - `monteCarlo`: independent draws.
 * - `latinHypercube`: per column, u_i = (π(i) + v_i)/n with π a random permutation of 0..n-1 and
 *   v_i ~ U[0,1) — exactly one value in each of the n equal-probability strata.
 * Columns are generated one after the other, so results are reproducible for a given rng state.
 */
export function generateUniforms(n: number, k: number, method: SamplingMethod, rng: Rng): Float64Array[] {
  const rows = Math.max(0, Math.floor(n));
  const cols: Float64Array[] = [];
  if (method === "latinHypercube") {
    const perm = new Float64Array(rows);
    const next = () => rng.next();
    for (let j = 0; j < k; j++) {
      for (let i = 0; i < rows; i++) perm[i] = i;
      shuffleInPlace(perm, next);
      const col = new Float64Array(rows);
      for (let i = 0; i < rows; i++) col[i] = openUnit((perm[i] + rng.next()) / rows);
      cols.push(col);
    }
  } else {
    for (let j = 0; j < k; j++) {
      const col = new Float64Array(rows);
      for (let i = 0; i < rows; i++) col[i] = openUnit(rng.next());
      cols.push(col);
    }
  }
  return cols;
}

/**
 * Samples for every *enabled* assumption, keyed by assumption id, each of length n.
 *
 * Uniforms are generated with `model.settings.sampling`; if `settings.applyCorrelations` is set and
 * correlation definitions exist between enabled assumptions, the uniform columns of the correlated
 * assumptions are reordered with Iman–Conover (rank correlation is invariant under the monotone
 * quantile transform, and working on continuous uniforms avoids ties). Finally each column is mapped
 * through `createDistribution(spec).quantile(u)`; truncation is handled by the distribution object.
 */
export function sampleAssumptions(model: RiskModel, n: number, rng: Rng): Record<string, Float64Array> {
  const enabled = model.assumptions.filter((a) => a.enabled);
  const k = enabled.length;
  const rows = Math.max(0, Math.floor(n));
  // Build distributions first so that invalid specs fail before any heavy work.
  const dists = enabled.map((a) => createDistribution(a.distribution));
  const u = generateUniforms(rows, k, model.settings.sampling, rng);

  if (model.settings.applyCorrelations && k > 1 && rows > 2) {
    const enabledIds = new Set(enabled.map((a) => a.id));
    const involved = new Set<string>();
    for (const d of model.correlations) {
      if (d.a !== d.b && d.rho !== 0 && Number.isFinite(d.rho) && enabledIds.has(d.a) && enabledIds.has(d.b)) {
        involved.add(d.a);
        involved.add(d.b);
      }
    }
    if (involved.size > 1) {
      const idx: number[] = [];
      enabled.forEach((a, j) => {
        if (involved.has(a.id)) idx.push(j);
      });
      const target = correlationMatrixFromDefs(
        idx.map((j) => enabled[j].id),
        model.correlations,
      );
      const reordered = imanConover(
        idx.map((j) => u[j]),
        target,
        rng,
      );
      idx.forEach((j, t) => {
        u[j] = reordered[t];
      });
    }
  }

  const out: Record<string, Float64Array> = {};
  for (let j = 0; j < k; j++) {
    const d = dists[j];
    const col = u[j];
    // Map in place: the uniform column becomes the sample column.
    for (let i = 0; i < rows; i++) col[i] = d.quantile(col[i]);
    out[enabled[j].id] = col;
  }
  return out;
}

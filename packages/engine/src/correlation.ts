/**
 * Rank correlation between assumptions: Iman–Conover reordering, matrix repair and helpers.
 */
import type { CorrelationDef, Rng } from "@openrisksim/core";
import { argsort, jacobiEigen, shuffleInPlace, stdNormalQuantile } from "./numeric";

/**
 * Cholesky factorisation m = L·Lᵀ. Returns the lower-triangular L.
 * Throws if `m` is not (numerically) symmetric positive definite.
 */
export function cholesky(m: number[][]): number[][] {
  const n = m.length;
  const L: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let j = 0; j < n; j++) {
    if (!m[j] || m[j].length !== n) throw new Error("cholesky: matrix must be square");
    let sum = m[j][j];
    for (let k = 0; k < j; k++) sum -= L[j][k] * L[j][k];
    if (!(sum > 1e-12 * Math.max(1, Math.abs(m[j][j])))) {
      throw new Error("cholesky: matrix is not positive definite");
    }
    const d = Math.sqrt(sum);
    L[j][j] = d;
    for (let i = j + 1; i < n; i++) {
      let s = m[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      L[i][j] = s / d;
    }
  }
  return L;
}

function isPositiveDefinite(m: number[][]): boolean {
  try {
    cholesky(m);
    return true;
  } catch {
    return false;
  }
}

function reconstruct(values: number[], vectors: number[][]): number[][] {
  const n = values.length;
  const out: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += vectors[i][k] * values[k] * vectors[j][k];
      out[i][j] = s;
      out[j][i] = s;
    }
  }
  return out;
}

function projectPsd(m: number[][], floor: number): number[][] {
  const { values, vectors } = jacobiEigen(m);
  return reconstruct(
    values.map((v) => Math.max(v, floor)),
    vectors,
  );
}

const MIN_EIGEN = 1e-6;

/**
 * Nearest positive-definite matrix.
 *
 * - If `m` has a unit diagonal (a correlation matrix, the usual case) the result is the nearest
 *   *correlation* matrix (Higham 2002 alternating projections with Dykstra correction), with the
 *   eigenvalues finally floored at 1e-6 and rescaled to unit diagonal so that it is strictly PD.
 * - Otherwise the symmetric part is eigenvalue-clipped.
 *
 * Input is symmetrised first; already-PD matrices are returned unchanged (as a copy).
 */
export function nearestPositiveDefinite(m: number[][]): number[][] {
  const n = m.length;
  if (n === 0) return [];
  const a: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      const x = (m[i][j] + m[j][i]) / 2;
      return Number.isFinite(x) ? x : i === j ? 1 : 0;
    }),
  );
  const isCorrelation = a.every((row, i) => Math.abs(row[i] - 1) < 1e-9);

  if (!isCorrelation) {
    if (isPositiveDefinite(a)) return a;
    const maxAbs = Math.max(...jacobiEigen(a).values.map(Math.abs), 1e-300);
    let floor = Math.max(MIN_EIGEN * maxAbs, 1e-12);
    for (let attempt = 0; attempt < 8; attempt++) {
      const x = projectPsd(a, floor);
      if (isPositiveDefinite(x)) return x;
      floor *= 10;
    }
    return projectPsd(a, floor);
  }

  for (let i = 0; i < n; i++) {
    a[i][i] = 1;
    for (let j = 0; j < n; j++) if (i !== j) a[i][j] = Math.max(-1, Math.min(1, a[i][j]));
  }
  if (isPositiveDefinite(a)) return a;

  // Higham alternating projections between the PSD cone and the unit-diagonal subspace.
  let y = a.map((r) => r.slice());
  let ds: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let iter = 0; iter < 200; iter++) {
    const r = y.map((row, i) => row.map((v, j) => v - ds[i][j]));
    const x = projectPsd(r, 0);
    ds = x.map((row, i) => row.map((v, j) => v - r[i][j]));
    const yNext = x.map((row, i) => row.map((v, j) => (i === j ? 1 : v)));
    let diff = 0;
    let norm = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        diff += (yNext[i][j] - y[i][j]) ** 2;
        norm += yNext[i][j] ** 2;
      }
    }
    y = yNext;
    if (Math.sqrt(diff) <= 1e-12 * Math.sqrt(norm)) break;
  }

  // Make it strictly PD with unit diagonal.
  let floor = MIN_EIGEN;
  for (let attempt = 0; attempt < 8; attempt++) {
    const x = projectPsd(y, floor);
    const out = x.map((row, i) => row.map((v, j) => (i === j ? 1 : v / Math.sqrt(x[i][i] * x[j][j]))));
    if (isPositiveDefinite(out)) return out;
    floor *= 10;
  }
  // Fallback that is always PD: shrink towards the identity.
  return y.map((row, i) => row.map((v, j) => (i === j ? 1 : v * 0.9)));
}

/**
 * k×k correlation matrix (identity by default) from pairwise definitions.
 * Defs that reference unknown ids or the same assumption twice are ignored; rho is clamped to [-1, 1];
 * later definitions of the same pair override earlier ones.
 */
export function correlationMatrixFromDefs(assumptionIds: string[], defs: CorrelationDef[]): number[][] {
  const k = assumptionIds.length;
  const index = new Map<string, number>();
  assumptionIds.forEach((id, i) => index.set(id, i));
  const m: number[][] = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? 1 : 0)));
  for (const d of defs) {
    const i = index.get(d.a);
    const j = index.get(d.b);
    if (i === undefined || j === undefined || i === j || !Number.isFinite(d.rho)) continue;
    const rho = Math.max(-1, Math.min(1, d.rho));
    m[i][j] = rho;
    m[j][i] = rho;
  }
  return m;
}

/**
 * Iman–Conover (1982) rank-correlation induction.
 *
 * Returns new columns that contain exactly the same values as `samples` (marginals preserved) but
 * reordered so that their Spearman rank correlation ≈ `target`. The target (Spearman) is converted to
 * the Pearson correlation of the normal scores via r = 2·sin(π·ρ/6) and repaired to the nearest PD
 * correlation matrix when needed. Uses van der Waerden scores Φ⁻¹(i/(n+1)) randomly permuted per
 * column, and the sample-correlation correction (Cholesky of the score correlation) so the score
 * matrix has exactly the target correlation before ranking.
 */
export function imanConover(samples: Float64Array[], target: number[][], rng: Rng): Float64Array[] {
  const k = samples.length;
  const out = samples.map((c) => Float64Array.from(c));
  if (k < 2) return out;
  const n = samples[0].length;
  for (const c of samples) if (c.length !== n) throw new Error("imanConover: columns must have equal length");
  if (target.length !== k || target.some((r) => r.length !== k)) {
    throw new Error(`imanConover: target must be ${k}×${k}`);
  }
  if (n < 3) return out;

  // Target Pearson correlation of the normal scores.
  const tgt: number[][] = target.map((row, i) =>
    row.map((rho, j) => (i === j ? 1 : 2 * Math.sin((Math.PI * Math.max(-1, Math.min(1, rho))) / 6))),
  );
  const P = cholesky(nearestPositiveDefinite(tgt));

  // Score matrix: van der Waerden scores, independently shuffled per column.
  const scores = new Float64Array(n);
  for (let i = 0; i < n; i++) scores[i] = stdNormalQuantile((i + 1) / (n + 1));
  const next = () => rng.next();
  const S: Float64Array[] = [];
  for (let j = 0; j < k; j++) {
    const col = Float64Array.from(scores);
    shuffleInPlace(col, next);
    S.push(col);
  }

  // Sample correlation of the score columns (all have the same mean and variance).
  let mean = 0;
  for (let i = 0; i < n; i++) mean += scores[i];
  mean /= n;
  let ss = 0;
  for (let i = 0; i < n; i++) ss += (scores[i] - mean) ** 2;
  const E: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let a = 0; a < k; a++) {
    E[a][a] = 1;
    for (let b = a + 1; b < k; b++) {
      const ca = S[a];
      const cb = S[b];
      let s = 0;
      for (let i = 0; i < n; i++) s += (ca[i] - mean) * (cb[i] - mean);
      E[a][b] = E[b][a] = s / ss;
    }
  }
  const F = cholesky(nearestPositiveDefinite(E));

  // M = P · F⁻¹ (lower triangular).
  const Finv: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let col = 0; col < k; col++) {
    for (let i = col; i < k; i++) {
      let s = i === col ? 1 : 0;
      for (let t = col; t < i; t++) s -= F[i][t] * Finv[t][col];
      Finv[i][col] = s / F[i][i];
    }
  }
  const M: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = 0; j <= i; j++) {
      let s = 0;
      for (let t = j; t <= i; t++) s += P[i][t] * Finv[t][j];
      M[i][j] = s;
    }
  }

  // T = S·Mᵀ, column by column; then reorder each sample column to follow the ranks of T.
  const t = new Float64Array(n);
  for (let j = 0; j < k; j++) {
    t.fill(0);
    const row = M[j];
    for (let l = 0; l <= j; l++) {
      const w = row[l];
      if (w === 0) continue;
      const sl = S[l];
      for (let i = 0; i < n; i++) t[i] += w * sl[i];
    }
    const order = argsort(t);
    const sorted = Float64Array.from(samples[j]).sort();
    const dest = out[j];
    for (let r = 0; r < n; r++) dest[order[r]] = sorted[r];
  }
  return out;
}

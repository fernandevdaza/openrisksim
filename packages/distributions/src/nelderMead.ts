/**
 * Minimal Nelder–Mead simplex minimiser (used internally for numerical maximum likelihood).
 * Non-finite objective values are treated as +∞, so constraints can be expressed by returning
 * Infinity/NaN.
 */
export interface NelderMeadResult {
  x: number[];
  value: number;
  iterations: number;
}

export function nelderMead(
  f: (x: number[]) => number,
  x0: number[],
  opts: { step?: number[] | number; maxIter?: number; tol?: number } = {},
): NelderMeadResult {
  const n = x0.length;
  const maxIter = opts.maxIter ?? 200 * n;
  const tol = opts.tol ?? 1e-10;
  const fx = (x: number[]): number => {
    const v = f(x);
    return Number.isFinite(v) ? v : Infinity;
  };
  const steps = Array.isArray(opts.step)
    ? opts.step
    : x0.map((v) => (opts.step as number | undefined) ?? (Math.abs(v) > 1e-8 ? 0.1 * Math.abs(v) : 0.1));
  const simplex: number[][] = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const p = x0.slice();
    p[i] += steps[i] || 0.1;
    simplex.push(p);
  }
  const values = simplex.map(fx);
  const order = (): void => {
    const idx = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
    const s2 = idx.map((i) => simplex[i]);
    const v2 = idx.map((i) => values[i]);
    for (let i = 0; i <= n; i++) {
      simplex[i] = s2[i];
      values[i] = v2[i];
    }
  };
  let it = 0;
  for (; it < maxIter; it++) {
    order();
    const best = values[0];
    const worst = values[n];
    if (Number.isFinite(worst) && Math.abs(worst - best) <= tol * (Math.abs(best) + tol)) {
      // also require a small simplex
      let size = 0;
      for (let i = 1; i <= n; i++) {
        for (let j = 0; j < n; j++) size = Math.max(size, Math.abs(simplex[i][j] - simplex[0][j]));
      }
      if (size < 1e-8 * (1 + Math.max(...simplex[0].map(Math.abs)))) break;
    }
    // centroid of all but worst
    const c = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += simplex[i][j] / n;
    const xw = simplex[n];
    const xr = c.map((cj, j) => cj + (cj - xw[j]));
    const fr = fx(xr);
    if (fr < values[0]) {
      const xe = c.map((cj, j) => cj + 2 * (cj - xw[j]));
      const fe = fx(xe);
      if (fe < fr) {
        simplex[n] = xe;
        values[n] = fe;
      } else {
        simplex[n] = xr;
        values[n] = fr;
      }
      continue;
    }
    if (fr < values[n - 1]) {
      simplex[n] = xr;
      values[n] = fr;
      continue;
    }
    // contraction
    const outside = fr < values[n];
    const xc = outside ? c.map((cj, j) => cj + 0.5 * (xr[j] - cj)) : c.map((cj, j) => cj + 0.5 * (xw[j] - cj));
    const fc = fx(xc);
    if (fc < (outside ? fr : values[n])) {
      simplex[n] = xc;
      values[n] = fc;
      continue;
    }
    // shrink towards best
    for (let i = 1; i <= n; i++) {
      simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j]));
      values[i] = fx(simplex[i]);
    }
  }
  order();
  return { x: simplex[0], value: values[0], iterations: it };
}

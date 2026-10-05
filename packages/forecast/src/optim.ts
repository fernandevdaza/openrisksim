/**
 * Bounded Nelder–Mead (points are clamped into the box after every move) and a small seeded RNG.
 */

export interface NelderMeadResult {
  x: number[];
  fx: number;
  evaluations: number;
}

export function nelderMead(
  f: (x: number[]) => number,
  x0: number[],
  opts: { lower?: number[]; upper?: number[]; maxEvaluations?: number; tolerance?: number; step?: number[] } = {},
): NelderMeadResult {
  const n = x0.length;
  const lower = opts.lower ?? new Array<number>(n).fill(-Infinity);
  const upper = opts.upper ?? new Array<number>(n).fill(Infinity);
  const maxEval = opts.maxEvaluations ?? 400 * Math.max(1, n);
  const tol = opts.tolerance ?? 1e-10;
  const clamp = (x: number[]) => x.map((v, i) => Math.min(upper[i], Math.max(lower[i], v)));
  let evals = 0;
  const F = (x: number[]) => {
    evals++;
    const v = f(x);
    return Number.isFinite(v) ? v : Number.MAX_VALUE;
  };
  if (n === 0) return { x: [], fx: F([]), evaluations: evals };

  const start = clamp(x0);
  const simplex: number[][] = [start];
  for (let i = 0; i < n; i++) {
    const p = start.slice();
    const width = Number.isFinite(upper[i] - lower[i]) ? upper[i] - lower[i] : Math.max(1, Math.abs(p[i]));
    let step = opts.step?.[i] ?? 0.1 * width;
    if (step === 0) step = 0.1;
    p[i] = p[i] + step <= upper[i] ? p[i] + step : p[i] - step;
    simplex.push(clamp(p));
  }
  let values = simplex.map(F);

  while (evals < maxEval) {
    const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
    const s = order.map((i) => simplex[i]);
    const v = order.map((i) => values[i]);
    for (let i = 0; i <= n; i++) {
      simplex[i] = s[i];
      values[i] = v[i];
    }
    const spread = Math.abs(values[n] - values[0]);
    if (spread <= tol * (Math.abs(values[0]) + tol)) {
      let size = 0;
      for (let i = 1; i <= n; i++) for (let j = 0; j < n; j++) size = Math.max(size, Math.abs(simplex[i][j] - simplex[0][j]));
      if (size < 1e-8) break;
    }
    const centroid = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) centroid[j] += simplex[i][j] / n;
    const worst = simplex[n];
    const move = (t: number) => clamp(centroid.map((c, j) => c + t * (worst[j] - c)));
    const xr = move(-1);
    const fr = F(xr);
    if (fr < values[0]) {
      const xe = move(-2);
      const fe = F(xe);
      if (fe < fr) {
        simplex[n] = xe;
        values[n] = fe;
      } else {
        simplex[n] = xr;
        values[n] = fr;
      }
    } else if (fr < values[n - 1]) {
      simplex[n] = xr;
      values[n] = fr;
    } else {
      const outside = fr < values[n];
      const xc = move(outside ? -0.5 : 0.5);
      const fc = F(xc);
      if (fc < (outside ? fr : values[n])) {
        simplex[n] = xc;
        values[n] = fc;
      } else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = clamp(simplex[i].map((x, j) => simplex[0][j] + 0.5 * (x - simplex[0][j])));
          values[i] = F(simplex[i]);
        }
      }
    }
  }
  let best = 0;
  for (let i = 1; i <= n; i++) if (values[i] < values[best]) best = i;
  return { x: simplex[best], fx: values[best], evaluations: evals };
}

/** Nelder–Mead with one restart from the best point (helps escape premature collapse). */
export function minimize(
  f: (x: number[]) => number,
  x0: number[],
  lower: number[],
  upper: number[],
  maxEvaluations?: number,
): NelderMeadResult {
  const r1 = nelderMead(f, x0, { lower, upper, maxEvaluations });
  const r2 = nelderMead(f, r1.x, { lower, upper, maxEvaluations });
  return r2.fx <= r1.fx ? { ...r2, evaluations: r1.evaluations + r2.evaluations } : r1;
}

/** mulberry32 uniform generator + Box–Muller normals. */
export class SeededRng {
  private state: number;
  private spare: number | null = null;
  constructor(seed?: number) {
    this.state = (seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0;
  }
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  normal(): number {
    if (this.spare !== null) {
      const s = this.spare;
      this.spare = null;
      return s;
    }
    let u = 0;
    while (u === 0) u = this.next();
    const v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  }
  /** Poisson variate (Knuth for small λ, normal approximation for large λ). */
  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    if (lambda > 50) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * this.normal()));
    const l = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > l);
    return k - 1;
  }
}

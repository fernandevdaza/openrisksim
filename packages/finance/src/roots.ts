/**
 * Internal root-finding helpers shared by IRR, XIRR and break-even.
 */

/**
 * Brent's method (Brent 1973 / "zeroin"): finds x in [a, b] with f(x) = 0 given f(a)·f(b) <= 0.
 * Returns NaN when the interval does not bracket a root.
 */
export function brent(f: (x: number) => number, a: number, b: number, tol = 1e-12, maxIter = 200): number {
  let fa = f(a);
  let fb = f(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) return NaN;
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) return NaN;
  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;
  for (let iter = 0; iter < maxIter; iter++) {
    if (fb * fc > 0) {
      c = a;
      fc = fa;
      d = b - a;
      e = d;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + 0.5 * tol;
    const xm = 0.5 * (c - b);
    if (Math.abs(xm) <= tol1 || fb === 0) return b;
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      // Attempt inverse quadratic interpolation / secant.
      const s = fb / fa;
      let p: number;
      let q: number;
      if (a === c) {
        p = 2 * xm * s;
        q = 1 - s;
      } else {
        const qq = fa / fc;
        const r = fb / fc;
        p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      p = Math.abs(p);
      const min1 = 3 * xm * q - Math.abs(tol1 * q);
      const min2 = Math.abs(e * q);
      if (2 * p < Math.min(min1, min2)) {
        e = d;
        d = p / q;
      } else {
        d = xm;
        e = d;
      }
    } else {
      d = xm;
      e = d;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > tol1 ? d : xm >= 0 ? tol1 : -tol1;
    fb = f(b);
    if (!Number.isFinite(fb)) return NaN;
  }
  return b;
}

/** Newton–Raphson; returns NaN on divergence/non-convergence or when leaving (lower, ∞). */
export function newton(
  f: (x: number) => number,
  df: (x: number) => number,
  x0: number,
  lower = -1,
  maxIter = 100,
  tol = 1e-12,
): number {
  let x = x0;
  for (let i = 0; i < maxIter; i++) {
    const fx = f(x);
    const d = df(x);
    if (!Number.isFinite(fx) || !Number.isFinite(d) || d === 0) return NaN;
    const step = fx / d;
    const next = x - step;
    if (!Number.isFinite(next) || next <= lower) return NaN;
    if (Math.abs(step) <= tol * Math.max(1, Math.abs(next))) return next;
    x = next;
  }
  return NaN;
}

/**
 * Grid used to look for sign changes of NPV-like functions on (-0.99, 10]:
 * fine near the usual range of rates, coarser above 100%.
 */
export function rateGrid(): number[] {
  const g: number[] = [];
  for (let r = -0.99; r < 1 - 1e-12; r += 0.0005) g.push(+r.toFixed(6));
  for (let r = 1; r <= 10 + 1e-12; r += 0.005) g.push(+r.toFixed(6));
  return g;
}

/** All sign-change roots of f over the grid, refined with Brent. */
export function allRootsOnGrid(f: (x: number) => number, grid: number[]): number[] {
  const roots: number[] = [];
  let xPrev = grid[0];
  let fPrev = f(xPrev);
  for (let i = 1; i < grid.length; i++) {
    const x = grid[i];
    const fx = f(x);
    if (!Number.isFinite(fx) || !Number.isFinite(fPrev)) {
      xPrev = x;
      fPrev = fx;
      continue;
    }
    if (fPrev === 0) {
      roots.push(xPrev);
    } else if (fPrev * fx < 0) {
      const r = brent(f, xPrev, x);
      if (Number.isFinite(r)) roots.push(r);
    }
    xPrev = x;
    fPrev = fx;
  }
  if (fPrev === 0) roots.push(xPrev);
  return roots;
}

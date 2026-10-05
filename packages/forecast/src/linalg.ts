/**
 * Small dense linear-algebra kernel (row-major number[][]), enough for OLS and ARIMA.
 */

export type Matrix = number[][];

export function zeros(r: number, c: number): Matrix {
  return Array.from({ length: r }, () => new Array<number>(c).fill(0));
}

export function identity(n: number): Matrix {
  const m = zeros(n, n);
  for (let i = 0; i < n; i++) m[i][i] = 1;
  return m;
}

export function transpose(a: Matrix): Matrix {
  const r = a.length;
  const c = r ? a[0].length : 0;
  const t = zeros(c, r);
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) t[j][i] = a[i][j];
  return t;
}

export function matMul(a: Matrix, b: Matrix): Matrix {
  const n = a.length;
  const m = b.length;
  const p = m ? b[0].length : 0;
  if (n && a[0].length !== m) throw new Error("matMul: dimension mismatch");
  const out = zeros(n, p);
  for (let i = 0; i < n; i++) {
    const ai = a[i];
    const oi = out[i];
    for (let k = 0; k < m; k++) {
      const v = ai[k];
      if (v === 0) continue;
      const bk = b[k];
      for (let j = 0; j < p; j++) oi[j] += v * bk[j];
    }
  }
  return out;
}

export function matVec(a: Matrix, x: number[]): number[] {
  return a.map((row) => {
    let s = 0;
    for (let j = 0; j < row.length; j++) s += row[j] * x[j];
    return s;
  });
}

/** Gauss–Jordan inverse with partial pivoting. Throws on a singular matrix. */
export function inverse(a: Matrix): Matrix {
  const n = a.length;
  const id = identity(n);
  const m = a.map((r, i) => [...r, ...id[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    if (Math.abs(m[piv][col]) < 1e-300) throw new Error("inverse: singular matrix");
    [m[col], m[piv]] = [m[piv], m[col]];
    const d = m[col][col];
    for (let j = 0; j < 2 * n; j++) m[col][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col];
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) m[r][j] -= f * m[col][j];
    }
  }
  return m.map((r) => r.slice(n));
}

/** Cholesky factor L (lower) of a symmetric positive-definite matrix. Throws if not PD. */
export function cholesky(a: Matrix): Matrix {
  const n = a.length;
  const l = zeros(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = a[i][j];
      for (let k = 0; k < j; k++) s -= l[i][k] * l[j][k];
      if (i === j) {
        if (s <= 0) throw new Error("cholesky: matrix not positive definite");
        l[i][i] = Math.sqrt(s);
      } else l[i][j] = s / l[j][j];
    }
  }
  return l;
}

export interface LeastSquares {
  /** Coefficients. */
  beta: number[];
  /** Upper-triangular R (p×p) of the thin QR of X. */
  r: Matrix;
  /** (XᵀX)⁻¹ = R⁻¹R⁻ᵀ. */
  xtxInv: Matrix;
  fitted: number[];
  residuals: number[];
  rank: number;
}

/**
 * Ordinary least squares via Householder QR. X is n×p (rows = observations).
 * Throws when X is (numerically) rank deficient.
 */
export function leastSquares(X: Matrix, y: number[]): LeastSquares {
  const n = X.length;
  const p = n ? X[0].length : 0;
  if (n < p) throw new Error("leastSquares: more parameters than observations");
  const a = X.map((r) => r.slice());
  const b = y.slice();
  const diag = new Array<number>(p).fill(0);
  const colNorm0: number[] = [];
  for (let j = 0; j < p; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += a[i][j] * a[i][j];
    colNorm0.push(Math.sqrt(s));
  }
  for (let k = 0; k < p; k++) {
    let norm = 0;
    for (let i = k; i < n; i++) norm += a[i][k] * a[i][k];
    norm = Math.sqrt(norm);
    if (norm <= 1e-11 * Math.max(colNorm0[k], 1e-300)) throw new Error("leastSquares: rank-deficient design matrix");
    const alpha = a[k][k] > 0 ? -norm : norm;
    // v = x − alpha e1, stored in a[k..n-1][k]
    a[k][k] -= alpha;
    let vnorm2 = 0;
    for (let i = k; i < n; i++) vnorm2 += a[i][k] * a[i][k];
    diag[k] = alpha;
    if (vnorm2 === 0) continue;
    for (let j = k + 1; j < p; j++) {
      let s = 0;
      for (let i = k; i < n; i++) s += a[i][k] * a[i][j];
      const f = (2 * s) / vnorm2;
      for (let i = k; i < n; i++) a[i][j] -= f * a[i][k];
    }
    let s = 0;
    for (let i = k; i < n; i++) s += a[i][k] * b[i];
    const f = (2 * s) / vnorm2;
    for (let i = k; i < n; i++) b[i] -= f * a[i][k];
  }
  const r = zeros(p, p);
  for (let i = 0; i < p; i++) {
    r[i][i] = diag[i];
    for (let j = i + 1; j < p; j++) r[i][j] = a[i][j];
  }
  const beta = backSolve(r, b.slice(0, p));
  // R⁻¹ (upper triangular)
  const rinv = zeros(p, p);
  for (let j = 0; j < p; j++) {
    const e = new Array<number>(p).fill(0);
    e[j] = 1;
    const col = backSolve(r, e);
    for (let i = 0; i < p; i++) rinv[i][j] = col[i];
  }
  const xtxInv = matMul(rinv, transpose(rinv));
  const fitted = matVec(X, beta);
  const residuals = y.map((v, i) => v - fitted[i]);
  return { beta, r, xtxInv, fitted, residuals, rank: p };
}

/** Solves R x = b for upper-triangular R. */
export function backSolve(r: Matrix, b: number[]): number[] {
  const p = b.length;
  const x = new Array<number>(p).fill(0);
  for (let i = p - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < p; j++) s -= r[i][j] * x[j];
    x[i] = s / r[i][i];
  }
  return x;
}

/** Solves a (small) linear system A x = b by Gaussian elimination with partial pivoting. */
export function solve(a: Matrix, b: number[]): number[] {
  const n = a.length;
  const m = a.map((r) => r.slice());
  const x = b.slice();
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r;
    if (Math.abs(m[piv][col]) < 1e-300) throw new Error("solve: singular matrix");
    if (piv !== col) {
      [m[col], m[piv]] = [m[piv], m[col]];
      [x[col], x[piv]] = [x[piv], x[col]];
    }
    const rowC = m[col];
    const d = rowC[col];
    for (let r = col + 1; r < n; r++) {
      const row = m[r];
      const f = row[col] / d;
      if (f === 0) continue;
      for (let j = col; j < n; j++) row[j] -= f * rowC[j];
      x[r] -= f * x[col];
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i];
    for (let j = i + 1; j < n; j++) s -= m[i][j] * x[j];
    x[i] = s / m[i][i];
  }
  return x;
}

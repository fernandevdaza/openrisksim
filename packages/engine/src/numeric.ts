/**
 * Small internal numeric helpers shared by the engine modules.
 *
 * Kept dependency-free on purpose so that statistics and correlation code can be used (and tested)
 * without the distributions registry. Not part of the public API.
 */

const A = [
  -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1,
  2.506628277459239,
];
const B = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
const C = [
  -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968,
  2.938163982698783,
];
const D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
const P_LOW = 0.02425;

/**
 * Standard normal quantile (Acklam's rational approximation, relative error < 1.2e-9).
 * Accurate enough for van der Waerden scores and confidence multipliers.
 */
export function stdNormalQuantile(p: number): number {
  if (Number.isNaN(p) || p < 0 || p > 1) return NaN;
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  if (p < P_LOW) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
      ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1)
    );
  }
  if (p > 1 - P_LOW) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(
      (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
      ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1)
    );
  }
  const q = p - 0.5;
  const r = q * q;
  return (
    ((((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q) /
    (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1)
  );
}

/** Two-sided 95% Student-t critical values t_{0.975, df} for df = 1..30. */
const T975 = [
  12.706204736, 4.30265273, 3.182446305, 2.776445105, 2.570581836, 2.446911851, 2.364624252, 2.306004135,
  2.262157163, 2.228138852, 2.20098516, 2.17881283, 2.160368656, 2.144786688, 2.131449546, 2.119905299,
  2.109815578, 2.10092204, 2.093024054, 2.085963447, 2.079613845, 2.073873068, 2.06865761, 2.063898562,
  2.059538553, 2.055529439, 2.051830516, 2.048407142, 2.045229642, 2.042272456,
];

/** t_{0.975, df}: exact table for df ≤ 30, Cornish–Fisher expansion beyond (error < 1e-6). */
export function tCritical975(df: number): number {
  if (!(df >= 1)) return NaN;
  if (df <= 30) return T975[Math.floor(df) - 1];
  const z = 1.959963984540054;
  const z3 = z * z * z;
  const z5 = z3 * z * z;
  const z7 = z5 * z * z;
  const z9 = z7 * z * z;
  const g1 = (z3 + z) / 4;
  const g2 = (5 * z5 + 16 * z3 + 3 * z) / 96;
  const g3 = (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / 384;
  const g4 = (79 * z9 + 776 * z7 + 1482 * z5 - 1920 * z3 - 945 * z) / 92160;
  return z + g1 / df + g2 / (df * df) + g3 / (df * df * df) + g4 / (df * df * df * df);
}

/** Indices that sort `v` ascending (stable for ties). */
export function argsort(v: ArrayLike<number>): Uint32Array {
  const n = v.length;
  if (n >= RADIX_MIN) {
    const r = radixArgsort(v);
    if (r) return r;
  }
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  idx.sort((a, b) => v[a] - v[b] || a - b);
  return idx;
}

const RADIX_MIN = 4096;

/**
 * Stable LSD radix argsort on the IEEE-754 bit pattern (4 passes of 16 bits): ~10× faster than a
 * comparator sort for 10⁶ values. Same order as `argsort`'s comparator (−0 is treated as +0).
 * Returns null when `v` contains NaN (the comparator's order is then implementation-defined).
 */
function radixArgsort(v: ArrayLike<number>): Uint32Array | null {
  const n = v.length;
  const hi = new Uint32Array(n);
  const lo = new Uint32Array(n);
  const f = new Float64Array(1);
  const u = new Uint32Array(f.buffer);
  for (let i = 0; i < n; i++) {
    const x = v[i];
    if (x !== x) return null;
    f[0] = x + 0; // −0 → +0
    let h = u[1];
    let l = u[0];
    if (h & 0x80000000) {
      h = ~h >>> 0;
      l = ~l >>> 0;
    } else h = (h | 0x80000000) >>> 0;
    hi[i] = h;
    lo[i] = l;
  }
  let a = new Uint32Array(n);
  let b = new Uint32Array(n);
  for (let i = 0; i < n; i++) a[i] = i;
  const cnt = new Uint32Array(65536);
  const passes: [Uint32Array, number][] = [
    [lo, 0],
    [lo, 16],
    [hi, 0],
    [hi, 16],
  ];
  for (const [key, sh] of passes) {
    cnt.fill(0);
    for (let i = 0; i < n; i++) cnt[(key[i] >>> sh) & 0xffff]++;
    let s = 0;
    for (let k = 0; k < 65536; k++) {
      const c = cnt[k];
      cnt[k] = s;
      s += c;
    }
    for (let i = 0; i < n; i++) {
      const id = a[i];
      b[cnt[(key[id] >>> sh) & 0xffff]++] = id;
    }
    const t = a;
    a = b;
    b = t;
  }
  return a;
}

/** Ranks 1..n with ties receiving the average of the ranks they span. Input must not contain NaN. */
export function averageRanks(v: ArrayLike<number>): Float64Array {
  const n = v.length;
  const order = argsort(v);
  const ranks = new Float64Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    const x = v[order[i]];
    while (j + 1 < n && v[order[j + 1]] === x) j++;
    const r = (i + j) / 2 + 1;
    for (let t = i; t <= j; t++) ranks[order[t]] = r;
    i = j + 1;
  }
  return ranks;
}

/** In-place Fisher–Yates shuffle driven by a uniform generator in [0,1). */
export function shuffleInPlace(arr: { length: number; [i: number]: number }, next: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    let j = Math.floor(next() * (i + 1));
    if (j > i) j = i;
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
}

/**
 * Eigen-decomposition of a real symmetric matrix by the cyclic Jacobi method.
 * Returns eigenvalues and eigenvectors as columns of `vectors` (vectors[i][j] = component i of vector j).
 */
export function jacobiEigen(m: number[][], maxSweeps = 100): { values: number[]; vectors: number[][] } {
  const n = m.length;
  const a = m.map((row) => row.slice());
  const v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    let total = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = a[i][j] * a[i][j];
        total += x;
        if (i !== j) off += x;
      }
    }
    if (off <= 1e-30 * Math.max(total, 1e-300)) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p][q];
        if (apq === 0) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: a.map((row, i) => row[i]), vectors: v };
}

/** Clamp a uniform to the open interval (0,1) so that quantile functions never see 0 or 1. */
const U_MIN = 2 ** -53;
const U_MAX = 1 - 2 ** -53;
export function openUnit(u: number): number {
  return u < U_MIN ? U_MIN : u > U_MAX ? U_MAX : u;
}

/** Yield to the event loop with a macrotask (no 4 ms clamping like nested setTimeout). Works in window, worker and Node. */
export function createYielder(): { yield: () => Promise<void>; dispose: () => void } {
  const g = globalThis as unknown as {
    setImmediate?: (cb: () => void) => unknown;
    MessageChannel?: typeof MessageChannel;
  };
  if (typeof g.setImmediate === "function") {
    const si = g.setImmediate;
    return { yield: () => new Promise<void>((r) => si(r)), dispose: () => {} };
  }
  if (typeof g.MessageChannel === "function") {
    const ch = new g.MessageChannel();
    const queue: (() => void)[] = [];
    ch.port1.onmessage = () => {
      const r = queue.shift();
      if (r) r();
    };
    return {
      yield: () =>
        new Promise<void>((r) => {
          queue.push(r);
          ch.port2.postMessage(null);
        }),
      dispose: () => {
        ch.port1.onmessage = null;
        ch.port1.close();
        ch.port2.close();
        while (queue.length) queue.shift()!();
      },
    };
  }
  return { yield: () => new Promise<void>((r) => setTimeout(r, 0)), dispose: () => {} };
}

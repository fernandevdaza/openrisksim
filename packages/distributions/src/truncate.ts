/**
 * Generic truncation wrapper: restricts any base distribution to [min, max].
 *
 * quantile_T(u) = Q(F(a) + u·(F(b) − F(a))). When the kept range lies in the upper tail
 * (F(a) > ½) the survival function is used instead so that far-tail truncations keep precision.
 * Mean and variance are computed numerically (Gauss–Legendre in the probability domain for
 * continuous distributions, direct summation for discrete ones) and cached.
 */
import { fuzzLower, fuzzUpper, searchIntegerQuantile } from "./families/discrete";
import type { BaseDist } from "./families/types";

/* Gauss–Legendre nodes / weights on [-1, 1] (Numerical Recipes `gauleg`). */
function gaussLegendre(n: number): { x: Float64Array; w: Float64Array } {
  const x = new Float64Array(n);
  const w = new Float64Array(n);
  const m = (n + 1) >> 1;
  for (let i = 0; i < m; i++) {
    let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    let pp = 0;
    for (let it = 0; it < 100; it++) {
      let p1 = 1;
      let p2 = 0;
      for (let j = 0; j < n; j++) {
        const p3 = p2;
        p2 = p1;
        p1 = ((2 * j + 1) * z * p2 - j * p3) / (j + 1);
      }
      pp = (n * (z * p1 - p2)) / (z * z - 1);
      const z1 = z;
      z = z1 - p1 / pp;
      if (Math.abs(z - z1) < 1e-15) break;
    }
    x[i] = -z;
    x[n - 1 - i] = z;
    w[i] = 2 / ((1 - z * z) * pp * pp);
    w[n - 1 - i] = w[i];
  }
  return { x, w };
}

const GL = gaussLegendre(20);

/** Probability-domain partition, refined geometrically towards both ends. */
const EDGES: number[] = (() => {
  const left = [0, 1e-15, 1e-13, 1e-11, 1e-9, 1e-7, 1e-6, 1e-5, 1e-4, 1e-3, 0.005, 0.02, 0.05, 0.1];
  const mid = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
  const right = left.slice(1).reverse().map((v) => 1 - v);
  return [...left, ...mid, ...right, 1];
})();

/**
 * ∫₀¹ g(Q(u)) du for g = x and g = (x − mean)² — i.e. mean and variance of the distribution
 * with quantile function Q.
 */
export function momentsFromQuantile(q: (u: number) => number): { mean: number; variance: number } {
  const xs: number[] = [];
  const ws: number[] = [];
  for (let e = 0; e + 1 < EDGES.length; e++) {
    const a = EDGES[e];
    const b = EDGES[e + 1];
    const half = (b - a) / 2;
    const mid = (a + b) / 2;
    for (let i = 0; i < GL.x.length; i++) {
      let u = mid + half * GL.x[i];
      if (u >= 1) u = 1 - 1.1102230246251565e-16; // nodes in the last interval may round to 1
      if (u <= 0) u = Number.MIN_VALUE;
      xs.push(q(u));
      ws.push(half * GL.w[i]);
    }
  }
  let mean = 0;
  for (let i = 0; i < xs.length; i++) mean += ws[i] * xs[i];
  let variance = 0;
  for (let i = 0; i < xs.length; i++) variance += ws[i] * (xs[i] - mean) * (xs[i] - mean);
  return { mean, variance };
}

export class TruncationError extends Error {}

/** Returns a truncated view of `base`, or `base` itself if the bounds do not restrict it. */
export function truncateDist(base: BaseDist, tmin?: number, tmax?: number): BaseDist {
  const lo = tmin ?? -Infinity;
  const hi = tmax ?? Infinity;
  const [s0, s1] = base.support();
  const discrete = base.kind === "discrete";
  const pts = base.points;

  // Effective support bounds and the support point just below the lower bound (discrete).
  let lowPt: number;
  let highPt: number;
  let prevPt = -Infinity; // largest support point < lowPt
  if (pts) {
    let i0 = 0;
    while (i0 < pts.length && pts[i0] < lo) i0++;
    let i1 = pts.length - 1;
    while (i1 >= 0 && pts[i1] > hi) i1--;
    if (i0 > i1) throw new TruncationError("Truncation range contains no support points");
    lowPt = pts[i0];
    highPt = pts[i1];
    prevPt = i0 > 0 ? pts[i0 - 1] : -Infinity;
  } else if (discrete) {
    lowPt = Math.max(s0, Math.ceil(lo));
    highPt = Math.min(s1, Math.floor(hi));
    prevPt = lowPt - 1;
  } else {
    lowPt = Math.max(s0, lo);
    highPt = Math.min(s1, hi);
  }
  if (!(lowPt <= highPt)) throw new TruncationError("Truncation range does not intersect the support");
  if (lowPt === s0 && highPt === s1) return base; // nothing to do

  const sf = base.sf ?? ((x: number) => 1 - base.cdf(x));
  const aPoint = discrete ? prevPt : lowPt;
  const Fa = aPoint === -Infinity ? 0 : base.cdf(aPoint);
  const Fb = highPt === Infinity ? 1 : base.cdf(highPt);
  const SA = aPoint === -Infinity ? 1 : sf(aPoint);
  const SB = highPt === Infinity ? 0 : sf(highPt);
  const upperMode = Fa > 0.5 && base.sf !== undefined;
  const Z = upperMode ? SA - SB : Fb - Fa;
  if (!(Z > 0)) throw new TruncationError("Truncation range has zero probability");

  const inRange = (x: number): boolean => x >= lowPt && x <= highPt;
  const cdfT = (x: number): number => {
    if (Number.isNaN(x)) return NaN;
    if (x < lowPt) return 0;
    if (x >= highPt) return 1;
    const v = upperMode ? (SA - sf(x)) / Z : (base.cdf(x) - Fa) / Z;
    return v < 0 ? 0 : v > 1 ? 1 : v;
  };
  const sfT = (x: number): number => {
    if (Number.isNaN(x)) return NaN;
    if (x < lowPt) return 1;
    if (x >= highPt) return 0;
    const v = upperMode ? (sf(x) - SB) / Z : (Fb - base.cdf(x)) / Z;
    return v < 0 ? 0 : v > 1 ? 1 : v;
  };

  /** Continuous upper-tail inversion: x with sf(x) = s, Newton on log sf, bracketed. */
  const invertSf = (s: number): number => {
    let a = lowPt;
    let b = highPt;
    let x = base.quantile(1 - s);
    if (!(x > a && x < b)) x = Number.isFinite(b) ? (a + b) / 2 : a + 1;
    const ls = Math.log(s);
    for (let it = 0; it < 200; it++) {
      const sx = sf(x);
      if (sx > s) a = x;
      else b = x;
      const d = base.pdf(x);
      let xn = x + ((Math.log(sx) - ls) * sx) / d;
      if (!(xn > a && xn < b) || !Number.isFinite(xn)) {
        xn = Number.isFinite(b) ? 0.5 * (a + b) : a + 2 * Math.max(1, Math.abs(a));
      }
      if (Math.abs(xn - x) <= 1e-15 * Math.max(1, Math.abs(x))) return xn;
      x = xn;
    }
    return x;
  };

  let quantile: (u: number) => number;
  if (!discrete) {
    quantile = (u) => {
      if (!(u >= 0 && u <= 1)) return NaN;
      if (u === 0) return lowPt;
      if (u === 1) return highPt;
      let x: number;
      if (upperMode) {
        const s = SA - u * Z;
        const p = 1 - s;
        x = p < 1 - 1e-6 ? base.quantile(p) : invertSf(s);
      } else {
        x = base.quantile(Fa + u * Z);
      }
      return x < lowPt ? lowPt : x > highPt ? highPt : x;
    };
  } else if (pts) {
    const idx0 = pts.indexOf(lowPt);
    const idx1 = pts.indexOf(highPt);
    quantile = (u) => {
      if (!(u >= 0 && u <= 1)) return NaN;
      // smallest point with cdfT ≥ u
      let l = idx0 - 1;
      let h = idx1;
      const useSf = u > 0.5;
      const q = fuzzUpper(1 - u);
      const pl = fuzzLower(u);
      while (h - l > 1) {
        const m = (l + h) >> 1;
        const ok = useSf ? sfT(pts[m]) <= q : cdfT(pts[m]) >= pl;
        if (ok) h = m;
        else l = m;
      }
      return pts[h];
    };
  } else {
    quantile = (u) => {
      if (!(u >= 0 && u <= 1)) return NaN;
      if (u === 0) return lowPt;
      const g = base.quantile(Math.min(1, Math.max(0, Fa + u * Z)));
      return searchIntegerQuantile(u, lowPt, highPt, cdfT, sfT, Number.isFinite(g) ? g : lowPt);
    };
  }

  let moments: { mean: number; variance: number } | null = null;
  const getMoments = (): { mean: number; variance: number } => {
    if (moments) return moments;
    const openLeft = lowPt === -Infinity;
    const openRight = highPt === Infinity;
    const bm = base.mean();
    const bv = base.variance();
    if ((openLeft || openRight) && !Number.isFinite(bm)) {
      moments = { mean: bm, variance: bv };
      return moments;
    }
    if (!discrete) {
      moments = momentsFromQuantile(quantile);
      if ((openLeft || openRight) && !Number.isFinite(bv)) moments.variance = bv;
      return moments;
    }
    // discrete: direct summation over the kept support
    let s1 = 0;
    let s2 = 0;
    let tot = 0;
    const centre = Number.isFinite(bm) ? bm : 0;
    const add = (x: number): void => {
      const p = base.pdf(x);
      if (p > 0) {
        const d = x - centre;
        tot += p;
        s1 += p * d;
        s2 += p * d * d;
      }
    };
    if (pts) {
      for (let i = 0; i < pts.length; i++) if (inRange(pts[i])) add(pts[i]);
    } else {
      let end = highPt;
      if (!Number.isFinite(end)) end = quantile(1 - 1e-16);
      if (!Number.isFinite(end)) end = lowPt + 1e7;
      end = Math.min(end, lowPt + 2e7);
      for (let k = lowPt; k <= end; k++) add(k);
    }
    const m1 = s1 / tot;
    moments = { mean: centre + m1, variance: Math.max(0, s2 / tot - m1 * m1) };
    return moments;
  };

  return {
    kind: base.kind,
    pdf: (x) => (inRange(x) ? base.pdf(x) / Z : 0),
    logPdf: (x) => {
      if (!inRange(x)) return -Infinity;
      return (base.logPdf ? base.logPdf(x) : Math.log(base.pdf(x))) - Math.log(Z);
    },
    cdf: cdfT,
    sf: sfT,
    quantile,
    mean: () => getMoments().mean,
    variance: () => getMoments().variance,
    support: () => [lowPt, highPt],
    points: pts ? pts.filter(inRange) : undefined,
  };
}

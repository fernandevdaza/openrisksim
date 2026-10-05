/**
 * Discrete families on the integers:
 * bernoulli, binomial, poisson, geometric, negativeBinomial, hypergeometric, discreteUniform.
 *
 * Quantile convention: smallest integer k with cdf(k) ≥ p.
 */
import {
  lnChoose,
  lnGamma,
  normalQuantile,
  regIncBetaBoth,
  regIncGammaP,
  regIncGammaQ,
} from "../special";
import { type BaseDist, type Params, badP } from "./types";

/* ------------------------------------------------------------------------------------------ */
/* Generic machinery                                                                          */
/* ------------------------------------------------------------------------------------------ */

interface IntegerSpec {
  lo: number;
  hi: number; // may be Infinity
  logPmf(k: number): number; // k integer in [lo, hi]
  /** P(X ≤ k) for integer k in [lo, hi) */
  cdfInt(k: number): number;
  /** P(X > k) for integer k in [lo, hi) */
  sfInt(k: number): number;
  /** Rough guess of the p-quantile (Cornish–Fisher or similar). */
  guess(p: number): number;
  mean: number;
  variance: number;
}

/**
 * Rounding fuzz for discrete quantiles (as in R's qpois & co.): a cdf value equal to p up to
 * rounding counts as reaching p, so quantile(cdf(k)) === k despite cdf/sf being computed
 * independently.
 */
export function fuzzLower(p: number): number {
  return p * (1 - 64 * 2.220446049250313e-16);
}
export function fuzzUpper(q: number): number {
  return q * (1 + 64 * 2.220446049250313e-16) + 2.220446049250313e-16;
}

/**
 * Smallest integer k in [lo, hi] with cdf(k) ≥ p, by exponential search from a guess followed by
 * bisection. For p > 0.5 the equivalent test sf(k) ≤ 1 − p is used (upper-tail accuracy).
 */
export function searchIntegerQuantile(
  p: number,
  lo: number,
  hi: number,
  cdfInt: (k: number) => number,
  sfInt: (k: number) => number,
  guess: number,
): number {
  const useSf = p > 0.5;
  const pLow = fuzzLower(p);
  const qHigh = fuzzUpper(1 - p);
  const ok = (k: number): boolean => {
    if (k >= hi) return true;
    if (k < lo) return false;
    return useSf ? sfInt(k) <= qHigh : cdfInt(k) >= pLow;
  };
  let k = Number.isFinite(guess) ? Math.round(guess) : lo;
  if (k <= lo) k = lo; // also normalises −0
  if (k > hi) k = hi;
  let lower: number; // ok(lower) is false (or lower = lo − 1)
  let upper: number; // ok(upper) is true
  if (ok(k)) {
    upper = k;
    let step = 1;
    lower = k - step;
    while (lower >= lo && ok(lower)) {
      upper = lower;
      step *= 2;
      lower = upper - step;
    }
    if (lower < lo) lower = lo - 1;
  } else {
    lower = k;
    let step = 1;
    upper = k + step;
    while (upper < hi && !ok(upper)) {
      lower = upper;
      step *= 2;
      upper = lower + step;
      if (upper > 9e15) return Infinity;
    }
    if (upper > hi) upper = hi;
  }
  while (upper - lower > 1) {
    const mid = Math.floor((lower + upper) / 2);
    if (ok(mid)) upper = mid;
    else lower = mid;
  }
  return upper;
}

function integerDist(s: IntegerSpec): BaseDist {
  const { lo, hi } = s;
  const logPdf = (x: number): number => {
    if (!Number.isInteger(x) || x < lo || x > hi) return -Infinity;
    return s.logPmf(x);
  };
  return {
    kind: "discrete",
    pdf: (x) => Math.exp(logPdf(x)),
    logPdf,
    cdf: (x) => {
      if (Number.isNaN(x)) return NaN;
      if (x < lo) return 0;
      if (x >= hi) return 1;
      return s.cdfInt(Math.floor(x));
    },
    sf: (x) => {
      if (Number.isNaN(x)) return NaN;
      if (x < lo) return 1;
      if (x >= hi) return 0;
      return s.sfInt(Math.floor(x));
    },
    quantile: (p) => {
      if (badP(p)) return NaN;
      if (p === 0) return lo;
      if (p === 1 && hi === Infinity) return Infinity;
      return searchIntegerQuantile(p, lo, hi, s.cdfInt, s.sfInt, s.guess(p));
    },
    mean: () => s.mean,
    variance: () => s.variance,
    support: () => [lo, hi],
  };
}

/**
 * Discrete distribution backed by a table of probabilities on lo, lo+1, …, lo+n−1
 * (or on arbitrary sorted `points`). Cumulative sums are kept from both ends so that
 * both tails are accurate; quantile is a binary search.
 */
export function tableDist(
  probs: Float64Array,
  lo: number,
  mean: number,
  variance: number,
  points?: Float64Array,
): BaseDist {
  const n = probs.length;
  const cum = new Float64Array(n); // P(X ≤ x_i)
  const tail = new Float64Array(n); // P(X > x_i)
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += probs[i];
    cum[i] = acc;
  }
  acc = 0;
  for (let i = n - 1; i >= 0; i--) {
    tail[i] = acc;
    acc += probs[i];
  }
  // normalise both (guards against rounding)
  const total = cum[n - 1];
  for (let i = 0; i < n; i++) {
    cum[i] = Math.min(1, cum[i] / total);
    tail[i] = Math.min(1, tail[i] / total);
  }
  cum[n - 1] = 1;
  tail[n - 1] = 0;
  const xAt = points ? (i: number) => points[i] : (i: number) => lo + i;
  /** index of the largest support point ≤ x, or −1 */
  const indexLE = points
    ? (x: number): number => {
        let l = 0;
        let h = n - 1;
        if (x < points[0]) return -1;
        if (x >= points[h]) return h;
        while (h - l > 1) {
          const m = (l + h) >> 1;
          if (points[m] <= x) l = m;
          else h = m;
        }
        return l;
      }
    : (x: number): number => {
        if (x < lo) return -1;
        const i = Math.floor(x) - lo;
        return i >= n ? n - 1 : i;
      };
  const pdf = (x: number): number => {
    const i = indexLE(x);
    if (i < 0 || xAt(i) !== x) return 0;
    return probs[i] / total;
  };
  return {
    kind: "discrete",
    pdf,
    logPdf: (x) => Math.log(pdf(x)),
    cdf: (x) => {
      if (Number.isNaN(x)) return NaN;
      const i = indexLE(x);
      return i < 0 ? 0 : cum[i];
    },
    sf: (x) => {
      if (Number.isNaN(x)) return NaN;
      const i = indexLE(x);
      return i < 0 ? 1 : tail[i];
    },
    quantile: (p) => {
      if (badP(p)) return NaN;
      // smallest i with cum[i] ≥ p  (equivalently tail[i] ≤ 1 − p for the upper half)
      let l = -1;
      let h = n - 1;
      if (p > 0.5) {
        const q = fuzzUpper(1 - p);
        while (h - l > 1) {
          const m = (l + h) >> 1;
          if (tail[m] <= q) h = m;
          else l = m;
        }
      } else {
        const pl = fuzzLower(p);
        while (h - l > 1) {
          const m = (l + h) >> 1;
          if (cum[m] >= pl) h = m;
          else l = m;
        }
      }
      return xAt(h);
    },
    mean: () => mean,
    variance: () => variance,
    support: () => [xAt(0), xAt(n - 1)],
    points,
  };
}

/** Largest table we build eagerly for finite-support integer families. */
const MAX_TABLE = 200_000;

/** Cornish–Fisher guess for a quantile given mean, sd and skewness. */
function cfGuess(p: number, mean: number, sd: number, skew: number): number {
  const z = normalQuantile(Math.min(Math.max(p, 1e-300), 1 - 1e-16));
  return mean + sd * (z + (skew * (z * z - 1)) / 6);
}

/* ------------------------------------------------------------------------------------------ */
/* Families                                                                                   */
/* ------------------------------------------------------------------------------------------ */

export function bernoulli(p: Params): BaseDist {
  const pr = p.p;
  const probs = new Float64Array([1 - pr, pr]);
  return tableDist(probs, 0, pr, pr * (1 - pr));
}

export function binomial(p: Params): BaseDist {
  const n = Math.round(p.n);
  const pr = p.p;
  const mean = n * pr;
  const variance = n * pr * (1 - pr);
  if (pr === 0 || pr === 1 || n === 0) {
    // point mass
    const v = pr === 1 ? n : 0;
    return tableDist(new Float64Array([1]), v, v, 0);
  }
  const lp = Math.log(pr);
  const lq = Math.log1p(-pr);
  const lnN1 = lnGamma(n + 1);
  const logPmf = (k: number): number => lnN1 - lnGamma(k + 1) - lnGamma(n - k + 1) + k * lp + (n - k) * lq;
  if (n + 1 <= MAX_TABLE) {
    const probs = new Float64Array(n + 1);
    for (let k = 0; k <= n; k++) probs[k] = Math.exp(logPmf(k));
    const d = tableDist(probs, 0, mean, variance);
    return { ...d, logPdf: (x) => (Number.isInteger(x) && x >= 0 && x <= n ? logPmf(x) : -Infinity) };
  }
  const scratch = [0, 0];
  const sd = Math.sqrt(variance);
  const skew = (1 - 2 * pr) / sd;
  return integerDist({
    lo: 0,
    hi: n,
    logPmf,
    // P(X ≤ k) = I_{1−p}(n−k, k+1)
    cdfInt: (k) => {
      regIncBetaBoth(1 - pr, pr, n - k, k + 1, scratch);
      return scratch[0];
    },
    sfInt: (k) => {
      regIncBetaBoth(1 - pr, pr, n - k, k + 1, scratch);
      return scratch[1];
    },
    guess: (q) => cfGuess(q, mean, sd, skew),
    mean,
    variance,
  });
}

export function poisson(p: Params): BaseDist {
  const lam = p.lambda;
  const lnLam = Math.log(lam);
  const sd = Math.sqrt(lam);
  return integerDist({
    lo: 0,
    hi: Infinity,
    logPmf: (k) => k * lnLam - lam - lnGamma(k + 1),
    cdfInt: (k) => regIncGammaQ(k + 1, lam),
    sfInt: (k) => regIncGammaP(k + 1, lam),
    guess: (q) => cfGuess(q, lam, sd, 1 / sd),
    mean: lam,
    variance: lam,
  });
}

/** Number of failures before the first success. */
export function geometric(p: Params): BaseDist {
  const pr = p.p;
  const mean = (1 - pr) / pr;
  const variance = (1 - pr) / (pr * pr);
  if (pr === 1) return tableDist(new Float64Array([1]), 0, 0, 0);
  const lq = Math.log1p(-pr);
  const lp = Math.log(pr);
  const cdfInt = (k: number): number => -Math.expm1((k + 1) * lq);
  const sfInt = (k: number): number => Math.exp((k + 1) * lq);
  const base = integerDist({
    lo: 0,
    hi: Infinity,
    logPmf: (k) => lp + k * lq,
    cdfInt,
    sfInt,
    guess: () => 0,
    mean,
    variance,
  });
  return {
    ...base,
    quantile: (u) => {
      if (badP(u)) return NaN;
      if (u === 0) return 0;
      if (u === 1) return Infinity;
      const qf = fuzzUpper(1 - u);
      const pf = fuzzLower(u);
      const ok = u > 0.5 ? (k: number) => sfInt(k) <= qf : (k: number) => cdfInt(k) >= pf;
      let k = Math.max(0, Math.ceil(Math.log1p(-u) / lq - 1));
      // fix possible off-by-one from rounding
      while (k > 0 && ok(k - 1)) k -= 1;
      while (!ok(k)) k += 1;
      return k;
    },
  };
}

/** Number of failures before the r-th success (r may be non-integer: Pólya distribution). */
export function negativeBinomial(p: Params): BaseDist {
  const r = p.r;
  const pr = p.p;
  const mean = (r * (1 - pr)) / pr;
  const variance = (r * (1 - pr)) / (pr * pr);
  if (pr === 1) return tableDist(new Float64Array([1]), 0, 0, 0);
  const lp = Math.log(pr);
  const lq = Math.log1p(-pr);
  const lgr = lnGamma(r);
  const scratch = [0, 0];
  const sd = Math.sqrt(variance);
  const skew = (2 - pr) / Math.sqrt(r * (1 - pr));
  return integerDist({
    lo: 0,
    hi: Infinity,
    logPmf: (k) => lnGamma(k + r) - lgr - lnGamma(k + 1) + r * lp + k * lq,
    // P(X ≤ k) = I_p(r, k+1)
    cdfInt: (k) => {
      regIncBetaBoth(pr, 1 - pr, r, k + 1, scratch);
      return scratch[0];
    },
    sfInt: (k) => {
      regIncBetaBoth(pr, 1 - pr, r, k + 1, scratch);
      return scratch[1];
    },
    guess: (q) => cfGuess(q, mean, sd, skew),
    mean,
    variance,
  });
}

/** Number of successes in `draws` draws without replacement. */
export function hypergeometric(p: Params): BaseDist {
  const N = Math.round(p.population);
  const K = Math.round(p.successes);
  const n = Math.round(p.draws);
  const lo = Math.max(0, n + K - N);
  const hi = Math.min(n, K);
  const mean = N > 0 ? (n * K) / N : 0;
  const variance = N > 1 ? (((n * K) / N) * ((N - K) / N) * (N - n)) / (N - 1) : 0;
  const lnDen = lnChoose(N, n);
  const logPmf = (k: number): number => lnChoose(K, k) + lnChoose(N - K, n - k) - lnDen;
  const size = hi - lo + 1;
  const probs = new Float64Array(Math.min(size, MAX_TABLE * 5));
  // For very large supports the far tails underflow anyway; keep the central part.
  let start = lo;
  if (size > probs.length) start = Math.max(lo, Math.round(mean - probs.length / 2));
  for (let i = 0; i < probs.length; i++) probs[i] = Math.exp(logPmf(start + i));
  const d = tableDist(probs, start, mean, variance);
  return { ...d, logPdf: (x) => (Number.isInteger(x) && x >= lo && x <= hi ? logPmf(x) : -Infinity) };
}

export function discreteUniform(p: Params): BaseDist {
  const a = Math.round(p.min);
  const b = Math.round(p.max);
  const n = b - a + 1;
  const lnN = Math.log(n);
  return {
    kind: "discrete",
    pdf: (x) => (Number.isInteger(x) && x >= a && x <= b ? 1 / n : 0),
    logPdf: (x) => (Number.isInteger(x) && x >= a && x <= b ? -lnN : -Infinity),
    cdf: (x) => (x < a ? 0 : x >= b ? 1 : (Math.floor(x) - a + 1) / n),
    sf: (x) => (x < a ? 1 : x >= b ? 0 : (b - Math.floor(x)) / n),
    quantile: (u) => {
      if (badP(u)) return NaN;
      if (u === 0) return a;
      let j = Math.ceil(u * n); // number of points needed
      if (j > 1 && (j - 1) / n >= u) j -= 1;
      if (j < 1) j = 1;
      if (j > n) j = n;
      return a + j - 1;
    },
    mean: () => (a + b) / 2,
    variance: () => (n * n - 1) / 12,
    support: () => [a, b],
  };
}

/** Tiny seeded RNG (mulberry32) local to the optimizer, so it does not depend on other packages. */
export interface LocalRng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Standard normal (Box–Muller). */
  normal(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

export function createLocalRng(seed: number): LocalRng {
  let a = (Math.floor(seed) >>> 0) ^ 0x9e3779b9;
  let spare: number | null = null;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    normal(): number {
      if (spare !== null) {
        const s = spare;
        spare = null;
        return s;
      }
      let u = 0;
      while (u <= Number.EPSILON) u = next();
      const v = next();
      const r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return r * Math.cos(2 * Math.PI * v);
    },
    int(n: number): number {
      return Math.min(n - 1, Math.floor(next() * n));
    },
  };
}

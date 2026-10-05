/**
 * Seedable pseudo-random number generator: xoshiro128** (Blackman & Vigna, 2018).
 *
 * - 128-bit state, period 2^128 − 1, passes BigCrush / PractRand for its output size.
 * - Uses only 32-bit integer arithmetic (`Math.imul`, `>>>`), so it is fast in every JS engine.
 * - Each double is built from 53 random bits (two 32-bit outputs), uniformly in [0, 1).
 * - The state is initialised from the seed with SplitMix32, so nearby seeds give unrelated streams.
 */
import type { Rng } from "@openrisksim/core";

const TWO_POW_26 = 67108864; // 2^26
const TWO_POW_M53 = 1 / 9007199254740992; // 2^-53

/** SplitMix32 step used for seeding (returns next state and a mixed 32-bit output). */
function splitmix32(state: number): [number, number] {
  const s = (state + 0x9e3779b9) | 0;
  let z = s;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  z ^= z >>> 16;
  return [s, z >>> 0];
}

/** Reduce any finite number (integer or not, possibly > 2^32 or negative) to a 32-bit seed. */
function hashSeed(seed: number): number {
  if (!Number.isFinite(seed)) seed = 0;
  // Mix the integer part (low and high 32 bits) and the fractional part.
  const intPart = Math.trunc(seed);
  const lo = intPart >>> 0;
  const hi = Math.floor(Math.abs(intPart) / 4294967296) >>> 0;
  const frac = Math.floor((seed - intPart) * 4294967296) >>> 0;
  let h = lo ^ Math.imul(hi, 0x9e3779b1) ^ Math.imul(frac, 0x85ebca77);
  if (intPart < 0) h ^= 0x5bd1e995;
  return h >>> 0;
}

function randomSeed(): number {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (c && typeof c.getRandomValues === "function") {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return buf[0];
  }
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

/** xoshiro128** generator implementing the core `Rng` contract. */
export class Xoshiro128 implements Rng {
  private s0 = 0;
  private s1 = 0;
  private s2 = 0;
  private s3 = 0;
  /** The 32-bit seed actually used (useful when a random seed was drawn). */
  initialSeed = 0;

  constructor(seed?: number | null) {
    this.seed(seed == null ? randomSeed() : seed);
  }

  seed(seed: number): void {
    const h = hashSeed(seed);
    this.initialSeed = h;
    let st = h;
    let out: number;
    [st, out] = splitmix32(st);
    this.s0 = out | 0;
    [st, out] = splitmix32(st);
    this.s1 = out | 0;
    [st, out] = splitmix32(st);
    this.s2 = out | 0;
    [st, out] = splitmix32(st);
    this.s3 = out | 0;
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1; // all-zero state is forbidden
  }

  /** Next raw 32-bit unsigned integer. */
  nextUint32(): number {
    const s0 = this.s0;
    const s1 = this.s1;
    const s2 = this.s2;
    const s3 = this.s3;
    // result = rotl(s1 * 5, 7) * 9
    const t1 = Math.imul(s1, 5);
    const result = Math.imul((t1 << 7) | (t1 >>> 25), 9);
    const t = s1 << 9;
    let n2 = s2 ^ s0;
    let n3 = s3 ^ s1;
    const n1 = s1 ^ n2;
    const n0 = s0 ^ n3;
    n2 ^= t;
    n3 = (n3 << 11) | (n3 >>> 21);
    this.s0 = n0;
    this.s1 = n1;
    this.s2 = n2;
    this.s3 = n3;
    return result >>> 0;
  }

  /** Uniform double in [0, 1) with 53 bits of randomness. */
  next(): number {
    const a = this.nextUint32() >>> 5; // 27 bits
    const b = this.nextUint32() >>> 6; // 26 bits
    return (a * TWO_POW_26 + b) * TWO_POW_M53;
  }

  /** Copy of the internal state (for checkpointing). */
  getState(): [number, number, number, number] {
    return [this.s0 >>> 0, this.s1 >>> 0, this.s2 >>> 0, this.s3 >>> 0];
  }

  setState(state: readonly [number, number, number, number]): void {
    this.s0 = state[0] | 0;
    this.s1 = state[1] | 0;
    this.s2 = state[2] | 0;
    this.s3 = state[3] | 0;
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }
}

/** Create a seedable RNG (xoshiro128**). `null`/`undefined` → random seed. */
export function createRng(seed?: number | null): Xoshiro128 {
  return new Xoshiro128(seed);
}

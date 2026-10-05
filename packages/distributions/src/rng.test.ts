import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import { chiSquareSf } from "./special";

describe("createRng (xoshiro128**)", () => {
  it("is deterministic for a given seed", () => {
    const a = createRng(12345);
    const b = createRng(12345);
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it("different seeds give different streams", () => {
    const a = createRng(1);
    const b = createRng(2);
    let same = 0;
    for (let i = 0; i < 100; i++) if (a.next() === b.next()) same++;
    expect(same).toBe(0);
  });

  it("re-seeding restarts the stream", () => {
    const r = createRng(7);
    const first = [r.next(), r.next(), r.next()];
    r.seed(7);
    expect([r.next(), r.next(), r.next()]).toEqual(first);
  });

  it("accepts non-integer, negative and huge seeds deterministically", () => {
    for (const s of [0, -1, 3.75, 2 ** 40 + 3, Number.MAX_SAFE_INTEGER]) {
      expect(createRng(s).next()).toBe(createRng(s).next());
    }
    expect(createRng(3.75).next()).not.toBe(createRng(3).next());
    expect(createRng(2 ** 40 + 3).next()).not.toBe(createRng(3).next());
  });

  it("null/undefined give a random seed", () => {
    const a = createRng(null);
    const b = createRng();
    expect(a.next()).not.toBe(b.next());
  });

  it("produces doubles in [0,1) that look uniform (chi-square on 100 bins)", () => {
    const r = createRng(42);
    const bins = new Array(100).fill(0);
    const n = 1_000_000;
    let min = 1;
    let max = 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const u = r.next();
      if (u < min) min = u;
      if (u > max) max = u;
      sum += u;
      bins[Math.floor(u * 100)]++;
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThan(1);
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.002);
    const e = n / 100;
    const chi2 = bins.reduce((s, o) => s + ((o - e) * (o - e)) / e, 0);
    expect(chi2SfOk(chi2, 99)).toBe(true);
  });

  it("successive values are uncorrelated and use the low bits", () => {
    const r = createRng(99);
    const n = 200_000;
    let prev = r.next();
    let sxy = 0;
    let fine = 0;
    for (let i = 0; i < n; i++) {
      const u = r.next();
      sxy += (u - 0.5) * (prev - 0.5);
      // fractional part at 2^-40 resolution should also be uniform-ish
      if ((u * 2 ** 40) % 1 !== 0) fine++;
      prev = u;
    }
    const corr = sxy / n / (1 / 12);
    expect(Math.abs(corr)).toBeLessThan(0.01);
    expect(fine / n).toBeGreaterThan(0.99);
  });

  it("is fast (≥ 20M doubles/s)", () => {
    const r = createRng(1);
    let s = 0;
    const n = 2_000_000;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) s += r.next();
    const ms = performance.now() - t0;
    expect(s).toBeGreaterThan(0);
    expect(n / ms / 1000).toBeGreaterThan(20);
  });
});

function chi2SfOk(stat: number, df: number): boolean {
  const p = chiSquareSf(stat, df);
  return p > 1e-4 && p < 1 - 1e-4;
}

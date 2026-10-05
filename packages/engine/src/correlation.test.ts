import { describe as suite, expect, it } from "vitest";
import { cholesky, correlationMatrixFromDefs, imanConover, nearestPositiveDefinite } from "./correlation";
import { jacobiEigen } from "./numeric";
import { spearman } from "./stats";
import { testRng } from "./test-utils";

function minEigen(m: number[][]): number {
  return Math.min(...jacobiEigen(m).values);
}

suite("cholesky", () => {
  it("factorises a PD matrix", () => {
    const m = [
      [4, 2, 0.6],
      [2, 5, 1.5],
      [0.6, 1.5, 3],
    ];
    const L = cholesky(m);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (j > i) expect(L[i][j]).toBe(0);
        let s = 0;
        for (let k = 0; k < 3; k++) s += L[i][k] * L[j][k];
        expect(s).toBeCloseTo(m[i][j], 12);
      }
    }
  });

  it("throws on a non-PD matrix", () => {
    expect(() =>
      cholesky([
        [1, 0.9, -0.9],
        [0.9, 1, 0.9],
        [-0.9, 0.9, 1],
      ]),
    ).toThrow();
    expect(() =>
      cholesky([
        [1, 1],
        [1, 1],
      ]),
    ).toThrow();
  });
});

suite("nearestPositiveDefinite", () => {
  it("returns PD matrices unchanged", () => {
    const m = [
      [1, 0.3],
      [0.3, 1],
    ];
    expect(nearestPositiveDefinite(m)).toEqual(m);
  });

  it("repairs an inconsistent correlation matrix to a nearby PD correlation matrix", () => {
    const bad = [
      [1, 0.9, -0.9],
      [0.9, 1, 0.9],
      [-0.9, 0.9, 1],
    ];
    expect(minEigen(bad)).toBeLessThan(0);
    const fixed = nearestPositiveDefinite(bad);
    expect(() => cholesky(fixed)).not.toThrow();
    expect(minEigen(fixed)).toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) {
      expect(fixed[i][i]).toBeCloseTo(1, 12);
      for (let j = 0; j < 3; j++) {
        expect(fixed[i][j]).toBeCloseTo(fixed[j][i], 12);
        expect(Math.abs(fixed[i][j])).toBeLessThanOrEqual(1 + 1e-12);
      }
    }
    // Signs are preserved and the change is moderate.
    expect(fixed[0][1]).toBeGreaterThan(0.3);
    expect(fixed[1][2]).toBeGreaterThan(0.3);
    expect(fixed[0][2]).toBeLessThan(-0.3);
    // Known Higham solution for this matrix has off-diagonals ≈ ±0.5 (scaled symmetric case).
    expect(Math.abs(fixed[0][1])).toBeCloseTo(0.5, 2);
  });

  it("repairs a larger random symmetric matrix", () => {
    const rng = testRng(7);
    const n = 6;
    const m = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let i = 0; i < n; i++) {
      m[i][i] = 1;
      for (let j = i + 1; j < n; j++) m[i][j] = m[j][i] = rng.next() * 2 - 1;
    }
    const fixed = nearestPositiveDefinite(m);
    expect(() => cholesky(fixed)).not.toThrow();
    for (let i = 0; i < n; i++) expect(fixed[i][i]).toBeCloseTo(1, 12);
  });

  it("clips a non-correlation symmetric matrix", () => {
    const fixed = nearestPositiveDefinite([
      [2, 3],
      [3, 2],
    ]);
    expect(() => cholesky(fixed)).not.toThrow();
  });
});

suite("correlationMatrixFromDefs", () => {
  it("builds a symmetric matrix and ignores invalid defs", () => {
    const m = correlationMatrixFromDefs(
      ["a", "b", "c"],
      [
        { a: "a", b: "b", rho: 0.5 },
        { a: "c", b: "a", rho: -2 },
        { a: "a", b: "zzz", rho: 0.9 },
        { a: "b", b: "b", rho: 0.9 },
      ],
    );
    expect(m).toEqual([
      [1, 0.5, -1],
      [0.5, 1, 0],
      [-1, 0, 1],
    ]);
  });
});

suite("imanConover", () => {
  const n = 5000;
  function makeSamples(seed: number): Float64Array[] {
    const rng = testRng(seed);
    // Different marginals: uniform, exponential-like, discrete-ish lognormal-like.
    const a = new Float64Array(n);
    const b = new Float64Array(n);
    const c = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      a[i] = rng.next() * 10;
      b[i] = -Math.log(1 - rng.next());
      c[i] = Math.exp(rng.next() * 3);
    }
    return [a, b, c];
  }

  it("induces the target rank correlation (±0.03) and preserves marginals exactly", () => {
    const samples = makeSamples(11);
    const target = [
      [1, 0.8, -0.4],
      [0.8, 1, -0.2],
      [-0.4, -0.2, 1],
    ];
    const out = imanConover(samples, target, testRng(99));
    for (let j = 0; j < 3; j++) {
      expect(Array.from(Float64Array.from(out[j]).sort())).toEqual(Array.from(Float64Array.from(samples[j]).sort()));
    }
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        expect(Math.abs(spearman(out[i], out[j]) - target[i][j])).toBeLessThan(0.03);
      }
    }
    // Input untouched.
    expect(samples[0]).toEqual(makeSamples(11)[0]);
  });

  it("handles strong and zero targets", () => {
    const samples = makeSamples(5);
    const target = [
      [1, 0.95, 0],
      [0.95, 1, 0],
      [0, 0, 1],
    ];
    const out = imanConover(samples, target, testRng(3));
    expect(Math.abs(spearman(out[0], out[1]) - 0.95)).toBeLessThan(0.03);
    expect(Math.abs(spearman(out[0], out[2]))).toBeLessThan(0.03);
    expect(Math.abs(spearman(out[1], out[2]))).toBeLessThan(0.03);
  });

  it("repairs an inconsistent target before inducing it", () => {
    const samples = makeSamples(8);
    const target = [
      [1, 0.9, -0.9],
      [0.9, 1, 0.9],
      [-0.9, 0.9, 1],
    ];
    const out = imanConover(samples, target, testRng(4));
    expect(spearman(out[0], out[1])).toBeGreaterThan(0.2);
    expect(spearman(out[1], out[2])).toBeGreaterThan(0.2);
    expect(spearman(out[0], out[2])).toBeLessThan(-0.2);
  });

  it("is deterministic for the same rng seed", () => {
    const samples = makeSamples(1);
    const target = [
      [1, 0.5, 0],
      [0.5, 1, 0],
      [0, 0, 1],
    ];
    expect(imanConover(samples, target, testRng(42))).toEqual(imanConover(samples, target, testRng(42)));
  });

  it("validates shapes", () => {
    expect(() => imanConover([new Float64Array(5), new Float64Array(4)], [[1, 0], [0, 1]], testRng())).toThrow();
    expect(() => imanConover([new Float64Array(5), new Float64Array(5)], [[1]], testRng())).toThrow();
  });
});

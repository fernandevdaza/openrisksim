import { describe as suite, expect, it } from "vitest";
import { averageRanks, argsort, jacobiEigen, stdNormalQuantile, tCritical975 } from "./numeric";

suite("numeric helpers", () => {
  it("stdNormalQuantile matches reference values", () => {
    expect(stdNormalQuantile(0.5)).toBeCloseTo(0, 12);
    expect(stdNormalQuantile(0.975)).toBeCloseTo(1.959963984540054, 8);
    expect(stdNormalQuantile(0.025)).toBeCloseTo(-1.959963984540054, 8);
    expect(stdNormalQuantile(0.001)).toBeCloseTo(-3.090232306167813, 7);
    expect(stdNormalQuantile(0.8413447460685429)).toBeCloseTo(1, 7);
    expect(stdNormalQuantile(0)).toBe(-Infinity);
    expect(stdNormalQuantile(1)).toBe(Infinity);
  });

  it("tCritical975 matches Student-t table", () => {
    expect(tCritical975(1)).toBeCloseTo(12.7062, 4);
    expect(tCritical975(11)).toBeCloseTo(2.2009851600916384, 8);
    expect(tCritical975(31)).toBeCloseTo(2.0395134463964077, 5);
    expect(tCritical975(100)).toBeCloseTo(1.9839715184496334, 6);
    expect(tCritical975(1e6)).toBeCloseTo(1.959966, 5);
  });

  it("argsort and averageRanks handle ties", () => {
    expect(Array.from(argsort([3, 1, 2, 1]))).toEqual([1, 3, 2, 0]);
    expect(Array.from(averageRanks([10, 20, 20, 30, 20]))).toEqual([1, 3, 3, 5, 3]);
  });

  it("jacobiEigen decomposes a symmetric matrix", () => {
    const m = [
      [4, 1, 2],
      [1, 3, 0.5],
      [2, 0.5, 5],
    ];
    const { values, vectors } = jacobiEigen(m);
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        let mv = 0;
        for (let t = 0; t < 3; t++) mv += m[i][t] * vectors[t][j];
        expect(mv).toBeCloseTo(values[j] * vectors[i][j], 10);
      }
    }
    expect(values.reduce((a, b) => a + b, 0)).toBeCloseTo(12, 10);
  });
});

suite("argsort (radix path)", () => {
  it("matches the comparator order for large arrays with ties, ±0 and infinities", () => {
    const n = 20000;
    const v = new Float64Array(n);
    let s = 7;
    for (let i = 0; i < n; i++) {
      s = (s * 1103515245 + 12345) % 2147483648;
      v[i] = i % 7 === 0 ? Math.round((s / 2147483648) * 10) - 5 : (s / 2147483648 - 0.5) * 1e6;
    }
    v[3] = -0;
    v[4] = 0;
    v[5] = Infinity;
    v[6] = -Infinity;
    v[8] = -1e-300;
    const ref = Array.from({ length: n }, (_, i) => i).sort((a, b) => v[a] - v[b] || a - b);
    expect(Array.from(argsort(v))).toEqual(ref);
    const r = averageRanks(v);
    expect(r[3]).toBe(r[4]);
    const withNaN = v.slice();
    withNaN[10] = NaN;
    expect(argsort(withNaN)).toHaveLength(n);
  });
});

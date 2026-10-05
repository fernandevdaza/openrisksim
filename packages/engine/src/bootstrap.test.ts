import { describe as suite, expect, it, vi } from "vitest";
import { bootstrap } from "./bootstrap";
import { tTestTwoSample } from "./tests";
import { testRng } from "./test-utils";

vi.mock("./deps", async () => (await import("./test-utils")).fakeDistributionsModule());

const mean = (v: Float64Array) => v.reduce((a, b) => a + b, 0) / v.length;

suite("bootstrap", () => {
  it("CI of the mean covers the estimate and has the expected width", () => {
    const rng = testRng(4);
    const data = Array.from({ length: 400 }, () => rng.next() * 12); // sd = √12 ≈ 3.46
    const r = bootstrap(data, mean, 2000, testRng(5));
    expect(r.samples).toHaveLength(2000);
    expect(r.estimate).toBeCloseTo(mean(Float64Array.from(data)), 12);
    expect(r.ci95[0]).toBeLessThan(r.estimate);
    expect(r.ci95[1]).toBeGreaterThan(r.estimate);
    // Expected width ≈ 2·1.96·3.46/20 ≈ 0.68
    expect(r.ci95[1] - r.ci95[0]).toBeGreaterThan(0.5);
    expect(r.ci95[1] - r.ci95[0]).toBeLessThan(0.85);
  });

  it("is deterministic, ignores NaN, handles empty input", () => {
    const d = [1, 2, 3, NaN, 4, 5];
    expect(bootstrap(d, mean, 100, testRng(1))).toEqual(bootstrap(d, mean, 100, testRng(1)));
    expect(bootstrap(d, mean, 10, testRng(1)).estimate).toBe(3);
    const e = bootstrap([], mean, 10, testRng(1));
    expect(e.estimate).toBeNaN();
    expect(e.ci95[0]).toBeNaN();
  });
});

suite("tTestTwoSample (Welch)", () => {
  it("t and df match scipy", () => {
    const r = tTestTwoSample([1, 2, 3, 4, 5, 6.5], [2, 4, 6, 8, 10, 13, 1]);
    expect(r.t).toBeCloseTo(-1.4711443212151227, 10);
    expect(r.df).toBeCloseTo(8.715682306789095, 10);
    // studentTCdf is mocked by a normal CDF here; the real p-value (0.1764) is checked in integration tests.
    expect(r.pValue).toBeGreaterThan(0.1);
    expect(r.pValue).toBeLessThan(0.2);
  });

  it("degenerate inputs", () => {
    expect(tTestTwoSample([1], [1, 2]).t).toBeNaN();
    expect(tTestTwoSample([1, 1], [1, 1])).toMatchObject({ t: 0, pValue: 1 });
    expect(tTestTwoSample([2, 2], [1, 1])).toMatchObject({ t: Infinity, pValue: 0 });
  });
});

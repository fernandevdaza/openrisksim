import { expect } from "vitest";

/** |a − e| ≤ atol + rtol·|e| (and equal infinities / NaNs). */
export function expectClose(actual: number, expected: number, rtol = 1e-12, atol = 0, label = ""): void {
  if (Number.isNaN(expected)) {
    expect(actual, label).toBeNaN();
    return;
  }
  if (!Number.isFinite(expected)) {
    expect(actual, label).toBe(expected);
    return;
  }
  const err = Math.abs(actual - expected);
  const tol = atol + rtol * Math.abs(expected);
  if (!(err <= tol)) {
    throw new Error(
      `${label} expected ${expected} but got ${actual} (abs err ${err.toExponential(3)}, rel err ${(err / Math.abs(expected)).toExponential(3)}, tol ${tol.toExponential(3)})`,
    );
  }
}

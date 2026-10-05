import { describe, expect, it } from "vitest";
import {
  chiSquareCdf,
  chiSquareQuantile,
  digamma,
  erf,
  erfc,
  fCdf,
  fQuantile,
  gamma,
  invRegIncBeta,
  invRegIncGammaP,
  lnBeta,
  lnGamma,
  normalCdf,
  normalQuantile,
  regIncBeta,
  regIncBetaComplement,
  regIncGammaP,
  regIncGammaQ,
  studentTCdf,
  studentTQuantile,
  trigamma,
} from "./special";
import { expectClose } from "./testdata/helpers";
import { REF } from "./testdata/scipyReference";

describe("erf / erfc", () => {
  it("matches mpmath to ~1e-15 relative", () => {
    for (const [x, v] of REF.erf) expectClose(erf(x), v, 1e-15, 1e-300, `erf(${x})`);
    for (const [x, v] of REF.erfc) expectClose(erfc(x), v, 2e-15, 1e-300, `erfc(${x})`);
  });
  it("handles special values", () => {
    expect(erf(0)).toBe(0);
    expect(erf(Infinity)).toBe(1);
    expect(erf(-Infinity)).toBe(-1);
    expect(erfc(Infinity)).toBe(0);
    expect(erfc(-Infinity)).toBe(2);
    expect(erf(NaN)).toBeNaN();
  });
});

describe("gamma functions", () => {
  it("lnGamma matches mpmath", () => {
    for (const [x, v] of REF.lnGamma) expectClose(lnGamma(x), v, 1e-14, 2e-15, `lnGamma(${x})`);
  });
  it("gamma matches mpmath and is exact for integers", () => {
    for (const [x, v] of REF.gamma) expectClose(gamma(x), v, 5e-14, 0, `gamma(${x})`);
    expect(gamma(5)).toBe(24);
    expect(gamma(1)).toBe(1);
    expect(gamma(11)).toBe(3628800);
    expect(gamma(0)).toBeNaN();
    expect(gamma(-3)).toBeNaN();
    expectClose(gamma(0.5), Math.sqrt(Math.PI), 1e-15);
  });
  it("digamma / trigamma", () => {
    for (const [x, v] of REF.digamma) expectClose(digamma(x), v, 1e-13, 1e-15, `digamma(${x})`);
    for (const [x, v] of REF.trigamma) expectClose(trigamma(x), v, 1e-13, 0, `trigamma(${x})`);
  });
});

describe("incomplete beta", () => {
  it("regIncBeta and its complement match scipy", () => {
    for (const [x, a, b, lower, upper] of REF.regIncBeta) {
      expectClose(regIncBeta(x, a, b), lower, 2e-12, 1e-300, `I(${x};${a},${b})`);
      expectClose(regIncBetaComplement(x, a, b), upper, 2e-12, 1e-300, `1-I(${x};${a},${b})`);
    }
  });
  it("edge values", () => {
    expect(regIncBeta(0, 2, 3)).toBe(0);
    expect(regIncBeta(1, 2, 3)).toBe(1);
    expect(regIncBeta(0.5, -1, 3)).toBeNaN();
    expectClose(regIncBeta(0.3, 1, 1), 0.3, 1e-15);
  });
  it("inverse matches scipy betaincinv and round-trips", () => {
    for (const [p, a, b, x] of REF.invRegIncBeta) {
      expectClose(invRegIncBeta(p, a, b), x, 1e-11, 1e-300, `Iinv(${p};${a},${b})`);
    }
    for (const a of [0.1, 0.5, 1, 2.5, 30, 400]) {
      for (const b of [0.1, 0.7, 1, 4, 60]) {
        for (const p of [1e-12, 1e-5, 0.01, 0.3, 0.5, 0.8, 0.99, 1 - 1e-9]) {
          const x = invRegIncBeta(p, a, b);
          expect(x >= 0 && x <= 1).toBe(true);
          if (1 - x < 1e-13 || x < 1e-290) continue; // true root not representable in double
          const back = p > 0.5 ? 1 - regIncBetaComplement(x, a, b) : regIncBeta(x, a, b);
          // conditioning: one ulp of x moves I_x(a,b) by dens(x)·ulp(x)
          const dens = Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log1p(-x) - lnBeta(a, b));
          const tol = 1e-10 * p + 8 * dens * 2.2e-16 * x;
          expectClose(back, p, 0, tol, `round-trip I(${p};${a},${b}) x=${x}`);
        }
      }
    }
  });
});

describe("incomplete gamma", () => {
  it("P and Q match scipy", () => {
    for (const [a, x, P, Q] of REF.regIncGamma) {
      expectClose(regIncGammaP(a, x), P, 5e-13, 1e-300, `P(${a},${x})`);
      expectClose(regIncGammaQ(a, x), Q, 5e-13, 1e-300, `Q(${a},${x})`);
    }
  });
  it("inverse matches scipy gammaincinv and round-trips", () => {
    for (const [p, a, x] of REF.invRegIncGammaP) expectClose(invRegIncGammaP(p, a), x, 1e-11, 0, `Pinv(${p};${a})`);
    for (const a of [0.05, 0.5, 1, 3, 25, 1000, 1e5]) {
      for (const p of [1e-12, 1e-4, 0.05, 0.5, 0.9, 1 - 1e-10]) {
        const x = invRegIncGammaP(p, a);
        const back = p > 0.5 ? 1 - regIncGammaQ(a, x) : regIncGammaP(a, x);
        expectClose(back, p, 1e-9, 0, `round-trip P(${a}) p=${p}`);
      }
    }
  });
});

describe("normal", () => {
  it("normalQuantile (AS241) has full double precision", () => {
    expectClose(normalQuantile(0.975), 1.959963984540054, 1e-15);
    expectClose(normalQuantile(0.5), 0, 0, 1e-300);
    for (const [p, z] of REF.normalQuantile) expectClose(normalQuantile(p), z, 1e-14, 1e-15, `Φ⁻¹(${p})`);
    expect(normalQuantile(0)).toBe(-Infinity);
    expect(normalQuantile(1)).toBe(Infinity);
    expect(normalQuantile(1.5)).toBeNaN();
  });
  it("normalCdf matches mpmath including far tails", () => {
    for (const [x, v] of REF.normalCdf) expectClose(normalCdf(x), v, 5e-14, 1e-300, `Φ(${x})`);
  });
  it("round-trips in the tails", () => {
    for (const p of [1e-300, 1e-200, 1e-50, 1e-12, 1e-3, 0.2, 0.6, 0.999]) {
      expectClose(normalCdf(normalQuantile(p)), p, 1e-12, 0, `Φ(Φ⁻¹(${p}))`);
    }
  });
});

describe("Student t, chi-square, F", () => {
  it("studentTCdf matches scipy", () => {
    for (const [t, df, v] of REF.studentTCdf) {
      // very large df: the incomplete-beta continued fraction needs ~√df terms (≈1e-11 accuracy)
      expectClose(studentTCdf(t, df), v, df > 1e5 ? 1e-10 : 1e-12, 1e-300, `T(${t};${df})`);
    }
  });
  it("studentTQuantile matches scipy", () => {
    for (const [p, df, v] of REF.studentTQuantile) expectClose(studentTQuantile(p, df), v, 1e-10, 1e-14, `Tinv(${p};${df})`);
    expect(studentTQuantile(0.5, 3)).toBe(0);
    expectClose(studentTQuantile(0.975, 1), 12.706204736174694, 1e-13);
  });
  it("chi-square and F", () => {
    for (const [x, df, v] of REF.chiSquareCdf) expectClose(chiSquareCdf(x, df), v, 1e-12, 0, `chi2(${x};${df})`);
    for (const [x, a, b, v] of REF.fCdf) expectClose(fCdf(x, a, b), v, 1e-12, 0, `F(${x};${a},${b})`);
    expectClose(chiSquareQuantile(0.95, 1), 3.8414588206941205, 1e-12);
    expectClose(fQuantile(0.95, 3, 10), 3.7082648190468435, 1e-11);
    expectClose(fQuantile(0.01, 3, 10), 0.03672590857653338, 1e-10);
  });
});

describe("performance", () => {
  it("normalQuantile is fast (< 2 µs per call)", () => {
    let s = 0;
    const n = 200_000;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) s += normalQuantile((i + 0.5) / n);
    const dt = ((performance.now() - t0) * 1000) / n;
    expect(Number.isFinite(s)).toBe(true);
    expect(dt).toBeLessThan(2);
  });
});

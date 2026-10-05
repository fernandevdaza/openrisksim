import { describe, expect, it } from "vitest";
import {
  acf,
  adfTest,
  arima,
  autoArima,
  autoForecast,
  decompose,
  errorMetrics,
  estimateGbm,
  geometricBrownianMotion,
  holt,
  holtWinters,
  jumpDiffusion,
  ljungBox,
  meanReversion,
  movingAverage,
  multipleRegression,
  pacf,
  seasonalityTest,
  simpleExponentialSmoothing,
  stepwiseRegression,
  trendForecast,
} from "./index";
import { chiSquareCdf, fCdf, normalCdf, normalQuantile, studentTCdf, studentTQuantile } from "./_stats";
import { cholesky, inverse, leastSquares, matMul } from "./linalg";
import { nelderMead, SeededRng } from "./optim";
import { mackinnonP } from "./tsa";

function simulateArma(n: number, phi: number[], theta: number[], c: number, sigma: number, seed: number, burn = 200): number[] {
  const rng = new SeededRng(seed);
  const y: number[] = [];
  const e: number[] = [];
  for (let t = 0; t < n + burn; t++) {
    const et = sigma * rng.normal();
    let v = c + et;
    phi.forEach((p, i) => (v += t - i - 1 >= 0 ? p * y[t - i - 1] : 0));
    theta.forEach((q, j) => (v += t - j - 1 >= 0 ? q * e[t - j - 1] : 0));
    y.push(v);
    e.push(et);
  }
  return y.slice(burn);
}

function randomWalk(n: number, seed: number, drift = 0): number[] {
  const rng = new SeededRng(seed);
  const y = [100];
  for (let t = 1; t < n; t++) y.push(y[t - 1] + drift + rng.normal());
  return y;
}

function seasonalSeries(n: number, seed: number, noise = 0.5): number[] {
  const rng = new SeededRng(seed);
  return Array.from({ length: n }, (_, t) => 100 + 0.5 * t + 10 * Math.sin((2 * Math.PI * t) / 12) + noise * rng.normal());
}

describe("internal numerics", () => {
  it("special functions match scipy", () => {
    expect(studentTQuantile(0.975, 6)).toBeCloseTo(2.446911851144979, 9);
    expect(studentTQuantile(0.975, 1)).toBeCloseTo(12.706204736174694, 8);
    expect(studentTCdf(-2.5, 3)).toBeCloseTo(0.04385332350403278, 12);
    expect(fCdf(3.2, 4, 10)).toBeCloseTo(0.9382110744703509, 12);
    expect(chiSquareCdf(7.5, 5)).toBeCloseTo(0.813970166397133, 12);
    expect(normalCdf(-3.3)).toBeCloseTo(0.0004834241423837776, 14);
    expect(normalQuantile(0.975)).toBeCloseTo(1.959963984540054, 12);
    expect(normalQuantile(1e-6)).toBeCloseTo(-4.753424308822899, 9);
  });
  it("linear algebra", () => {
    const a = [
      [4, 2, 0.6],
      [2, 5, 1],
      [0.6, 1, 3],
    ];
    const inv = inverse(a);
    const id = matMul(a, inv);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(id[i][j]).toBeCloseTo(i === j ? 1 : 0, 12);
    const l = cholesky(a);
    const llt = matMul(l, l.map((_, i) => l.map((r) => r[i])));
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(llt[i][j]).toBeCloseTo(a[i][j], 12);
    const ls = leastSquares(
      [1, 2, 3, 4, 5].map((x) => [1, x]),
      [1, 3, 2, 5, 4],
    );
    expect(ls.beta[0]).toBeCloseTo(0.6, 12);
    expect(ls.beta[1]).toBeCloseTo(0.8, 12);
    expect(() => leastSquares([[1, 2], [2, 4], [3, 6]], [1, 2, 3])).toThrow();
  });
  it("bounded Nelder–Mead", () => {
    const r = nelderMead((x) => (x[0] - 1) ** 2 + 10 * (x[1] + 2) ** 2, [0, 0], { lower: [-5, -1], upper: [5, 5] });
    expect(r.x[0]).toBeCloseTo(1, 4);
    expect(r.x[1]).toBeCloseTo(-1, 6); // bound active
  });
});

describe("errorMetrics", () => {
  it("tiny example", () => {
    const m = errorMetrics([1, 2, 3, 4], [1, 2, 3, 5]);
    expect(m.mae).toBeCloseTo(0.25, 14);
    expect(m.mse).toBeCloseTo(0.25, 14);
    expect(m.rmse).toBeCloseTo(0.5, 14);
    expect(m.mape).toBeCloseTo(0.0625, 14);
    expect(m.smape).toBeCloseTo(2 / 9 / 4, 14);
    expect(m.r2).toBeCloseTo(0.8, 14);
    expect(m.theilU).toBeCloseTo(Math.sqrt(1 / 9 / (1 + 0.25 + 1 / 9)), 12);
  });
  it("skips NaN pairs", () => {
    const m = errorMetrics([1, 2, 3], [NaN, 2, 4]);
    expect(m.mae).toBeCloseTo(0.5, 14);
  });
});

describe("regression", () => {
  // Excel LINEST documentation example (office building assessed value).
  const data = [
    [2310, 2, 2, 20, 142000],
    [2333, 2, 2, 12, 144000],
    [2356, 3, 1.5, 33, 151000],
    [2379, 3, 2, 43, 150000],
    [2402, 2, 3, 53, 139000],
    [2425, 4, 2, 23, 169000],
    [2448, 2, 1.5, 99, 126000],
    [2471, 2, 2, 34, 142900],
    [2494, 3, 3, 23, 163000],
    [2517, 4, 4, 55, 169000],
    [2540, 2, 3, 22, 149000],
  ];
  const X = data.map((r) => r.slice(0, 4));
  const y = data.map((r) => r[4]);

  it("matches Excel LINEST", () => {
    const r = multipleRegression(y, X, ["floor", "offices", "entrances", "age"]);
    const v = r.coefficients.map((c) => c.value);
    const se = r.coefficients.map((c) => c.stdError);
    const exp = [52317.83051, 27.64138737, 12529.76817, 2553.21066, -234.2371645];
    const expSe = [12237.3616, 5.429374042, 400.0668382, 530.6691519, 13.26801148];
    exp.forEach((e, i) => expect(v[i]).toBeCloseTo(e, 4));
    expSe.forEach((e, i) => expect(se[i]).toBeCloseTo(e, 5));
    expect(r.r2).toBeCloseTo(0.996747993, 9);
    expect(r.standardError).toBeCloseTo(970.5784629, 6);
    expect(r.fStatistic).toBeCloseTo(459.7536742, 5);
    expect(r.anova.dfRes).toBe(6);
    expect(r.anova.regressionSS).toBeCloseTo(1732393319.229, 2);
    expect(r.anova.residualSS).toBeCloseTo(5652135.316, 3);
    expect(r.coefficients[2].pValue).toBeCloseTo(7.03863111e-8, 14);
    expect(r.fPValue).toBeCloseTo(1.3723146899e-7, 15);
    expect(r.durbinWatson).toBeCloseTo(1.7967997912, 8);
    [1.82090203527, 1.11209943180, 1.80723798078, 1.12253899368].forEach((e, i) => expect(r.vif[i]).toBeCloseTo(e, 8));
    expect(r.coefficients[0].name).toBe("Intercept");
    expect(r.k).toBe(4);
    expect(r.n).toBe(11);
  });

  it("no-intercept regression uses uncentered R² (LINEST const=FALSE)", () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [2.1, 3.9, 6.2, 7.8, 10.1];
    const r = multipleRegression(ys, xs.map((x) => [x]), undefined, { intercept: false });
    const b = xs.reduce((s, x, i) => s + x * ys[i], 0) / xs.reduce((s, x) => s + x * x, 0);
    expect(r.coefficients[0].value).toBeCloseTo(b, 12);
    const sse = ys.reduce((s, v, i) => s + (v - b * xs[i]) ** 2, 0);
    expect(r.r2).toBeCloseTo(1 - sse / ys.reduce((s, v) => s + v * v, 0), 12);
  });

  it("stepwise selects the true regressors", () => {
    const rng = new SeededRng(7);
    const rows: number[][] = [];
    const ys: number[] = [];
    for (let i = 0; i < 80; i++) {
      const x = [rng.normal(), rng.normal(), rng.normal(), rng.normal()];
      rows.push(x);
      ys.push(2 + 3 * x[0] - 2 * x[2] + 0.5 * rng.normal());
    }
    const r = stepwiseRegression(ys, rows, ["a", "b", "c", "d"]);
    expect([...r.selected].sort()).toEqual(["a", "c"]);
    expect(r.coefficients.find((c) => c.name === "a")!.value).toBeCloseTo(3, 0);
    expect(r.coefficients.find((c) => c.name === "c")!.value).toBeCloseTo(-2, 0);
  });
});

describe("smoothing", () => {
  it("moving average", () => {
    const out = movingAverage([1, 2, 3, 4, 5, 6], 2, 3);
    expect(out.fitted.slice(0, 3).every(Number.isNaN)).toBe(true);
    expect(out.fitted[3]).toBeCloseTo(2, 12);
    expect(out.forecast).toEqual([5, 5]);
  });

  it("SES with fixed alpha follows the recursion; interval widths per FPP", () => {
    const out = simpleExponentialSmoothing([1, 2, 3], 3, 0.5);
    expect(out.fitted).toEqual([1, 1, 1.5]);
    expect(out.forecast[0]).toBeCloseTo(2.25, 12);
    const w1 = out.upper95[0] - out.forecast[0];
    const w3 = out.upper95[2] - out.forecast[2];
    expect(w3 / w1).toBeCloseTo(Math.sqrt(1 + 2 * 0.25), 10);
  });

  it("SES optimises alpha", () => {
    const y = randomWalk(200, 3);
    const out = simpleExponentialSmoothing(y, 5);
    expect(out.params.alpha).toBeGreaterThan(0.8); // random walk → alpha ≈ 1
    expect(out.forecast[0]).toBeCloseTo(out.forecast[4], 12);
  });

  it("Holt extrapolates a linear trend", () => {
    const y = Array.from({ length: 30 }, (_, t) => 5 + 2 * t);
    const out = holt(y, 3);
    expect(out.forecast[0]).toBeCloseTo(65, 4);
    expect(out.forecast[2]).toBeCloseTo(69, 4);
    const damped = holt(y, 50, { damped: true });
    expect(damped.params.phi).toBeGreaterThanOrEqual(0.8);
    expect(damped.forecast[49]).toBeLessThan(5 + 2 * 79);
  });

  it("Holt–Winters recovers seasonality with small forecast error", () => {
    const full = seasonalSeries(108, 11);
    const y = full.slice(0, 96);
    const truth = full.slice(96);
    const out = holtWinters(y, 12, 12);
    expect(out.method).toBe("holtWintersAdditive");
    const m = errorMetrics(truth, out.forecast);
    expect(m.mape).toBeLessThan(0.02);
    // Seasonal shape: forecast peak lands at the sine peak (t ≡ 3 mod 12).
    const detr = out.forecast.map((f, i) => f - (100 + 0.5 * (96 + i)));
    const peak = detr.indexOf(Math.max(...detr));
    expect((96 + peak) % 12).toBe(3);
    expect(out.metrics.r2).toBeGreaterThan(0.95);
    for (let i = 0; i < 12; i++) {
      expect(out.lower95[i]).toBeLessThan(out.lower80[i]);
      expect(out.upper80[i]).toBeLessThan(out.upper95[i]);
    }
    const mult = holtWinters(y, 12, 12, { seasonal: "multiplicative" });
    expect(errorMetrics(truth, mult.forecast).mape).toBeLessThan(0.03);
    expect(() => holtWinters(y.slice(0, 20), 12, 12)).toThrow();
  });
});

describe("ARIMA", () => {
  it("ARIMA(1,0,0) recovers φ ≈ 0.7 and the mean", () => {
    const y = simulateArma(500, [0.7], [], 3, 1, 42); // mean = 3/(1−0.7) = 10
    const out = arima(y, 10, { p: 1, d: 0, q: 0 });
    expect(out.params.ar1).toBeGreaterThan(0.62);
    expect(out.params.ar1).toBeLessThan(0.78);
    expect(out.params.mean).toBeGreaterThan(9.3);
    expect(out.params.mean).toBeLessThan(10.7);
    expect(out.params.sigma2).toBeGreaterThan(0.8);
    expect(out.params.sigma2).toBeLessThan(1.2);
    // Forecasts revert to the mean; intervals widen with h and converge.
    expect(Math.abs(out.forecast[9] - out.params.mean)).toBeLessThan(Math.abs(y[499] - out.params.mean) + 1e-9);
    const w = out.upper95.map((u, i) => u - out.lower95[i]);
    expect(w[0]).toBeCloseTo(2 * 1.959964 * Math.sqrt(out.params.sigma2), 6);
    expect(w[9]).toBeGreaterThan(w[0]);
    expect(out.fitted[0]).toBeCloseTo(out.params.mean, 10); // exact likelihood: first prediction = unconditional mean
    expect(ljungBox(out.residuals, 10).pValue).toBeGreaterThan(0.05);
  });

  it("ARIMA(0,1,1) recovers θ", () => {
    const w = simulateArma(600, [], [0.5], 0, 1, 5);
    const y = [50];
    for (const v of w) y.push(y[y.length - 1] + v);
    const out = arima(y, 5, { p: 0, d: 1, q: 1 });
    expect(out.params.ma1).toBeGreaterThan(0.4);
    expect(out.params.ma1).toBeLessThan(0.6);
    expect(Math.abs(out.params.drift)).toBeLessThan(0.3);
  });

  it("ARIMA(2,0,1) estimates and stays stationary", () => {
    const y = simulateArma(800, [0.6, -0.3], [0.5], 0, 1, 9);
    const out = arima(y, 12, { p: 2, d: 0, q: 1 });
    expect(Math.abs(out.params.ar1 - 0.6)).toBeLessThan(0.12);
    expect(Math.abs(out.params.ar2 + 0.3)).toBeLessThan(0.12);
    expect(Math.abs(out.params.ma1 - 0.5)).toBeLessThan(0.12);
    expect(out.forecast.every(Number.isFinite)).toBe(true);
  });

  it("autoArima picks sensible orders", () => {
    const ar = autoArima(simulateArma(400, [0.7], [], 0, 1, 21), 5);
    expect(ar.params.d).toBe(0);
    expect(ar.params.p).toBeGreaterThanOrEqual(1);
    expect(ar.params.p + ar.params.q).toBeLessThanOrEqual(3);
    const rw = autoArima(randomWalk(300, 8, 0.3), 5);
    expect(rw.params.d).toBe(1);
    expect(rw.forecast[4]).toBeGreaterThan(rw.forecast[0]);
  });
});

describe("trend & auto forecast", () => {
  it("trend curves fit exact data", () => {
    const lin = trendForecast([3, 5, 7, 9, 11], 2, "linear");
    expect(lin.forecast[0]).toBeCloseTo(13, 10);
    expect(lin.params.a).toBeCloseTo(1, 10);
    expect(lin.params.b).toBeCloseTo(2, 10);
    const ex = Array.from({ length: 10 }, (_, i) => 2 * Math.exp(0.3 * (i + 1)));
    const e = trendForecast(ex, 1, "exponential");
    expect(e.params.a).toBeCloseTo(2, 10);
    expect(e.params.b).toBeCloseTo(0.3, 10);
    expect(e.forecast[0]).toBeCloseTo(2 * Math.exp(3.3), 8);
    const pw = Array.from({ length: 10 }, (_, i) => 3 * Math.pow(i + 1, 1.5));
    expect(trendForecast(pw, 1, "power").params.b).toBeCloseTo(1.5, 10);
    const q = Array.from({ length: 10 }, (_, i) => 1 + (i + 1) - 0.5 * (i + 1) ** 2);
    expect(trendForecast(q, 1, "polynomial2").forecast[0]).toBeCloseTo(1 + 11 - 60.5, 8);
    const lg = Array.from({ length: 10 }, (_, i) => 4 + 2 * Math.log(i + 1));
    expect(trendForecast(lg, 1, "logarithmic").forecast[0]).toBeCloseTo(4 + 2 * Math.log(11), 10);
  });

  it("noisy linear trend: intervals contain the forecast", () => {
    const rng = new SeededRng(1);
    const y = Array.from({ length: 40 }, (_, t) => 10 + 0.5 * t + rng.normal());
    const out = trendForecast(y, 5, "polynomial3");
    for (let i = 0; i < 5; i++) {
      expect(out.lower95[i]).toBeLessThan(out.forecast[i]);
      expect(out.upper95[i]).toBeGreaterThan(out.forecast[i]);
    }
  });

  it("autoForecast prefers a seasonal model on seasonal data", () => {
    const y = seasonalSeries(96, 4);
    const r = autoForecast(y, 12, 12);
    expect(r.best.method.startsWith("holtWinters")).toBe(true);
    expect(r.ranking.length).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < r.ranking.length; i++) expect(r.ranking[i].rmse).toBeGreaterThanOrEqual(r.ranking[i - 1].rmse);
    expect(r.best.forecast).toHaveLength(12);
  });

  it("autoForecast works without a period", () => {
    const y = Array.from({ length: 30 }, (_, t) => 20 + 1.5 * t + Math.sin(t));
    const r = autoForecast(y, 4);
    expect(r.best.forecast[3]).toBeGreaterThan(y[29]);
    expect(r.ranking.some((x) => x.method.startsWith("arima"))).toBe(true);
  });
});

describe("stochastic processes", () => {
  it("GBM path mean ≈ s0·e^{μt}", () => {
    const paths = geometricBrownianMotion({ s0: 100, drift: 0.08, volatility: 0.25, dt: 1 / 12, steps: 24, paths: 20000, seed: 1 });
    expect(paths).toHaveLength(20000);
    expect(paths[0]).toHaveLength(25);
    expect(paths[0][0]).toBe(100);
    const m = paths.reduce((s, p) => s + p[24], 0) / paths.length;
    expect(m / (100 * Math.exp(0.16))).toBeCloseTo(1, 1);
    expect(Math.abs(m / (100 * Math.exp(0.16)) - 1)).toBeLessThan(0.015);
    // Deterministic with seed
    const again = geometricBrownianMotion({ s0: 100, drift: 0.08, volatility: 0.25, dt: 1 / 12, steps: 24, paths: 3, seed: 1 });
    expect(again[2]).toEqual(paths[2]);
  });

  it("mean reversion converges to the long-run mean with the OU stationary variance", () => {
    const paths = meanReversion({ s0: 0, longRunMean: 5, speed: 2, volatility: 1, dt: 0.1, steps: 100, paths: 5000, seed: 3 });
    const last = paths.map((p) => p[100]);
    const m = last.reduce((a, b) => a + b, 0) / last.length;
    const v = last.reduce((a, b) => a + (b - m) ** 2, 0) / (last.length - 1);
    expect(m).toBeCloseTo(5, 1);
    expect(v).toBeCloseTo(1 / (2 * 2), 1);
  });

  it("jump diffusion mean ≈ s0·e^{μt}", () => {
    const paths = jumpDiffusion({ s0: 50, drift: 0.05, volatility: 0.2, jumpRate: 1, jumpMean: -0.1, jumpStdDev: 0.15, dt: 1 / 52, steps: 52, paths: 20000, seed: 9 });
    const m = paths.reduce((s, p) => s + p[52], 0) / paths.length;
    expect(Math.abs(m / (50 * Math.exp(0.05)) - 1)).toBeLessThan(0.02);
  });

  it("estimateGbm recovers parameters", () => {
    const [path] = geometricBrownianMotion({ s0: 10, drift: 0.1, volatility: 0.3, dt: 1 / 252, steps: 252 * 40, paths: 1, seed: 17 });
    const est = estimateGbm(path, 1 / 252);
    expect(est.volatility).toBeCloseTo(0.3, 2);
    expect(Math.abs(est.drift - 0.1)).toBeLessThan(0.12); // drift is notoriously imprecise
  });
});

describe("time-series tools", () => {
  it("acf / pacf", () => {
    const r = acf([1, 2, 3, 4, 5], 2);
    // mean 3, c0 = 10; c1 = (−1·−2)+(0·−1)+(1·0)+(2·1) = 4; c2 = (0·−2)+(1·−1)+(2·0) = −1
    expect(r).toEqual([1, 0.4, -0.1].map((x) => expect.closeTo(x, 14)));
    const y = simulateArma(2000, [0.6], [], 0, 1, 2);
    const p = pacf(y, 5);
    expect(p[1]).toBeCloseTo(0.6, 1);
    for (let k = 2; k <= 5; k++) expect(Math.abs(p[k])).toBeLessThan(0.07);
    const a = acf(y, 3);
    expect(a[2]).toBeCloseTo(0.36, 1);
  });

  it("decomposition reconstructs the series", () => {
    const y = seasonalSeries(60, 6);
    const d = decompose(y, 12);
    let checked = 0;
    y.forEach((v, t) => {
      if (Number.isFinite(d.trend[t])) {
        expect(d.trend[t] + d.seasonal[t] + d.residual[t]).toBeCloseTo(v, 10);
        checked++;
      }
    });
    expect(checked).toBe(48);
    expect(d.seasonal.slice(0, 12).reduce((a, b) => a + b, 0)).toBeCloseTo(0, 10);
    expect(d.seasonal[3]).toBeGreaterThan(8);
    const dm = decompose(y, 12, "multiplicative");
    y.forEach((v, t) => {
      if (Number.isFinite(dm.trend[t])) expect(dm.trend[t] * dm.seasonal[t] * dm.residual[t]).toBeCloseTo(v, 10);
    });
    const odd = decompose(y, 5);
    expect(Number.isFinite(odd.trend[2])).toBe(true);
    expect(Number.isNaN(odd.trend[1])).toBe(true);
  });

  it("seasonality test finds the period", () => {
    const r = seasonalityTest(seasonalSeries(96, 2));
    expect(r[0].period).toBe(12);
    expect(r[0].strength).toBeGreaterThan(0.5);
    const q = seasonalityTest(Array.from({ length: 48 }, (_, t) => [5, 1, 3, 8][t % 4] + 0.01 * t));
    expect(q[0].period).toBe(4);
  });

  it("Ljung–Box", () => {
    const rng = new SeededRng(12);
    const wn = Array.from({ length: 300 }, () => rng.normal());
    expect(ljungBox(wn, 10).pValue).toBeGreaterThan(0.05);
    const ar = simulateArma(300, [0.6], [], 0, 1, 12);
    const lb = ljungBox(ar, 10);
    expect(lb.pValue).toBeLessThan(1e-6);
    expect(lb.q).toBeGreaterThan(50);
  });

  it("ADF test and MacKinnon p-values", () => {
    expect(mackinnonP(-2.86)).toBeCloseTo(0.05, 2);
    expect(mackinnonP(-3.43)).toBeCloseTo(0.01, 2);
    expect(mackinnonP(-2.57)).toBeCloseTo(0.1, 2);
    expect(mackinnonP(5)).toBe(1);
    const st = adfTest(simulateArma(300, [0.5], [], 1, 1, 33));
    expect(st.stationary).toBe(true);
    expect(st.statistic).toBeLessThan(-3.5);
    const rw = adfTest(randomWalk(300, 33));
    expect(rw.stationary).toBe(false);
    expect(rw.pValue).toBeGreaterThan(0.05);
  });
});

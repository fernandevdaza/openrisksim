/**
 * Stochastic process simulation (paths × (steps + 1), first column = s0) with a seeded RNG.
 */
import { SeededRng } from "./optim";

function check(p: { dt: number; steps: number; paths: number }): { steps: number; paths: number } {
  if (!(p.dt > 0)) throw new Error("dt must be > 0");
  return { steps: Math.max(0, Math.floor(p.steps)), paths: Math.max(0, Math.floor(p.paths)) };
}

/** Geometric Brownian motion, exact log-normal scheme: E[S_t] = s0·e^{drift·t}. */
export function geometricBrownianMotion(p: {
  s0: number;
  drift: number;
  volatility: number;
  dt: number;
  steps: number;
  paths: number;
  seed?: number;
}): number[][] {
  const { steps, paths } = check(p);
  const rng = new SeededRng(p.seed);
  const mu = (p.drift - 0.5 * p.volatility * p.volatility) * p.dt;
  const sig = p.volatility * Math.sqrt(p.dt);
  const out: number[][] = [];
  for (let k = 0; k < paths; k++) {
    const path = [p.s0];
    let s = p.s0;
    for (let i = 0; i < steps; i++) {
      s *= Math.exp(mu + sig * rng.normal());
      path.push(s);
    }
    out.push(path);
  }
  return out;
}

/** Ornstein–Uhlenbeck mean reversion, exact discretisation: dX = speed·(longRunMean − X)dt + σ dW. */
export function meanReversion(p: {
  s0: number;
  longRunMean: number;
  speed: number;
  volatility: number;
  dt: number;
  steps: number;
  paths: number;
  seed?: number;
}): number[][] {
  const { steps, paths } = check(p);
  const rng = new SeededRng(p.seed);
  const k = p.speed;
  const decay = Math.exp(-k * p.dt);
  const sd = k > 0 ? p.volatility * Math.sqrt((1 - Math.exp(-2 * k * p.dt)) / (2 * k)) : p.volatility * Math.sqrt(p.dt);
  const out: number[][] = [];
  for (let j = 0; j < paths; j++) {
    const path = [p.s0];
    let x = p.s0;
    for (let i = 0; i < steps; i++) {
      x = p.longRunMean + (x - p.longRunMean) * decay + sd * rng.normal();
      path.push(x);
    }
    out.push(path);
  }
  return out;
}

/**
 * Merton jump diffusion. Jumps arrive with intensity `jumpRate` (per unit time) and multiply the
 * price by e^J, J ~ N(jumpMean, jumpStdDev²). The diffusion drift is compensated so that the
 * total expected growth rate is `drift`: E[S_t] = s0·e^{drift·t}.
 */
export function jumpDiffusion(p: {
  s0: number;
  drift: number;
  volatility: number;
  jumpRate: number;
  jumpMean: number;
  jumpStdDev: number;
  dt: number;
  steps: number;
  paths: number;
  seed?: number;
}): number[][] {
  const { steps, paths } = check(p);
  const rng = new SeededRng(p.seed);
  const kappa = Math.exp(p.jumpMean + 0.5 * p.jumpStdDev * p.jumpStdDev) - 1;
  const mu = (p.drift - 0.5 * p.volatility * p.volatility - p.jumpRate * kappa) * p.dt;
  const sig = p.volatility * Math.sqrt(p.dt);
  const lambdaDt = p.jumpRate * p.dt;
  const out: number[][] = [];
  for (let j = 0; j < paths; j++) {
    const path = [p.s0];
    let s = p.s0;
    for (let i = 0; i < steps; i++) {
      let x = mu + sig * rng.normal();
      const nJumps = rng.poisson(lambdaDt);
      for (let q = 0; q < nJumps; q++) x += p.jumpMean + p.jumpStdDev * rng.normal();
      s *= Math.exp(x);
      path.push(s);
    }
    out.push(path);
  }
  return out;
}

/**
 * GBM parameters from a price series sampled every `dt` (e.g. 1/252 for daily data in years):
 * volatility = sd(log returns)/√dt, drift = mean(log returns)/dt + volatility²/2.
 */
export function estimateGbm(prices: number[], dt: number): { drift: number; volatility: number } {
  if (prices.length < 3) throw new Error("estimateGbm: need at least 3 prices");
  if (prices.some((v) => !(v > 0))) throw new Error("estimateGbm: prices must be positive");
  const r: number[] = [];
  for (let i = 1; i < prices.length; i++) r.push(Math.log(prices[i] / prices[i - 1]));
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  let v = 0;
  for (const x of r) v += (x - m) ** 2;
  v /= r.length - 1;
  const volatility = Math.sqrt(v / dt);
  return { drift: m / dt + 0.5 * volatility * volatility, volatility };
}

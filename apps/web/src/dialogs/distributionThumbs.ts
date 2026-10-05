import type { DistributionId, DistributionMeta, DistributionSpec } from "@openrisksim/core";
import { createDistribution, distributionCurve, getDistributionMeta } from "@openrisksim/distributions";

/** Default parameters from the registry metadata. */
export function metaDefaults(meta: DistributionMeta): Record<string, number> {
  const params: Record<string, number> = {};
  for (const p of meta.params) params[p.key] = p.default;
  return params;
}

/**
 * Default spec for a family, centred on the current cell value when it makes sense
 * (Risk Simulator behaviour: the cell value becomes the mean / most likely value).
 */
export function suggestedSpec(id: DistributionId, cellValue: number | null): DistributionSpec {
  const meta = getDistributionMeta(id);
  const params = metaDefaults(meta);
  const spec: DistributionSpec = { id, params };
  if (id === "custom") {
    spec.values = [1, 2, 3];
    spec.weights = [0.25, 0.5, 0.25];
  }
  const v = cellValue;
  if (v == null || !Number.isFinite(v) || v === 0) return spec;
  const a = Math.abs(v);
  const lo = v - a * 0.1;
  const hi = v + a * 0.1;
  const set = (o: Record<string, number>) => {
    for (const [k, x] of Object.entries(o)) if (k in params) params[k] = roundNice(x);
  };
  switch (id) {
    case "normal":
      set({ mean: v, stdDev: a * 0.1 });
      break;
    case "lognormal":
      if (v > 0) set({ mean: v, stdDev: v * 0.1 });
      break;
    case "uniform":
    case "arcsine":
    case "cosine":
      set({ min: lo, max: hi });
      break;
    case "triangular":
    case "pert":
      set({ min: lo, mode: v, max: hi });
      break;
    case "trapezoidal":
      set({ min: v - a * 0.15, mode1: v - a * 0.05, mode2: v + a * 0.05, max: v + a * 0.15 });
      break;
    case "powerFunction":
      set({ min: lo, max: hi });
      break;
    case "beta":
      set({ min: lo, max: hi });
      break;
    case "logistic":
      set({ mean: v, scale: a * 0.05 });
      break;
    case "studentT":
      set({ mean: v, scale: a * 0.1 });
      break;
    case "laplace":
    case "cauchy":
    case "gumbel":
      set({ location: v, scale: a * 0.1 });
      break;
    case "fixed":
      set({ value: v });
      break;
    case "poisson":
      if (v > 0) set({ lambda: v });
      break;
    case "exponential":
      if (v > 0) set({ rate: 1 / v });
      break;
    case "discreteUniform":
      set({ min: Math.floor(lo), max: Math.ceil(hi) });
      break;
    default:
      break;
  }
  return spec;
}

function roundNice(x: number): number {
  if (!Number.isFinite(x) || x === 0) return x;
  return Number(x.toPrecision(4));
}

const thumbCache = new Map<string, string>();

/** SVG path (viewBox 0 0 60 28) of the default pdf/pmf of a family. */
export function thumbnailPath(meta: DistributionMeta): { d: string; discrete: boolean } {
  const discrete = meta.kind === "discrete";
  const cached = thumbCache.get(meta.id);
  if (cached !== undefined) return { d: cached, discrete };
  let d = "";
  try {
    const spec: DistributionSpec = { id: meta.id, params: metaDefaults(meta) };
    if (meta.id === "custom") {
      spec.values = [1, 2, 3, 4];
      spec.weights = [0.2, 0.4, 0.3, 0.1];
    }
    const dist = createDistribution(spec);
    const c = distributionCurve(dist, 48);
    const n = c.x.length;
    if (n > 0) {
      const xmin = c.x[0];
      const xmax = c.x[n - 1];
      let ymax = 0;
      for (const y of c.pdf) if (Number.isFinite(y) && y > ymax) ymax = y;
      if (ymax <= 0) ymax = 1;
      const sx = (x: number) => (xmax > xmin ? 2 + ((x - xmin) / (xmax - xmin)) * 56 : 30);
      const sy = (y: number) => 26 - Math.min(1, Math.max(0, (Number.isFinite(y) ? y : 0) / ymax)) * 23;
      if (discrete) {
        const step = Math.max(1, Math.ceil(n / 14));
        for (let i = 0; i < n; i += step) d += `M${sx(c.x[i]).toFixed(1)} 26V${sy(c.pdf[i]).toFixed(1)}`;
      } else {
        d = `M${sx(c.x[0]).toFixed(1)} 26`;
        for (let i = 0; i < n; i++) d += `L${sx(c.x[i]).toFixed(1)} ${sy(c.pdf[i]).toFixed(1)}`;
        d += `L${sx(c.x[n - 1]).toFixed(1)} 26`;
      }
    }
  } catch {
    d = "";
  }
  thumbCache.set(meta.id, d);
  return { d, discrete };
}

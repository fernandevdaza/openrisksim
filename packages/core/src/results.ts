/** Result contracts produced by the engine and consumed by the UI / exporters. */

export interface DescriptiveStats {
  count: number;
  mean: number;
  median: number;
  mode: number; // estimated from histogram for continuous data
  stdDev: number;
  variance: number;
  /** Coefficient of variation = stdDev / |mean| (NaN when mean == 0). */
  cv: number;
  min: number;
  max: number;
  range: number;
  skewness: number;
  /** Excess kurtosis. */
  kurtosis: number;
  /** Standard error of the mean. */
  stdErrorMean: number;
  /** Percentiles 1..99 keyed by integer (1,5,10,...,95,99 at minimum; all 1..99 included). */
  percentiles: Record<number, number>;
  /** 95% confidence interval for the mean. */
  meanCI95: [number, number];
}

export interface HistogramBin {
  from: number;
  to: number;
  count: number;
  /** count / total */
  frequency: number;
  /** cumulative frequency up to and including this bin */
  cumulative: number;
}

/** Result for one forecast (output). */
export interface ForecastResult {
  forecastId: string;
  /** Raw values, length = completed trials. NaN for trials where the model errored. */
  values: Float64Array;
  stats: DescriptiveStats;
  /** Number of trials with error/NaN. */
  errors: number;
}

/** Sensitivity of one forecast to each assumption. */
export interface SensitivityEntry {
  assumptionId: string;
  /** Spearman rank correlation between assumption samples and forecast values. */
  rankCorrelation: number;
  /** Percentage of variance explained (normalised squared rank correlation), 0..1. */
  contributionToVariance: number;
}

/** Deterministic tornado entry (one-at-a-time, low/high percentile of the assumption). */
export interface TornadoEntry {
  assumptionId: string;
  baseOutput: number;
  lowInput: number;
  highInput: number;
  outputAtLow: number;
  outputAtHigh: number;
  /** |outputAtHigh - outputAtLow| */
  swing: number;
}

/** Spider chart series: output as the assumption moves across percentiles. */
export interface SpiderSeries {
  assumptionId: string;
  /** e.g. [0.1, 0.2, ..., 0.9] */
  percentiles: number[];
  inputs: number[];
  outputs: number[];
}

export interface SimulationResult {
  trials: number;
  elapsedMs: number;
  seed: number | null;
  /** Samples actually used for each assumption, keyed by assumption id. */
  assumptionSamples: Record<string, Float64Array>;
  forecasts: Record<string, ForecastResult>;
  /** sensitivity[forecastId] */
  sensitivity: Record<string, SensitivityEntry[]>;
  /** True if stopped by precision control. */
  stoppedEarly: boolean;
}

/** Progress messages sent from the simulation worker. */
export type SimulationProgress =
  | { type: "progress"; completed: number; total: number }
  | { type: "done"; result: SimulationResult }
  | { type: "error"; message: string };

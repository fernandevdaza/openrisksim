/**
 * Model contracts: how a spreadsheet becomes a simulation model.
 *
 * Cells are addressed as `CellRef` = `{ sheet, address }` where address is A1 notation ("B7").
 */
import type { DistributionSpec } from "./distributions";

export interface CellRef {
  sheet: string;
  /** A1 address, no `$` signs, e.g. "C12". */
  address: string;
}

/** Uncertain input cell (Risk Simulator: "Set Input Assumption"). */
export interface AssumptionDef {
  id: string;
  name: string;
  cell: CellRef;
  distribution: DistributionSpec;
  /** If false the base cell value is used (assumption temporarily disabled). */
  enabled: boolean;
}

/** Output cell to record (Risk Simulator: "Set Output Forecast"). */
export interface ForecastDef {
  id: string;
  name: string;
  cell: CellRef;
  /** Optional unit/format for display: "currency" | "percent" | "number". */
  format?: "currency" | "percent" | "number";
}

/** Decision variable for optimization. */
export interface DecisionVariableDef {
  id: string;
  name: string;
  cell: CellRef;
  type: "continuous" | "integer" | "binary" | "discrete";
  lower: number;
  upper: number;
  /** Step for "discrete" type. */
  step?: number;
}

/** Pairwise rank (Spearman) correlation between two assumptions. */
export interface CorrelationDef {
  a: string; // assumption id
  b: string; // assumption id
  /** Correlation coefficient in [-1, 1]. */
  rho: number;
}

export type SamplingMethod = "monteCarlo" | "latinHypercube";

export interface SimulationSettings {
  trials: number;
  /** Null = random seed each run. */
  seed: number | null;
  sampling: SamplingMethod;
  /** Apply correlations (Iman–Conover rank correlation). */
  applyCorrelations: boolean;
  /** Stop early when forecast mean precision is reached (optional). */
  precisionControl?: { forecastId: string; relativeError: number; confidence: number } | null;
}

export const DEFAULT_SETTINGS: SimulationSettings = {
  trials: 5000,
  seed: 12345,
  sampling: "latinHypercube",
  applyCorrelations: true,
  precisionControl: null,
};

/** Everything that the user defines on top of the workbook. Persisted inside exported .xlsx and as .orsim.json. */
export interface RiskModel {
  version: 1;
  assumptions: AssumptionDef[];
  forecasts: ForecastDef[];
  decisions: DecisionVariableDef[];
  correlations: CorrelationDef[];
  settings: SimulationSettings;
}

export function emptyModel(): RiskModel {
  return {
    version: 1,
    assumptions: [],
    forecasts: [],
    decisions: [],
    correlations: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

/**
 * Anything that can turn a vector of assumption values into a vector of forecast values.
 * The workbook package implements it with a formula engine; tests implement it with plain JS.
 * Order of `inputs` = order of `RiskModel.assumptions` (enabled ones only, see SimulationInput).
 * Order of the output = order of `RiskModel.forecasts`.
 */
export interface ModelEvaluator {
  evaluate(inputs: Float64Array): Float64Array;
}

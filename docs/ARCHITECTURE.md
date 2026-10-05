# OpenRiskSim — Architecture & public API contracts

OpenRiskSim is an open-source, browser-based alternative to Risk Simulator / @RISK / Crystal Ball.
The user opens an `.xlsx` (from Excel, LibreOffice, WPS, Google Sheets…), marks **assumption** cells
(uncertain inputs with a probability distribution) and **forecast** cells (outputs), runs a Monte
Carlo simulation, and gets charts, statistics, sensitivity analysis, plus forecasting, distribution
fitting, optimization and project-finance tools. Everything runs locally in the browser (no server).

- Monorepo with pnpm workspaces. Packages are consumed **from source** (`exports` → `src/index.ts`), no build step.
- TypeScript strict. Tests with Vitest (`pnpm test` at the root, files `src/**/*.test.ts`).
- Code, comments, identifiers and docs in **English**. UI is bilingual **es/en**.
- License GPL-3.0-or-later (HyperFormula is GPLv3).
- **Never add a runtime dependency** to a package without it being listed here. Pure TS math is preferred.

```
packages/
  core/           shared types only (DistributionSpec, RiskModel, SimulationResult…)  ← already written
  distributions/  RNG, special functions, 33 distributions, distribution fitting
  engine/         sampling (MC / LHS), correlations, descriptive stats, simulation runner, sensitivity
  finance/        NPV, IRR, MIRR, payback, B/C, depreciation, loans, break-even, scenarios
  forecast/       regression, smoothing, ARIMA, curve fitting, stochastic processes, error metrics
  optimizer/      Nelder–Mead, genetic algorithm, simulated annealing; static/stochastic optimization
  workbook/       xlsx/csv import/export, HyperFormula engine, ModelEvaluator, worker, reports
apps/
  web/            React 19 + Vite + Tailwind 4 + ECharts + zustand + i18next UI
```

Dependency graph: `core ← distributions ← engine ← optimizer`, `core ← finance`, `distributions ← forecast`,
`workbook ← (core, distributions, engine, finance)`, `web ← everything`.

---

## `@openrisksim/core` (done — read `packages/core/src/*.ts`)
Types: `DistributionId`, `DISTRIBUTION_IDS`, `DistributionSpec`, `DistributionMeta`, `ParamMeta`, `I18nText`,
`Distribution`, `Rng`, `CellRef`, `AssumptionDef`, `ForecastDef`, `DecisionVariableDef`, `CorrelationDef`,
`SamplingMethod`, `SimulationSettings`, `DEFAULT_SETTINGS`, `RiskModel`, `emptyModel()`, `ModelEvaluator`,
`DescriptiveStats`, `HistogramBin`, `ForecastResult`, `SensitivityEntry`, `TornadoEntry`, `SpiderSeries`,
`SimulationResult`, `SimulationProgress`, `newId()`, `cellKey()`.

---

## `@openrisksim/distributions`

```ts
// RNG
export function createRng(seed?: number | null): Rng;            // xoshiro128** (or PCG32); null/undefined → random seed
// Special functions (exported for reuse by forecast/engine)
export function erf(x: number): number; export function erfc(x: number): number;
export function lnGamma(x: number): number; export function gamma(x: number): number;
export function regIncBeta(x: number, a: number, b: number): number;      // I_x(a,b)
export function regIncGammaP(a: number, x: number): number;               // P(a,x)
export function normalCdf(x: number): number; export function normalQuantile(p: number): number; // standard normal (Acklam/Wichura AS241)
export function studentTCdf(t: number, df: number): number; export function studentTQuantile(p: number, df: number): number;
export function chiSquareCdf(x: number, df: number): number; export function fCdf(x: number, d1: number, d2: number): number;

// Registry
export const DISTRIBUTION_META: DistributionMeta[];               // one per DistributionId, bilingual labels, sensible defaults
export function getDistributionMeta(id: DistributionId): DistributionMeta;
export function createDistribution(spec: DistributionSpec): Distribution;   // throws DistributionError on invalid params
export function validateSpec(spec: DistributionSpec): { ok: true } | { ok: false; errors: { key: string; message: I18nText }[] };
export class DistributionError extends Error {}
/** Points for plotting pdf/pmf + cdf: continuous → `n` evenly spaced x over [q(0.001), q(0.999)]; discrete → each integer. */
export function distributionCurve(d: Distribution, n?: number): { x: number[]; pdf: number[]; cdf: number[] };

// Fitting
export interface FitResult {
  spec: DistributionSpec;                 // fitted params
  logLikelihood: number; aic: number; bic: number;
  ks: { statistic: number; pValue: number };
  ad: { statistic: number; pValue: number | null };   // Anderson–Darling (continuous only)
  chiSquare: { statistic: number; pValue: number; bins: number } | null;
  rank: number;                           // 1 = best (by chosen criterion)
}
export function fitDistributions(data: number[], options?: {
  candidates?: DistributionId[];          // default: all families that make sense for the data (e.g. positive-only for lognormal/gamma…)
  discrete?: boolean;                     // default: auto (all integers)
  rankBy?: "ks" | "aic" | "bic" | "ad";   // default "aic"
}): FitResult[];                          // sorted by rank, failed fits omitted
```
Semantics of params (keys used in `DistributionSpec.params`) — **must match exactly** because the UI and xlsx use them:
normal{mean,stdDev} · lognormal{mean,stdDev} (of the variable itself, not of ln) · uniform{min,max} · triangular{min,mode,max} ·
pert{min,mode,max} · beta{alpha,beta,min,max} · gamma{shape,scale} · exponential{rate} · weibull{shape,scale,location} ·
logistic{mean,scale} · studentT{df,mean,scale} · chiSquare{df} · f{df1,df2} · cauchy{location,scale} · gumbel{location,scale} (max) ·
frechet{shape,scale,location} · pareto{shape,scale} · laplace{location,scale} · rayleigh{scale} · erlang{k,rate} · arcsine{min,max} ·
cosine{min,max} · powerFunction{alpha,min,max} · trapezoidal{min,mode1,mode2,max} · bernoulli{p} · binomial{n,p} · poisson{lambda} ·
geometric{p} (failures before 1st success) · negativeBinomial{r,p} · hypergeometric{population,successes,draws} ·
discreteUniform{min,max} · custom (values/weights; if weights absent → empirical continuous resampling) · fixed{value}.
Truncation `spec.truncate` is applied by inverse-CDF on the restricted range: `q(cdf(min) + u·(cdf(max)−cdf(min)))`.

## `@openrisksim/engine`

```ts
/** Generate n×k matrix of uniforms (columns = assumptions). LHS = stratified per column, randomly permuted. */
export function generateUniforms(n: number, k: number, method: SamplingMethod, rng: Rng): Float64Array[];
/** Iman–Conover: reorder columns of `samples` so their rank correlation ≈ target (k×k, symmetric, unit diag). Repairs non-PSD with nearest-PSD. */
export function imanConover(samples: Float64Array[], target: number[][], rng: Rng): Float64Array[];
export function nearestPositiveDefinite(m: number[][]): number[][];
export function cholesky(m: number[][]): number[][];             // lower-triangular; throws if not PD
export function correlationMatrixFromDefs(assumptionIds: string[], defs: CorrelationDef[]): number[][];
/** Samples for every *enabled* assumption, shape [assumption][trial]. Uses createDistribution + quantile(u) with truncation. */
export function sampleAssumptions(model: RiskModel, n: number, rng: Rng): Record<string, Float64Array>;

// Descriptive statistics
export function describe(values: ArrayLike<number>): DescriptiveStats;      // ignores NaN
export function histogram(values: ArrayLike<number>, bins?: number | "auto"): HistogramBin[];  // auto = Freedman–Diaconis clamped [10,100]
export function percentile(sorted: ArrayLike<number>, p: number): number;    // p in [0,1], linear interpolation (Excel PERCENTILE.INC)
export function certainty(values: ArrayLike<number>, lower: number, upper: number): number; // share of values in [lower, upper]
export function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number;
export function spearman(a: ArrayLike<number>, b: ArrayLike<number>): number;
export function empiricalCdf(values: ArrayLike<number>, points?: number): { x: number[]; p: number[] };

// Simulation
export interface RunOptions {
  onProgress?: (completed: number, total: number) => void;   // throttled (~every 1–2% of trials)
  signal?: AbortSignal;                                       // abort → return partial result
  chunkSize?: number;                                         // trials per yield to event loop (default 250)
}
/** Runs the model. Evaluator inputs follow the order of *enabled* assumptions in model.assumptions; outputs follow model.forecasts. */
export async function runSimulation(model: RiskModel, evaluator: ModelEvaluator, options?: RunOptions): Promise<SimulationResult>;
export function computeSensitivity(assumptionSamples: Record<string, Float64Array>, forecastValues: Float64Array): SensitivityEntry[]; // sorted by |rankCorrelation| desc
/** One-at-a-time tornado: each enabled assumption at its pLow/pHigh percentile, others at base value. */
export function tornado(model: RiskModel, evaluator: ModelEvaluator, baseInputs: Float64Array, forecastIndex: number, opts?: { pLow?: number; pHigh?: number }): TornadoEntry[]; // default 0.1/0.9, sorted by swing desc
export function spider(model: RiskModel, evaluator: ModelEvaluator, baseInputs: Float64Array, forecastIndex: number, percentiles?: number[]): SpiderSeries[];
/** Scenario table: 2 inputs varied over grids → output matrix (data-table style). */
export function scenarioTable(evaluator: ModelEvaluator, baseInputs: Float64Array, idxA: number, valuesA: number[], idxB: number, valuesB: number[], forecastIndex: number): number[][];
/** Bootstrap of a statistic (confidence of the mean, stdev, percentile). */
export function bootstrap(values: ArrayLike<number>, stat: (v: Float64Array) => number, resamples: number, rng: Rng): { estimate: number; ci95: [number, number]; samples: Float64Array };
// Hypothesis tests on simulated forecasts
export function tTestTwoSample(a: ArrayLike<number>, b: ArrayLike<number>): { t: number; df: number; pValue: number };
```

## `@openrisksim/finance`
All rates as fractions (0.12 = 12%). Cash flow arrays start at period 0. Excel-compatible conventions.
```ts
export function npv(rate: number, cashFlows: number[]): number;            // includes period 0 undiscounted (unlike Excel NPV)
export function excelNpv(rate: number, values: number[]): number;          // Excel semantics (first value discounted 1 period)
export function irr(cashFlows: number[], guess?: number): number;          // NaN if none; robust (Newton + bisection fallback)
export function allIrrs(cashFlows: number[]): number[];                    // all sign-change roots in (-0.99, 10)
export function mirr(cashFlows: number[], financeRate: number, reinvestRate: number): number;
export function xnpv(rate: number, cashFlows: number[], dates: Date[]): number;
export function xirr(cashFlows: number[], dates: Date[], guess?: number): number;
export function paybackPeriod(cashFlows: number[]): number;                // fractional periods, Infinity if never
export function discountedPaybackPeriod(rate: number, cashFlows: number[]): number;
export function profitabilityIndex(rate: number, cashFlows: number[]): number;   // PV(inflows after t0)/|initial investment|
export function benefitCostRatio(rate: number, benefits: number[], costs: number[]): number;
export function equivalentAnnualAnnuity(rate: number, cashFlows: number[]): number;
export function pmt(rate: number, nper: number, pv: number, fv?: number, type?: 0 | 1): number;
export function pv(rate: number, nper: number, pmt: number, fv?: number, type?: 0 | 1): number;
export function fv(rate: number, nper: number, pmt: number, pv?: number, type?: 0 | 1): number;
export function nper(rate: number, pmt: number, pv: number, fv?: number, type?: 0 | 1): number;
export function effectiveRate(nominal: number, periodsPerYear: number): number;
export function nominalRate(effective: number, periodsPerYear: number): number;
export function realRate(nominal: number, inflation: number): number;       // Fisher
export function wacc(p: { equity: number; debt: number; costEquity: number; costDebt: number; taxRate: number }): number;
export function capm(p: { riskFree: number; beta: number; marketReturn: number; countryRisk?: number }): number;
export interface AmortizationRow { period: number; payment: number; interest: number; principal: number; balance: number }
export function amortizationSchedule(p: { principal: number; rate: number; periods: number; method: "french" | "german" | "american" }): AmortizationRow[];
export function depreciation(p: { cost: number; salvage: number; life: number; method: "straightLine" | "decliningBalance" | "doubleDeclining" | "sumOfYears" | "units"; units?: number[] }): number[];
/** Generic root-finding break-even: value x such that f(x) = target. */
export function breakEven(f: (x: number) => number, target: number, lo: number, hi: number): number;
export function accountingBreakEven(p: { fixedCosts: number; pricePerUnit: number; variableCostPerUnit: number }): { units: number; revenue: number };
/** Standard project cash-flow builder used by the "Project evaluator" tool. */
export interface ProjectInputs {
  horizon: number; investment: number; workingCapital: number; salvageValue: number;
  units: number[]; price: number[]; variableCost: number[]; fixedCosts: number[];
  depreciationMethod: "straightLine" | "doubleDeclining" | "sumOfYears"; depreciableLife: number;
  taxRate: number; discountRate: number;
  loan?: { amount: number; rate: number; periods: number; method: "french" | "german" | "american" };
}
export interface ProjectCashFlowTable { rows: { key: string; label: I18nText; values: number[] }[]; freeCashFlow: number[]; equityCashFlow: number[] | null }
export function buildProjectCashFlow(inputs: ProjectInputs): ProjectCashFlowTable;
export interface ProjectIndicators { npv: number; irr: number; mirr: number; payback: number; discountedPayback: number; profitabilityIndex: number; eaa: number }
export function projectIndicators(cashFlows: number[], rate: number, reinvestRate?: number): ProjectIndicators;
/** Scenario analysis (pessimistic / base / optimistic, or custom) with probabilities → expected value & stdev. */
export function scenarioAnalysis(s: { name: string; probability: number; value: number }[]): { expected: number; stdDev: number; cv: number };
```

## `@openrisksim/forecast`
Series are `number[]` (equally spaced periods). Every model returns a common `ForecastOutput`.
```ts
export interface ForecastOutput {
  method: string; params: Record<string, number>;
  fitted: number[];                  // in-sample one-step fitted values (NaN where undefined)
  forecast: number[];                // h periods ahead
  lower95: number[]; upper95: number[]; lower80: number[]; upper80: number[];
  residuals: number[];
  metrics: ErrorMetrics;
}
export interface ErrorMetrics { mae: number; mse: number; rmse: number; mape: number; smape: number; theilU: number; r2: number; aic?: number; bic?: number }
export function errorMetrics(actual: number[], fitted: number[]): ErrorMetrics;
export function movingAverage(y: number[], h: number, window: number): ForecastOutput;
export function simpleExponentialSmoothing(y: number[], h: number, alpha?: number): ForecastOutput;  // alpha optimised (SSE) when omitted
export function holt(y: number[], h: number, opts?: { alpha?: number; beta?: number; damped?: boolean; phi?: number }): ForecastOutput;
export function holtWinters(y: number[], h: number, period: number, opts?: { seasonal?: "additive" | "multiplicative"; alpha?: number; beta?: number; gamma?: number }): ForecastOutput;
export function arima(y: number[], h: number, order: { p: number; d: number; q: number }): ForecastOutput;   // CSS/least squares + numerical optimiser
export function autoArima(y: number[], h: number, opts?: { maxP?: number; maxD?: number; maxQ?: number }): ForecastOutput; // AIC search
export function autoForecast(y: number[], h: number, period?: number): { best: ForecastOutput; ranking: { method: string; rmse: number; aic?: number }[] };
export function trendForecast(y: number[], h: number, kind: "linear" | "exponential" | "logarithmic" | "power" | "polynomial2" | "polynomial3"): ForecastOutput;

export interface RegressionResult {
  coefficients: { name: string; value: number; stdError: number; t: number; pValue: number; ci95: [number, number] }[];
  r2: number; adjR2: number; fStatistic: number; fPValue: number; standardError: number;
  durbinWatson: number; n: number; k: number; residuals: number[]; fitted: number[];
  vif: number[];                    // multicollinearity per regressor
  anova: { regressionSS: number; residualSS: number; totalSS: number; dfReg: number; dfRes: number };
}
export function multipleRegression(y: number[], X: number[][], names?: string[], opts?: { intercept?: boolean }): RegressionResult; // X: rows = observations
export function stepwiseRegression(y: number[], X: number[][], names?: string[], opts?: { pEnter?: number; pRemove?: number }): RegressionResult & { selected: string[] };

// Stochastic processes (paths for simulation/charts): returns `paths` × (steps+1)
export function geometricBrownianMotion(p: { s0: number; drift: number; volatility: number; dt: number; steps: number; paths: number; seed?: number }): number[][];
export function meanReversion(p: { s0: number; longRunMean: number; speed: number; volatility: number; dt: number; steps: number; paths: number; seed?: number }): number[][]; // Ornstein–Uhlenbeck
export function jumpDiffusion(p: { s0: number; drift: number; volatility: number; jumpRate: number; jumpMean: number; jumpStdDev: number; dt: number; steps: number; paths: number; seed?: number }): number[][]; // Merton
export function estimateGbm(prices: number[], dt: number): { drift: number; volatility: number };
// Descriptive time-series tools
export function acf(y: number[], maxLag: number): number[]; export function pacf(y: number[], maxLag: number): number[];
export function decompose(y: number[], period: number, kind?: "additive" | "multiplicative"): { trend: number[]; seasonal: number[]; residual: number[] };
export function seasonalityTest(y: number[], maxPeriod?: number): { period: number; strength: number }[];
export function ljungBox(residuals: number[], lags: number): { q: number; pValue: number };
export function adfTest(y: number[]): { statistic: number; pValue: number; stationary: boolean };
```

## `@openrisksim/optimizer`
```ts
export interface OptVariable { id: string; lower: number; upper: number; type: "continuous" | "integer" | "binary" | "discrete"; step?: number }
export interface OptConstraint { id: string; label?: string; /** g(x) must satisfy `op` rhs */ evaluate: (x: number[]) => number | Promise<number>; op: "<=" | ">=" | "="; rhs: number }
export interface OptProblem {
  variables: OptVariable[];
  objective: (x: number[]) => number | Promise<number>;  // may run a full simulation (stochastic optimization)
  sense: "maximize" | "minimize";
  constraints?: OptConstraint[];
  initial?: number[];
}
export interface OptOptions {
  algorithm?: "auto" | "nelderMead" | "genetic" | "simulatedAnnealing";  // auto: GA if any integer/binary/discrete var, else NM with restarts
  maxEvaluations?: number; tolerance?: number; seed?: number; populationSize?: number;
  onProgress?: (p: { evaluations: number; best: number; bestX: number[] }) => void;
  signal?: AbortSignal;
}
export interface OptResult {
  x: number[]; value: number; feasible: boolean; evaluations: number;
  constraintValues: number[]; history: { evaluation: number; best: number }[]; algorithm: string; message: string;
}
export async function optimize(problem: OptProblem, options?: OptOptions): Promise<OptResult>;
/** Efficient frontier: re-optimize while sweeping one constraint's rhs. */
export async function efficientFrontier(problem: OptProblem, constraintId: string, rhsValues: number[], options?: OptOptions): Promise<{ rhs: number; result: OptResult }[]>;
/** Builds the objective for stochastic optimization: statistic of a forecast after a simulation with decisions fixed. */
export type ForecastStatistic = "mean" | "median" | "stdDev" | "cv" | "p5" | "p10" | "p90" | "p95" | "probAbove" | "probBelow";
export function statisticOf(values: Float64Array, stat: ForecastStatistic, threshold?: number): number;
```

## `@openrisksim/workbook`
```ts
// In-memory workbook representation (what the grid renders)
export interface CellData { v?: number | string | boolean | null; f?: string /* formula without "=" */; t?: "n" | "s" | "b" | "e"; z?: string /* number format */; s?: CellStyle }
export interface CellStyle { bold?: boolean; italic?: boolean; color?: string; bg?: string; align?: "left" | "center" | "right" }
export interface SheetData { name: string; rows: number; cols: number; cells: Record<string, CellData> /* key: A1 */; colWidths?: Record<number, number>; merges?: string[] }
export interface WorkbookData { sheets: SheetData[]; model: RiskModel | null /* stored in hidden sheet "_openrisksim" */; fileName?: string }

export async function readXlsx(buf: ArrayBuffer, fileName?: string): Promise<WorkbookData>;
export async function readCsv(text: string, fileName?: string): Promise<WorkbookData>;
export async function writeXlsx(wb: WorkbookData, opts?: { includeModel?: boolean; reports?: ReportSheet[] }): Promise<ArrayBuffer>;
export interface ReportSheet { name: string; rows: (string | number | null)[][]; images?: { pngBase64: string; at: string; width: number; height: number }[] }
export function buildSimulationReport(model: RiskModel, result: SimulationResult, locale: "es" | "en"): ReportSheet[];

// Address helpers
export function parseA1(a1: string): { row: number; col: number };     // 0-based
export function toA1(row: number, col: number): string;
export function parseRange(range: string): { start: { row: number; col: number }; end: { row: number; col: number } };
export function colToLetters(col: number): string;

// Formula engine (HyperFormula wrapper)
export class SpreadsheetEngine {
  static fromWorkbook(wb: WorkbookData): SpreadsheetEngine;
  getValue(ref: CellRef): number | string | boolean | null | { error: string };
  getFormula(ref: CellRef): string | null;
  setCell(ref: CellRef, input: string | number | null): void;  // "=..." → formula
  getRangeValues(sheet: string, range: string): (number | string | boolean | null)[][];
  setRangeValues(sheet: string, topLeft: string, values: (number | string | null)[][]): void;
  sheetNames(): string[];
  addSheet(name: string): void;
  toWorkbookData(model: RiskModel | null): WorkbookData;       // serialise current state (formulas + values)
  onChange(cb: (changed: CellRef[]) => void): () => void;
  undo(): void; redo(): void;
  destroy(): void;
}
/** Fast evaluator: sets assumption cells, recalculates, reads forecasts. Restores original contents on dispose(). */
export function createWorkbookEvaluator(engine: SpreadsheetEngine, model: RiskModel, overrides?: { decisions?: { ref: CellRef; value: number }[] }): ModelEvaluator & { baseInputs(): Float64Array; dispose(): void };
/** Simulation in a Web Worker. */
export interface SimulationJob { workbook: WorkbookData; model: RiskModel; decisionValues?: Record<string, number> }
export function runSimulationInWorker(job: SimulationJob, onProgress?: (p: SimulationProgress) => void, signal?: AbortSignal): Promise<SimulationResult>;
/** Example workbooks (built programmatically): project evaluation, retail inventory, portfolio, etc. */
export const EXAMPLES: { id: string; name: I18nText; description: I18nText; build: () => WorkbookData }[];
```
HyperFormula custom functions registered by `SpreadsheetEngine` (so models can also contain risk functions directly, like
Risk Simulator's `RS*` / @RISK's `Risk*` functions): `ORS.NORMAL(mean,sd)`, `ORS.TRIANGULAR(min,mode,max)`, `ORS.UNIFORM(min,max)`,
`ORS.PERT(min,mode,max)`, `ORS.LOGNORMAL(mean,sd)` — they return the distribution mean in normal recalcs. Finance helpers
`ORS.MIRR`, `ORS.PAYBACK(range)`, `ORS.DPAYBACK(rate,range)`, `ORS.PI(rate,range)`.

## `apps/web`
Vite + React 19 + TS + Tailwind 4 (`@tailwindcss/vite`) + ECharts (direct `echarts` import, wrapper component) + zustand +
i18next/react-i18next + lucide-react + vite-plugin-pwa (installable, offline).

Layout (Risk-Simulator-like):
- **Top ribbon** with tabs: *Archivo/File* (open xlsx/csv, examples, save xlsx with model, export report, language), *Simulación/Simulation*
  (Define assumption, Define forecast, Define decision, Correlations, Settings, Run, Step, Reset, Copy/Paste/Delete definitions),
  *Herramientas analíticas/Analytical tools* (tornado, spider, sensitivity, scenario table, distribution fitting, bootstrap, hypothesis test,
  overlay charts), *Pronóstico/Forecasting* (time-series, auto-ARIMA, regression, stochastic processes, trend), *Optimización/Optimization*,
  *Finanzas/Finance* (project evaluator, NPV/IRR calculator, loan amortization, depreciation, WACC/CAPM, break-even), *Ayuda/Help*.
- **Center**: spreadsheet grid (virtualized, sheet tabs, formula bar, cell selection, editing, number formats). Cells with assumptions are
  green, forecasts blue, decisions yellow (like Risk Simulator).
- **Right dock / floating windows**: forecast chart windows (histogram, CDF, certainty sliders with two-tail/left/right + certainty %,
  statistics, percentiles, overlay), model explorer (tree of assumptions/forecasts/decisions).

Shared app state (`apps/web/src/store/*`, zustand) — **owned by the shell agent**; tool components consume it:
```ts
useWorkbookStore: { engine: SpreadsheetEngine | null; workbook: WorkbookData | null; activeSheet: string; selection: { sheet: string; range: string /* "B2:D9" or "B2" */ };
  version: number /* bumps on every change */; loadWorkbook(wb: WorkbookData): void; getSelectionValues(): (number|string|boolean|null)[][];
  writeRange(sheet: string, topLeft: string, values: (number|string|null)[][]): void; addSheet(name: string, rows?: (number|string|null)[][]): void }
useModelStore: { model: RiskModel; setModel(m): void; upsertAssumption(a); removeAssumption(id); upsertForecast(f); removeForecast(id);
  upsertDecision(d); removeDecision(id); setCorrelations(c); setSettings(s) }
useSimulationStore: { status: "idle" | "running" | "done" | "error"; progress: number; result: SimulationResult | null; run(): Promise<void>; abort(): void; reset(): void }
useUiStore: { locale: "es" | "en"; setLocale(l); openTool(toolId: string, props?: unknown): void; closeTool(toolId: string): void; openTools: { id: string; props?: unknown }[] }
```
Tools (`apps/web/src/tools/**`, **owned by the tools agent**) are registered in `apps/web/src/tools/registry.ts`:
```ts
export interface ToolDef { id: string; ribbonTab: "analysis" | "forecast" | "optimization" | "finance"; label: I18nText; icon: LucideIcon; component: React.ComponentType<{ onClose(): void }>; size?: "md" | "lg" | "xl" }
export const TOOLS: ToolDef[];
```
The shell renders tools from `TOOLS` as ribbon buttons, and opens each in a resizable modal/window. Shared UI primitives the shell
provides in `apps/web/src/components/ui/*`: `Button`, `Input`, `NumberInput`, `Select`, `Tabs`, `Modal`, `Field`, `Table`, `RangeInput`
(text field + "pick from selection" button that reads `useWorkbookStore.selection`), and `Chart` (`<Chart option={EChartsOption} height={…} />`).
Translations: shell keys in `apps/web/src/i18n/{es,en}.json`, tool keys in `apps/web/src/tools/i18n/{es,en}.json` (namespace `tools`).

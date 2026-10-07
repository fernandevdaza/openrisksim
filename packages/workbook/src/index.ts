export type { CellData, CellStyle, SheetData, WorkbookData, ReportSheet, SimulationJob } from "./types";
export { MODEL_SHEET_NAME } from "./types";

export { parseA1, toA1, parseRange, colToLetters, lettersToCol, normalizeA1, quoteSheetName, translateFormula } from "./address";

export { readXlsx, writeXlsx, stripExcelPrefixes, addExcelPrefixes } from "./xlsx";
export { readCsv, detectDecimalSeparator, detectDelimiter, parseLocaleNumber } from "./csv";

export { SpreadsheetEngine, HF_CONFIG } from "./engine";
export type { EngineValue, RawContent, CellErrorInfo } from "./engine";
export { HF_FUNCTION_NAMES_ES, registeredFunctionNames } from "./functionNames";
export { OrsPlugin, registerOrsFunctions, ORS_FUNCTION_HELP, ORS_FUNCTION_NAMES_ES } from "./orsFunctions";

export { createWorkbookEvaluator } from "./evaluator";
export type { WorkbookEvaluator } from "./evaluator";

export { runSimulationInWorker, runSimulationInline, decisionOverrides } from "./runInWorker";
export {
  runAcceleratedSimulation,
  detectAccelerationCapabilities,
  chooseAccelerationMode,
  resolveWorkerCount,
  hardwareThreads,
  gpuDeviceLabel,
  validateOutputs,
  reasonsText,
  ACCEL_MESSAGES,
  AUTO_GPU_MIN_TRIALS,
  AUTO_MULTICORE_MIN_TRIALS,
  VALIDATION_TRIALS,
  MAX_WORKERS,
} from "./acceleration";
export type { AccelerationCapabilities, AccelerationEnv, AccelerationPlanInput, AccelReason, BackendMode, Bilingual } from "./acceleration";
export { inlinePoolFactory, webWorkerPoolFactory, poolBatchEvaluator, defaultWorkerCount } from "./pool";
export type { ChunkWorker, PoolFactory, PoolInit } from "./pool";
export type { WorkerRequest, WorkerResponse } from "./worker";

export { buildSimulationReport, distributionLabel, distributionParamsText } from "./report";
export { EXAMPLES, buildExample } from "./examples";
export { detectRiskFunctions } from "./riskFunctions";

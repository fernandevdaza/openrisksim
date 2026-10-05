import type { RiskModel } from "@openrisksim/core";

/** One cell of the in-memory workbook (what the grid renders). */
export interface CellData {
  v?: number | string | boolean | null;
  /** Formula without the leading "=". */
  f?: string;
  t?: "n" | "s" | "b" | "e";
  /** Number format (Excel format code). */
  z?: string;
  s?: CellStyle;
}

export interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  /** "#RRGGBB" */
  color?: string;
  /** "#RRGGBB" */
  bg?: string;
  align?: "left" | "center" | "right";
}

export interface SheetData {
  name: string;
  rows: number;
  cols: number;
  /** key: A1 address (no `$`). */
  cells: Record<string, CellData>;
  /** Column widths in Excel character units, keyed by 0-based column index. */
  colWidths?: Record<number, number>;
  /** Merged ranges, "A1:C1". */
  merges?: string[];
}

export interface WorkbookData {
  sheets: SheetData[];
  /** Stored in the hidden sheet "_openrisksim". */
  model: RiskModel | null;
  fileName?: string;
  /** Workbook-level defined names → reference ("Sheet1!$B$2" or "'My sheet'!$A$1:$A$9"). Extension of the documented contract. */
  names?: Record<string, string>;
}

export interface ReportSheet {
  name: string;
  rows: (string | number | null)[][];
  images?: { pngBase64: string; at: string; width: number; height: number }[];
}

/** Simulation job sent to the worker. */
export interface SimulationJob {
  workbook: WorkbookData;
  model: RiskModel;
  /** Decision values keyed by decision id (or by "Sheet!A1" cell key). */
  decisionValues?: Record<string, number>;
}

/** Name of the hidden sheet that stores the model JSON. */
export const MODEL_SHEET_NAME = "_openrisksim";
